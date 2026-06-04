/**
 * useFrontmatterWidget/completion.ts — Frontmatter 字段名自动补全
 * 用户打 title: 时弹出常用字段 (title, type, tags, summary, ...)
 */
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { COMMON_PROPERTIES } from '../frontmatter-utils'
import { findFrontmatter } from './detection'

export function frontmatterCompletion(context: CompletionContext): CompletionResult | null {
  const node = syntaxTree(context.state).resolveInner(context.pos)
  if (!node.name.includes('frontmatter') && node.name !== 'Document') {
    const match = findFrontmatter(context.state)
    if (!match) return null
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    if (!before.match(/^\s*\w*:?\s*$/) && !before.match(/^\s*$/)) return null
  }

  const word = context.matchBefore(/\w*/)
  if (!word) return null

  const match = findFrontmatter(context.state)
  const existingKeys = new Set(match?.fields.map((f) => f.key) ?? [])

  return {
    from: word.from,
    options: COMMON_PROPERTIES.filter((k) => !existingKeys.has(k)).map((k) => ({
      label: k,
      type: 'property' as const,
      detail: 'frontmatter'
    })),
    validFor: /^\w*$/
  }
}
