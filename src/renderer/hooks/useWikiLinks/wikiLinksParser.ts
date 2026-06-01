/**
 * wikiLinksParser.ts — Wiki link parsing
 *
 * Parses [[target]] and [[target|label]] syntax.
 */
import type { Text } from '@codemirror/state'
import type { ParsedWikiLink } from './types'

const WIKI_LINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g

/**
 * Parse all wiki links in a text range.
 */
export function parseWikiLinks(text: Text, from: number, to: number): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = []
  const textSlice = text.sliceString(from, to)
  let match: RegExpExecArray | null

  WIKI_LINK_REGEX.lastIndex = 0
  while ((match = WIKI_LINK_REGEX.exec(textSlice)) !== null) {
    const raw = match[0]
    const rawFrom = from + match.index
    const rawTo = rawFrom + raw.length
    const target = match[1] ?? match[0].slice(2, -2).split('|')[0]?.trim() ?? ''
    const label = match[2] ?? target
    const sep = match.index + (match[0].indexOf('|') >= 0 ? match[0].indexOf('|') + 1 : 2)

    links.push({ from: rawFrom, to: rawTo, target, label, _raw: raw, _sep: sep })
  }

  return links
}

/**
 * Check if cursor is currently inside an unclosed wiki link.
 * Returns the partial text if inside, null otherwise.
 */
export function findPartialLinkAt(text: Text, cursorPos: number): { partial: string; from: number; to: number } | null {
  const line = text.lineAt(cursorPos)
  const lineText = line.text
  const offsetInLine = cursorPos - line.from

  // Look for [[ before cursor in current line
  const beforeCursor = lineText.slice(0, offsetInLine)
  const openIdx = beforeCursor.lastIndexOf('[[')

  if (openIdx < 0) return null

  // Check there's no ]] between [[ and cursor
  const between = beforeCursor.slice(openIdx + 2)
  if (between.includes(']]')) return null

  // Partial link is everything after [[
  const partial = between
  return { partial, from: line.from + openIdx, to: cursorPos }
}

/**
 * Find the closest wiki link target at a given position.
 */
export function findLinkAtPos(text: Text, pos: number): ParsedWikiLink | null {
  // Search in a small window around pos
  const from = Math.max(0, pos - 200)
  const to = Math.min(text.length, pos + 50)
  const links = parseWikiLinks(text, from, to)
  return links.find(l => pos >= l.from && pos <= l.to) ?? null
}