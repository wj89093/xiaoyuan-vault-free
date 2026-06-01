/**
 * helpers.ts — WikiLinks 工具函数
 */
import type { EditorState } from '@codemirror/state'
import type { ParsedWikiLink, WikiLinkSuggestion, WikiLinksConfig } from './types'

export function wikiLinkElementFromEvent(event: MouseEvent, root?: HTMLElement): HTMLElement | null {
  const target = event.target as Element
  if (!(target instanceof Element)) return null
  const link = target.closest<HTMLElement>('[data-wiki-link-target]')
  if (!link || (root && !root.contains(link))) return null
  return link
}

export function defaultSerializeSuggestion(s: WikiLinkSuggestion): string {
  return `${s.target}|${s.label.replace(/[\]|]/g, ' ').trim()}]]`
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export function leadingWhitespaceLength(value: string): number {
  return value.match(/^\s*/)?.[0].length ?? 0
}

export function trailingWhitespaceLength(value: string): number {
  return value.match(/\s*$/)?.[0].length ?? 0
}

export function isInsideAny(pos: number, spans: readonly { from: number; to: number }[]): boolean {
  return spans.some(s => pos >= s.from && pos < s.to)
}

export function isSelectionInsideLink(state: EditorState, link: ParsedWikiLink): boolean {
  return state.selection.ranges.some(r => {
    const from = Math.min(r.from, r.to), to = Math.max(r.from, r.to)
    return r.empty ? (from > link.from && from < link.to) : (from < link.to && to > link.from)
  })
}

export function isSingleLineRange(state: EditorState, from: number, to: number): boolean {
  return state.doc.lineAt(from).number === state.doc.lineAt(Math.max(from, to - 1)).number
}

export function shouldResolveWikiLink(config: WikiLinksConfig, target: string): boolean {
  return config.shouldResolve?.(target) ?? true
}