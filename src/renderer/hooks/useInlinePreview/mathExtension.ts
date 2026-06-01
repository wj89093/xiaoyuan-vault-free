/**
 * mathExtension.ts — KaTeX real-time rendering ($inline$, $$display$$)
 *
 * Architecture:
 *   Inline ($...$):   Decoration.replace(widget, NO block:true) → unifiedDecorations ViewPlugin
 *   Display ($$...$$): Decoration.replace(widget, block:true)    → shared blockDecorationsField
 */
import { Decoration, WidgetType, type EditorView } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import type { DecorationSet, Range } from '@codemirror/view'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { registerBlockMathBuilder } from '../blockDecorationsField'

// ── KaTeX Widget ─────────────────────────────────────────────────────

class KatexWidget extends WidgetType {
  constructor(
    private code: string,
    private displayMode: boolean,
  ) { super() }

  eq(other: KatexWidget): boolean {
    return other.code === this.code && other.displayMode === this.displayMode
  }

  toDOM(_view: EditorView): HTMLElement {
    const el = document.createElement(this.displayMode ? 'div' : 'span')
    try {
      katex.render(this.code, el, {
        displayMode: this.displayMode,
        throwOnError: false,
        trust: true,
        strict: false,
      })
    } catch {
      el.textContent = this.code
      el.style.color = '#ef4444'
    }
    return el
  }

  get estimatedHeight(): number {
    return this.displayMode ? 80 : 28
  }
}

// ── Regex ────────────────────────────────────────────────────────────

/** Extract math code between $...$ or $$...$$ delimiters */
function extractMathCode(match: RegExpMatchArray): string {
  if (match[0].startsWith('$$')) {
    return match[0].slice(2, -2).trim()
  }
  return match[0].slice(1, -1)
}

// ── Inline Math Decorations (for unifiedDecorations ViewPlugin) ─────

export function buildInlineMathDecorations(docText: string): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = []
  const RE = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/g
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(docText)) !== null) {
    const isDisplay = m[0].startsWith('$$')
    if (!isDisplay) {
      const code = extractMathCode(m)
      ranges.push(
        Decoration.replace({
          widget: new KatexWidget(code, false),
        }).range(m.index, m.index + m[0].length),
      )
    }
  }
  return ranges
}

// ── Block Math Decorations (for blockDecorationsField) ──────────────

export function buildBlockMathDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const doc = state.doc.toString()
  const RE = /\$\$[\s\S]+?\$\$/g
  RE.lastIndex = 0
  let m
  while ((m = RE.exec(doc)) !== null) {
    const code = extractMathCode(m)
    decorations.push(
      Decoration.replace({
        widget: new KatexWidget(code, true),
        block: true,
      }).range(m.index, m.index + m[0].length),
    )
  }
  return decorations.length
    ? Decoration.set(decorations.sort((a: any, b: any) => a.from - b.from), true)
    : Decoration.none
}

// Register block math with shared blockDecorationsField
registerBlockMathBuilder(buildBlockMathDecorations)
