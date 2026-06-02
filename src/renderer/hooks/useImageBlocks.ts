/**
 * useImageBlocks.ts — Markdown Image Rendering
 *
 * Based on kenforthewin/atomic-editor image-blocks.ts
 *
 * Renders `![alt](url)` as a block-level image widget below its source line.
 * Also renders `@image#N:filename` as an inline referenced image.
 * Uses dimensionCache to prevent iOS scroll animation halts on remount.
 * Skips images inside tables (table widget handles them).
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
  type Transaction
} from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { treeGrowthEffect, treeProgressPlugin } from './useInlinePreview'

// ── Vault path cache (set externally before editor mounts) ───────────────────

/**
 * Resolve an @image filename to a `file://` URL.
 * Tries: {vault}/{name} → {vault}/assets/{name}
 * Uses window.__vaultPath set by App.tsx.
 */
function resolveImageFileUrl(filename: string): string {
  const name = filename.trim()
  const vp: string | null = (window as any).__vaultPath ?? null
  if (!vp) return name
  return `file://${vp}/${name}`
}

function getVaultPath(): string | null {
  return (window as any).__vaultPath ?? null
}

// ── Dimension Cache (prevents iOS scroll halts on remount) ───────────────────

const dimensionCache = new Map<string, { w: number; h: number }>()

// ── Image Widget ─────────────────────────────────────────────────────────────

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super()
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-atomic-image'
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.loading = 'lazy'

    // Pre-size from cache to prevent remount height animation
    const cached = dimensionCache.get(this.src)
    if (cached) {
      img.width = cached.w
      img.height = cached.h
    } else {
      img.addEventListener('load', () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          dimensionCache.set(this.src, { w: img.naturalWidth, h: img.naturalHeight })
        }
      })
    }

    // Click image → focus source line
    const onPointer = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = view.posAtDOM(wrap)
      if (pos < 0) return
      const target = Math.max(0, pos - 1)
      view.focus()
      view.dispatch({ selection: { anchor: target }, scrollIntoView: false })
    }
    wrap.addEventListener('mousedown', onPointer)
    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click'
  }
}

// ── Inline @image Widget ────────────────────────────────────────────────────

/** Inline image rendered from `@image#N:filename` syntax.
 *  Uses file:// protocol + onerror fallback to resolve vault-relative paths. */
class InlineImageWidget extends WidgetType {
  private _triedFallback = false

  constructor(
    readonly filename: string,
    readonly refNum: string
  ) {
    super()
  }

  eq(other: InlineImageWidget): boolean {
    return other.filename === this.filename && other.refNum === this.refNum
  }

  toDOM(_view: EditorView): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'cm-atomic-inline-image'
    wrap.style.cssText = 'display:inline-block;vertical-align:middle;margin:0 2px'

    const img = document.createElement('img')
    img.style.cssText = 'max-height:200px;max-width:400px;border-radius:4px;object-fit:contain'
    img.loading = 'lazy'
    img.alt = this.filename

    const primary = resolveImageFileUrl(this.filename)
    img.src = primary

    // onerror: try fallback path
    img.addEventListener(
      'error',
      () => {
        if (this._triedFallback) return
        this._triedFallback = true
        const vp = getVaultPath()
        if (!vp) return
        img.src = `file://${vp}/assets/${this.filename}`

        img.addEventListener('error', () => {}, { once: true }) // silence final failure
      },
      { once: true }
    )

    wrap.appendChild(img)
    return wrap
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

function buildImageBlocks(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)

  tree.iterate({
    enter(node) {
      if (node.name !== 'Image') return
      // Skip images inside tables — table widget handles them
      for (let p = node.node.parent; p; p = p.parent) {
        if (p.name === 'Table') return
      }

      const raw = state.doc.sliceString(node.from, node.to)
      const match = raw.match(/^!\[([^\]]*)\]\(([^\s)"']+)(?:\s+["'][^)]*["'])?\)$/)
      if (!match) return
      const [, alt, src] = match
      if (!src) return

      const line = state.doc.lineAt(node.from)
      ranges.push(
        Decoration.widget({
          widget: new ImageWidget(src, alt),
          block: true,
          // side: 1 places widget after the line content
          side: 1
        }).range(line.to)
      )
    }
  })

  // ── @image#N:filename inline references ──────────────────────────────
  const AT_IMAGE_RE = /@image#(\d+):(\S+)/g
  const doc = state.doc.toString()
  let m: RegExpExecArray | null
  while ((m = AT_IMAGE_RE.exec(doc)) !== null) {
    const from = m.index
    const to = from + m[0].length
    const refNum = m[1]
    const filename = m[2]
    ranges.push(
      Decoration.replace({
        widget: new InlineImageWidget(filename, refNum)
      }).range(from, to)
    )
  }

  return Decoration.set(ranges, true)
}

// ── Change Detection ─────────────────────────────────────────────────────────

function changeAffectsImages(tr: Transaction, existing: DecorationSet): boolean {
  let affected = false
  tr.changes.iterChanges((fromA, toA) => {
    if (affected) return
    existing.between(fromA, toA, () => {
      affected = true
      return false
    })
  })
  if (affected) return true

  const state = tr.state
  tr.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    if (affected) return
    const startLine = state.doc.lineAt(fromB)
    const endLine = toB > startLine.to ? state.doc.lineAt(toB) : startLine
    for (let n = startLine.number; n <= endLine.number; n++) {
      const text = state.doc.line(n).text
      if (text.includes('![') || text.includes('@image#')) {
        affected = true
        break
      }
    }
  })
  return affected
}

// ── StateField ──────────────────────────────────────────────────────────────

const imageBlocksField = StateField.define<DecorationSet>({
  create: (state) => buildImageBlocks(state),
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(treeGrowthEffect)) return buildImageBlocks(tr.state)
    }
    if (!tr.docChanged) return deco
    const mapped = deco.map(tr.changes)
    if (!changeAffectsImages(tr, deco)) return mapped
    return buildImageBlocks(tr.state)
  },
  provide: (f) => EditorView.decorations.from(f)
})

// ── Extension ──────────────────────────────────────────────────────────────

export function imageBlocksExtension(): Extension {
  return [imageBlocksField, treeProgressPlugin]
}
