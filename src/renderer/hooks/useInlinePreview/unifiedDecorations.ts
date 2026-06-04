/**
 * unifiedDecorations.ts — Single tree-walk inline preview for 晓园 Vault
 *
 * Ported from @atomic/editor's inline-preview.ts architecture:
 * 1. ensureSyntaxTree(state, doc.length, 200) — full parse with budget
 * 2. treeGrowthEffect — triggers rebuild when lezer advances in idle ticks
 * 3. freezeMousePlugin — prevents "reveal" during mouse clicks
 * 4. pushReplace — splits cross-line Decoration.replace per line
 * 5. Single tree walk — builds ALL decorations (headings, tasks, bullets,
 *    link links, wiki links, syntax hiding) in one pass
 *
 * CSS classes prefix: `cm-atomic-*` (晓园 Vault atomic-editor convention)
 */
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language'
import {
  EditorSelection,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Range,
  type Text
} from '@codemirror/state'
import {
  Decoration,
  type EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { treeGrowthEffect, treeProgressPlugin } from './freezableStates'
import { buildInlineMathDecorations } from './mathExtension'
import { buildCalloutDecorations } from './calloutExtension'

// ── Configuration ──────────────────────────────────────────────────────

export interface UnifiedDecorationsConfig {
  onLinkClick?: (url: string) => void
  onWikiLinkClick?: (target: string) => void
}

// ── Freeze plumbing ────────────────────────────────────────────────────

const setFrozen = StateEffect.define<boolean>()

const previewFrozenField = StateField.define<boolean>({
  create: () => false,
  update(prev, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFrozen)) return effect.value
    }
    return prev
  }
})

const FREEZE_TAIL_MS = 100

// ── Freeze mouse plugin ────────────────────────────────────────────────

const freezeMousePlugin = ViewPlugin.fromClass(
  class {
    private down = false
    private releaseTimer: number | null = null
    private readonly onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Node) || !this.view.contentDOM.contains(target)) return
      this.down = true
      if (this.releaseTimer != null) {
        window.clearTimeout(this.releaseTimer)
        this.releaseTimer = null
      }
      if (!this.view.state.field(previewFrozenField)) {
        this.view.dispatch({ effects: setFrozen.of(true) })
      }
    }
    private readonly onUp = () => {
      if (!this.down) return
      this.down = false
      if (this.releaseTimer != null) window.clearTimeout(this.releaseTimer)
      this.releaseTimer = window.setTimeout(() => {
        this.releaseTimer = null
        if (!this.view.state.field(previewFrozenField)) return
        try {
          this.view.dispatch({ effects: setFrozen.of(false) })
        } catch {
          /* view gone */
        }
      }, FREEZE_TAIL_MS)
    }
    constructor(readonly view: EditorView) {
      view.dom.addEventListener('pointerdown', this.onDown, true)
      window.addEventListener('pointerup', this.onUp)
      window.addEventListener('pointercancel', this.onUp)
    }
    update(_: ViewUpdate) {}
    destroy() {
      this.view.dom.removeEventListener('pointerdown', this.onDown, true)
      window.removeEventListener('pointerup', this.onUp)
      window.removeEventListener('pointercancel', this.onUp)
      if (this.releaseTimer != null) window.clearTimeout(this.releaseTimer)
    }
  }
)

// ── Widgets ────────────────────────────────────────────────────────────

// v1.5 perf: Widget 单例复用 — 只有 checked true/false 两种
const CHECKBOX_CHECKED = new TaskCheckboxWidget(true)
const CHECKBOX_UNCHECKED = new TaskCheckboxWidget(false)

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.checked
    input.className = 'cm-atomic-list-marker cm-atomic-task-checkbox'
    input.setAttribute('contenteditable', 'false')
    input.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    input.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = view.posAtDOM(input)
      if (pos < 0) return
      const current = view.state.doc.sliceString(pos, pos + 3)
      const next = /\[x\]/i.test(current) ? '[ ]' : '[x]'
      if (current === next) return
      view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } })
    })
    return input
  }
  ignoreEvent(event: Event) {
    return event.type === 'mousedown' || event.type === 'click'
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-atomic-list-marker cm-atomic-bullet'
    span.textContent = '•'
    return span
  }
  ignoreEvent() {
    return false
  }
}
const BULLET_WIDGET = new BulletWidget()

