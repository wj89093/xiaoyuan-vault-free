/**
 * calloutExtension.ts — Minimal Obsidian-style callouts
 *
 * Syntax: > [!type][+/-] Title
 *
 * Line-based detection: scans lines for callout markers, collects blocks,
 * then applies ONE Decoration.line per line.
 */
import { Decoration } from '@codemirror/view'
import type { Text } from '@codemirror/state'
import type { Range } from '@codemirror/state'

interface Block {
  type: string
  first: number
  last: number
}

export function buildCalloutDecorations(doc: Text): Range<Decoration>[] {
  const blocks: Block[] = []
  let current: Block | null = null

  // Pass 1: collect blocks
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text
    const m = text.match(/^>\s*\[!(note|tip|warning|danger|info|example|success)\]/)

    if (m) {
      current = { type: m[1], first: n, last: n }
      blocks.push(current)
    } else if (current && text.trimStart().startsWith('>')) {
      current.last = n
    } else {
      current = null
    }
  }

  // Pass 2: build decorations
  const ranges: Range<Decoration>[] = []
  for (const b of blocks) {
    for (let n = b.first; n <= b.last; n++) {
      const isFirst = n === b.first
      const isLast = n === b.last
      const cls = `cm-atomic-callout cm-atomic-callout-${b.type}${isFirst ? ' cm-atomic-callout-first' : ''}${isLast ? ' cm-atomic-callout-last' : ''}`
      ranges.push(Decoration.line({ class: cls }).range(doc.line(n).from))
    }
  }

  return ranges
}
