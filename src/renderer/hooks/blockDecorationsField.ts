/**
 * blockDecorationsField.ts — Single StateField for ALL block-level decorations
 *
 * Mermaid + Frontmatter + Block Math (KaTeX $$) all need
 * Decoration.replace({ widget, block: true }), which must come from
 * StateField.provide. Only ONE StateField can provide decorations
 * (EditorView.decorations Facet uses first-value-wins).
 */
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view'

// ── Builder registry ─────────────────────────────────────────────────

type BuilderFn = (state: EditorState) => DecorationSet

const builders: { name: string; fn: BuilderFn }[] = []

export function registerMermaidBuilder(fn: BuilderFn) {
  builders.push({ name: 'mermaid', fn })
}
export function registerFrontmatterBuilder(fn: BuilderFn) {
  builders.push({ name: 'frontmatter', fn })
}
export function registerBlockMathBuilder(fn: BuilderFn) {
  builders.push({ name: 'block-math', fn })
}

// ── Combined decorations ─────────────────────────────────────────────

function buildAllBlockDecorations(state: EditorState): DecorationSet {
  const allRanges: Range<Decoration>[] = []

  for (const { fn } of builders) {
    const decos = fn(state)
    if (decos !== Decoration.none) {
      decos.between(0, state.doc.length, (from, to, value) => {
        allRanges.push({ from, to, value } as Range<Decoration>)
      })
    }
  }

  return allRanges.length > 0
    ? Decoration.set(
        allRanges.sort((a, b) => a.from - b.from),
        true
      )
    : Decoration.none
}

// ── Single shared StateField ─────────────────────────────────────────

export const blockDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildAllBlockDecorations(state)
  },
  update(decos, tr) {
    if (tr.docChanged || tr.viewportChanged) {
      return buildAllBlockDecorations(tr.state)
    }
    return decos.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f)
})