class EmbedWidget extends WidgetType {
  constructor(readonly noteRef: string) {
    super()
  }
  eq(other: EmbedWidget) {
    return other.noteRef === this.noteRef
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-atomic-embed'
    wrap.setAttribute('contenteditable', 'false')
    wrap.textContent = `📄 Embedded: ${this.noteRef}`
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

// ── Line classes for block nodes ───────────────────────────────────────

const LINE_CLASS_BY_BLOCK: Record<string, string> = {
  ATXHeading1: 'cm-atomic-h1',
  ATXHeading2: 'cm-atomic-h2',
  ATXHeading3: 'cm-atomic-h3',
  ATXHeading4: 'cm-atomic-h4',
  ATXHeading5: 'cm-atomic-h5',
  ATXHeading6: 'cm-atomic-h6',
  SetextHeading1: 'cm-atomic-h1',
  SetextHeading2: 'cm-atomic-h2',
  Blockquote: 'cm-atomic-blockquote',
  FencedCode: 'cm-atomic-fenced-code'
}

const INLINE_MARK_CLASS: Record<string, string> = {
  StrongEmphasis: 'cm-atomic-strong',
  Emphasis: 'cm-atomic-em',
  InlineCode: 'cm-atomic-inline-code',
  Strikethrough: 'cm-atomic-strike',
  Link: 'cm-atomic-link'
}

const HIDEABLE_SYNTAX = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'URL',
  'LinkTitle',
  'StrikethroughMark',
  'QuoteMark'
])

// ── Cross-line safe replace ────────────────────────────────────────────

function pushReplace(
  ranges: Range<Decoration>[],
  doc: Text,
  from: number,
  to: number,
  spec: Parameters<typeof Decoration.replace>[0] = {}
): void {
  if (from >= to) return
  const startLine = doc.lineAt(from)
  if (to <= startLine.to) {
    ranges.push(Decoration.replace(spec).range(from, to))
    return
  }
  let cursor = from
  let firstSegment = true
  while (cursor < to) {
    const line = doc.lineAt(cursor)
    const segEnd = Math.min(to, line.to)
    if (segEnd > cursor) {
      ranges.push(Decoration.replace(firstSegment ? spec : {}).range(cursor, segEnd))
      firstSegment = false
    }
    cursor = line.to + 1
  }
}

// ── Supplement mid-typing emphasis (from atomic-editor) ──────────────
// When the user is typing, Lezer may not have parsed the full syntax yet.
// This scans active lines for unmatched emphasis markers and pre-styles them.

