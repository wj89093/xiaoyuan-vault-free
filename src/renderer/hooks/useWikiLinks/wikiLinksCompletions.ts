/**
 * wikiLinksCompletions.ts — Auto-completion for wiki links
 */
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { WikiLinksConfig } from './types'
import { findPartialLinkAt } from './wikiLinksParser'
import { getWikiLinksSuggestionsProvider } from './useWikiLinksSuggestions'

/**
 * Build an autocompletion source from the config's getSuggestions,
 * or fall back to window.__wikiLinkSuggestions (set by App.tsx),
 * or use the local vault file list (window.__vaultFiles) as a fallback.
 */
export function wikiLinksCompletionSource(config: WikiLinksConfig) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const { state, pos } = context

    // Only trigger inside a [[
    const partial = findPartialLinkAt(state.doc, pos)
    if (!partial) return null

    const { partial: query, from, to } = partial

    // 1. Explicit config provider
    // 2. Global vault provider registered via registerWikiLinksSuggestionsProvider
    // 3. Local vault file fallback via window.__vaultFiles
    const explicitProvider = config.getSuggestions
    const globalProvider = getWikiLinksSuggestionsProvider()
    const vaultFiles: any[] = (window as any).__vaultFiles ?? []

    let results: any[] = []
    if (explicitProvider) {
      results = await explicitProvider(query)
    } else if (globalProvider) {
      results = await globalProvider(query)
    } else if (vaultFiles.length > 0) {
      // Local vault file fallback: filter by label match, case-insensitive
      const q = query.toLowerCase()
      results = vaultFiles
        .filter((f: any) => !f.isDirectory && f.name)
        .map((f: any) => ({
          label: f.name.replace(/\.md$/, ''),
          target: f.path,
          detail: f.path,
          boost: 0,
        }))
        .filter((s: any) => s.label.toLowerCase().includes(q))
        .slice(0, 12)
    }

    if (!results.length) return null

    const options: Completion[] = results.map((s: any) => ({
      label: s.label,
      detail: s.detail,
      boost: s.boost,
      apply: (view: any, _completion: any, _from2: number, _to2: number) => {
        const rawText = s.target ? `[[${s.label}]]` : s.label
        const line = state.doc.lineAt(from)
        const lineStart = line.from
        const openIdx = line.text.lastIndexOf('[[', from - lineStart)
        const deleteFrom = lineStart + openIdx
        view.dispatch({
          changes: { from: deleteFrom, to, insert: rawText },
          selection: { anchor: deleteFrom + rawText.length },
        })
      },
    }))

    return {
      from,
      to,
      options,
      validFor: /^[^\]]*$/,
    }
  }
}

/**
 * Build the Completion extension (wraps autocompletion).
 */
export function wikiLinksCompletionsExtension(config: WikiLinksConfig) {
  return autocompletion({
    override: [wikiLinksCompletionSource(config)],
  })
}