/**
 * editorInputHelpers.ts — Atomic-editor-style input handlers
 *
 * 1. extendEmphasisPair  — Obsidian-style **foo** typing: type `*` inside `**|**`
 *                          becomes `**|**` ready for content (one keystroke).
 * 2. autoCloseCodeFence  — Type `` ``` `` at line start → auto-insert closing fence.
 * 3. insertTightListItem — Enter on an empty tight list item: dedent or delete.
 *
 * All use Prec.high / Prec.highest to beat CM6's built-in closeBrackets handler.
 */
import { Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

// ── 1. Emphasis pair extension ────────────────────────────────────────────────

/**
 * When the cursor is between two matching `*` or `_` characters (an empty pair
 * inserted by closeBrackets), typing the same delimiter again should extend
 * the pair rather than step through the closer.
 *
 * `*|*` → `**|**` (one keystroke, not two)
 */
export const extendEmphasisPair = Prec.high(
  EditorView.inputHandler.of((view: EditorView, from: number, to: number, text: string) => {
    if (text !== '*' && text !== '_') return false
    const { state } = view
    const sel = state.selection.main
    if (!sel.empty || from !== to) return false

    const before = state.doc.sliceString(Math.max(0, from - 1), from)
    const after = state.doc.sliceString(from, Math.min(state.doc.length, from + 1))
    if (before !== text || after !== text) return false

    view.dispatch({
      changes: { from, insert: text + text },
      selection: { anchor: from + 1 },
    })
    return true
  }),
)

// ── 2. Auto-close code fence ─────────────────────────────────────────────────

function isInsideFencedCodeBeforeLine(doc: string, lineNumber: number): boolean {
  const lines = doc.split('\n')
  let marker: '`' | '~' | null = null
  let markerLength = 0

  for (let i = 0; i < lineNumber - 1; i++) {
    const match = lines[i].match(/^(\s{0,3})(`{3,}|~{3,})/)
    if (!match) continue
    const currentMarker = match[2][0] as '`' | '~'
    const currentLength = match[2].length
    if (!marker) {
      marker = currentMarker
      markerLength = currentLength
    } else if (currentMarker === marker && currentLength >= markerLength) {
      marker = null
      markerLength = 0
    }
  }

  return marker !== null
}

function autoCloseCodeFenceInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (text !== '`' || from !== to) return false

  const { state } = view
  const line = state.doc.lineAt(from)
  const before = state.doc.sliceString(line.from, from)
  const after = state.doc.sliceString(from, line.to)
  const match = before.match(/^(\s{0,3})``?$/)
  if (!match) return false
  if (after !== '' && after !== '`') return false
  if (isInsideFencedCodeBeforeLine(state.doc.toString(), line.number)) return false

  const indent = match[1]
  const replaceTo = after === '`' ? from + 1 : from
  const insert = '`\n' + indent + '```'
  view.dispatch({
    changes: { from, to: replaceTo, insert },
    selection: { anchor: from + 1 },
  })
  return true
}

/**
 * Type `` ``` `` at the start of a line → auto-insert closing `` ``` ``.
 * Cursor stays after the opening fence so the user can type an info string.
 */
export const autoCloseCodeFence = Prec.highest(
  EditorView.inputHandler.of(autoCloseCodeFenceInput),
)

// ── 3. Tight list item Enter behavior ───────────────────────────────────────

/**
 * In a tight list, pressing Enter on an empty item should:
 * - Dedent if the item has content above it (new empty item = continuation)
 * - Delete the item entirely if it's the only item (no orphaned bullet)
 */
function insertTightListItem(view: EditorView): boolean {
  const { state } = view
  const sel = state.selection.main
  const line = state.doc.lineAt(sel.from)
  const lineText = line.text

  // Only intercept when the line is (almost) empty: just the marker + optional space
  const stripped = lineText.replace(/^\s*[-*+](\s|$)/, '')
  if (stripped !== '' && stripped !== '/') return false

  const lineNum = line.number
  if (lineNum === 1) return false

  // Walk up to find the previous non-empty line
  let prevLineNum = lineNum - 1
  while (prevLineNum >= 1) {
    const prev = state.doc.line(prevLineNum)
    const prevText = prev.text.trim()
    if (prevText !== '') break
    prevLineNum--
  }

  if (prevLineNum < 1) return false

  const prevLine = state.doc.line(prevLineNum)
  const prevStripped = prevLine.text.replace(/^\s*[-*+](\s|$)/, '')

  // If the previous line is also a tight list item, dedent → create new list item
  const markerMatch = lineText.match(/^(\s*)([-*+])( +)(.*)$/)
  if (!markerMatch) return false
  const [, indent, marker, space] = markerMatch

  // Determine dedent: one level fewer of leading whitespace (or remove the indent)

  if (prevStripped === '') {
    // Previous line is also empty → delete this line entirely
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '' },
      selection: { anchor: line.from },
    })
    return true
  }

  // Dedent by removing one indent level (4 spaces or the previous indent)
  const newIndent = indent.length > 4 ? indent.slice(0, -4) : ''
  const newLine = newIndent + marker + space
  view.dispatch({
    changes: {
      from: line.from,
      to: line.to,
      insert: newLine,
    },
    selection: { anchor: line.from + newLine.length },
  })
  return true
}

/**
 * Tight list Enter handler — wraps insertTightListItem in a Prec.highest keymap
 * so it fires before CM6's default Enter handler.
 */
export const tightListKeymap = Prec.highest(
  keymap.of([{ key: 'Enter', run: insertTightListItem }]),
)