const EMPHASIS_PATTERNS: { re: RegExp; markClass: string }[] = [
  { re: /\*\*([^*]+)\*\*|(?<=\*\*)[^*]+$|^\*\*[^*]+$/g, markClass: 'cm-atomic-strong' },
  { re: /\*([^*]+)\*|(?<=\*)[^*]+$|^\*[^*]+$/g, markClass: 'cm-atomic-em' },
  { re: /~~([^~]+)~~|(?<=~~)[^~]+$|^~~[^~]+$/g, markClass: 'cm-atomic-strike' },
  { re: /`([^`]+)`|(?<=`)[^`]+$|^`[^`]+$/g, markClass: 'cm-atomic-inline-code' }
]

function supplementMidTypingEmphasis(
  ranges: Range<Decoration>[],
  doc: Text,
  activeLines: Set<number>,
  hasFocus: boolean
): void {
  if (!hasFocus || activeLines.size === 0) return
  // Only scan active lines where the cursor is
  for (const lineNum of activeLines) {
    if (lineNum < 1 || lineNum > doc.lines) continue
    const line = doc.line(lineNum)
    const text = line.text
    if (text.length === 0) continue
    for (const pattern of EMPHASIS_PATTERNS) {
      pattern.re.lastIndex = 0
      let em: RegExpExecArray | null
      while ((em = pattern.re.exec(text)) !== null) {
        const from = line.from + em.index
        const to = from + em[0].length
        // Skip if any matched content already has our class (already parsed)
        ranges.push(Decoration.mark({ class: pattern.markClass }).range(from, to))
      }
    }
  }
}

// ── Build ALL decorations in one tree walk ─────────────────────────────

function buildAllDecorations(view: EditorView, docChanged = true): DecorationSet {
  const { state } = view
  const { doc } = state
  const ranges: Range<Decoration>[] = []

  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state)

  // ── 1. Collect metadata ──────────────────────────────────────────────
  const taskMarkerByLine = new Map<number, number>()
  const blockLines = new Set<number>()
  let _lastHeadingLine = -1

  tree.iterate({
    enter(node) {
      if (!node.name) return
      const lineNum = doc.lineAt(node.from).number

      if (node.name === 'TaskMarker') {
        taskMarkerByLine.set(lineNum, node.from)
        // If task is checked, dim the whole line
        const markerText = doc.sliceString(node.from, node.to)
        if (/\[x\]/i.test(markerText)) {
          ranges.push(
            Decoration.line({ class: 'cm-atomic-task-done' }).range(doc.line(lineNum).from)
          )
        }
      }

      if (LINE_CLASS_BY_BLOCK[node.name]) {
        // ATXHeading, SetextHeading, Blockquote, FencedCode — decorate every line
        const firstLine = doc.lineAt(node.from).number
        const lastLine = doc.lineAt(Math.max(node.from, node.to - 1)).number
        for (let n = firstLine; n <= lastLine; n++) {
          blockLines.add(n)
          const blockClass = LINE_CLASS_BY_BLOCK[node.name]
          const line = doc.line(n)
          ranges.push(Decoration.line({ class: blockClass }).range(line.from))
        }
        if (node.name.startsWith('ATXHeading') || node.name === 'SetextHeading') {
          _lastHeadingLine = lastLine
        }
      }
    }
  })

  // ── 2. Active lines (has focus + selection) ──────────────────────────
  const activeLines = new Set<number>()
  if (view.hasFocus) {
    for (const r of state.selection.ranges) {
      const firstLine = doc.lineAt(r.from).number
      const lastLine = doc.lineAt(Math.max(r.from, r.to - 1)).number
      for (let n = firstLine; n <= lastLine; n++) activeLines.add(n)
    }
  }

  // ── 3. Second pass: syntax hiding, marks, widgets ────────────────────
  tree.iterate({
    enter(node) {
      if (!node.name || node.from >= doc.length) return

      const from = node.from,
        to = node.to
      const lineNum = doc.lineAt(from).number
      const isActive = activeLines.has(lineNum)

      // Hide syntax tokens on inactive lines
      if (!isActive && HIDEABLE_SYNTAX.has(node.name)) {
        pushReplace(ranges, doc, from, to)
        return
      }

      // ── Task Marker → Checkbox Widget ────────────────────────────────
      if (node.name === 'TaskMarker') {
        const markerText = doc.sliceString(from, to)
        const checked = /\[x\]/i.test(markerText)
        ranges.push(Decoration.replace({ widget: checked ? CHECKBOX_CHECKED : CHECKBOX_UNCHECKED }).range(from, to))
        return
      }

      // ── Bullet List → Bullet Widget (on inactive lines) ──────────────
      if (!isActive && node.name === 'ListMark') {
        const parent = node.parent
        if (parent?.name === 'BulletList' || parent?.name === 'TaskList') {
          pushReplace(ranges, doc, from, to, { widget: BULLET_WIDGET })
        }
        return
      }

      // ── HR on inactive ──────────────────────────────────────────────
      if (!isActive && node.name === 'HorizontalRule') {
        const line = doc.lineAt(from)
        pushReplace(ranges, doc, from, to)
        ranges.push(Decoration.line({ class: 'cm-atomic-hr' }).range(line.from))
        return
      }

      // ── Inline mark classes on active lines ─────────────────────────
      if (isActive) {
        const className = INLINE_MARK_CLASS[node.name]
        if (className) {
          ranges.push(Decoration.mark({ class: className }).range(from, to))
        }
      }

      // ── Tags on inactive lines ──────────────────────────────────────
      if (!isActive && node.name === 'Link') {
        // Check if it might be a tag (starts with #)
        // Note: Lezer doesn't handle '#tag', so we do a text-level regex
      }
    }
  })

  // ── 4. Text-level decorations (regex — tags, callouts) ────────────────
  const docText = doc.toString()

  // Tags (#tagname) — Unicode-aware
  const TAG_RE = /#[\p{L}\p{N}_-]+/gu
  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(docText)) !== null) {
    ranges.push(
      Decoration.mark({ class: 'cm-atomic-tag' }).range(match.index, match.index + match[0].length)
    )
  }

  // Callouts — Obsidian-style block-level callouts
  ranges.push(...buildCalloutDecorations(doc))

  // Inline math ($...$) — KaTeX rendered inline widgets
  // Block math ($$...$$) handled by blockDecorationsField (mathExtension)
  ranges.push(...buildInlineMathDecorations(docText))

  // Wiki links ([[..|..]])
  const WIKI_RE = /\[\[([^\]]+)\]\]/g
  WIKI_RE.lastIndex = 0
  while ((match = WIKI_RE.exec(docText)) !== null) {
    const target = match[1].includes('|') ? match[1].split('|')[0].trim() : match[1].trim()
    ranges.push(
      Decoration.mark({
        class: 'cm-atomic-wiki-link',
        attributes: { 'data-wiki-link-target': target }
      }).range(match.index, match.index + match[0].length)
    )
  }

  // Embeds (![[note]] / ![text](url)) — only on inactive lines
  const EMBED_RE = /!\[\[([^\]]+)\]\]/g
  EMBED_RE.lastIndex = 0
  while ((match = EMBED_RE.exec(docText)) !== null) {
    const embedFrom = match.index
    const embedTo = embedFrom + match[0].length
    const embedLine = doc.lineAt(embedFrom)
    const embedLineNum = embedLine.number
    const isEmbedActive = activeLines.has(embedLineNum)
    if (!isEmbedActive && embedTo <= embedLine.to) {
      ranges.push(
        Decoration.replace({ widget: new EmbedWidget(match[1].trim()) }).range(embedFrom, embedTo)
      )
    }
  }

  // ── 5. Supplement mid-typing emphasis (from atomic-editor) ────────────
  // Styles incomplete **bold** / *italic* / ~~strike~~ / `code` while typing
  // v1.5 perf: 只在 docChanged 时跑 (selection-only 变化不需要)
  if (docChanged) supplementMidTypingEmphasis(ranges, doc, activeLines, view.hasFocus)

  // v1.5 perf: 已排序时跳过 sort (tree.iterate 顺序遍历, 大多数情况已有序)
  let sorted = true
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].from < ranges[i - 1].from) { sorted = false; break }
  }
  if (!sorted) ranges.sort((a: any, b: any) => a.from - b.from)
  return Decoration.set(ranges, true)
}

// ── ViewPlugin ─────────────────────────────────────────────────────────

const inlinePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    // v1.5: decoration cache — viewport-only 变化时跳过重建
    private _cacheKey: string
    constructor(view: EditorView) {
      this._cacheKey = ''
      this.decorations = buildAllDecorations(view)
      this._cacheKey = this._makeKey(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged
      ) {
        const key = this._makeKey(update.view)
        if (key === this._cacheKey) return // viewport-only 变化, 跳过
        this.decorations = buildAllDecorations(update.view, update.docChanged)
        this._cacheKey = key
      }
    }
    private _makeKey(view: EditorView): string {
      const { state } = view
      // doc version + selection anchor (合并成 cache key)
      const sel = state.selection.main
      return `${state.doc.length}:${sel.anchor}:${sel.head}:${view.hasFocus}`
    }
  },
  { decorations: (v) => v.decorations }
)

// ── Tight list Enter handler ───────────────────────────────────────────

function insertTightListItem(view: EditorView): boolean {
  const { state } = view
  const sel = state.selection.main
  if (!sel.empty) return false
  const from = sel.from
  const line = state.doc.lineAt(from)
  const tree = syntaxTree(state)
  const cursor = tree.resolveInner(from, -1).cursor()
  let inBulletList = false
  for (;;) {
    if (cursor.name === 'BulletList' || cursor.name === 'TaskList') {
      inBulletList = true
      break
    }
    if (!cursor.parent()) break
  }
  if (!inBulletList) return false
  const lineText = state.doc.sliceString(line.from, line.to)
  const prefix = lineText.match(/^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s*)?/)
  if (!prefix) return false
  const [whole, indent] = prefix
  const rest = lineText.slice(whole.length)
  if (!rest.trim()) {
    // Empty list item → dedent or delete
    const depth = Math.floor(indent.length / 2)
    if (depth >= 1) {
      const outerIndent = indent.slice(0, indent.length - 2)
      const marker = prefix[2]
      const taskPrefix = prefix[4] || ''
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: `${outerIndent}${marker} ${taskPrefix}` },
        selection: EditorSelection.cursor(
          line.from + outerIndent.length + marker.length + 1 + taskPrefix.length
        )
      })
    } else {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: EditorSelection.cursor(line.from)
      })
    }
    return true
  }
  const marker = prefix[2]
  const taskPrefix = prefix[4] || ''
  const insert = `\n${indent}${marker} ${taskPrefix}`
  view.dispatch({
    changes: { from, to: from, insert },
    selection: EditorSelection.cursor(from + insert.length)
  })
  return true
}

// ── Public export ──────────────────────────────────────────────────────

export function unifiedDecorationsExtension(_config: UnifiedDecorationsConfig = {}): Extension {
  return [
    previewFrozenField,
    inlinePreviewPlugin,
    freezeMousePlugin,
    treeProgressPlugin,
    Prec.highest(keymap.of([{ key: 'Enter', run: insertTightListItem }]))
  ]
}

export { treeGrowthEffect, previewFrozenField, treeProgressPlugin, freezeMousePlugin }
