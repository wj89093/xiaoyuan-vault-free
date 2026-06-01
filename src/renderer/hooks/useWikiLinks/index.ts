/**
 * index.ts — WikiLinks Extension 聚合导出
 *
 * Usage:
 *   import { wikiLinksExtension, type WikiLinksConfig, ... } from './useWikiLinks'
 */
import { Prec } from '@codemirror/state'
import type { WikiLinksConfig } from './types'
import { wikiLinksCompletionsExtension } from './wikiLinksCompletions'
import { wikiLinksClickHandlerExtension } from './wikiLinksClickHandler'
import { createWikiLinksPlugin } from './wikiLinksPlugin'

export type { WikiLinkStatus, WikiLinkSuggestion, WikiLinkResolvedTarget, WikiLinksConfig, ParsedWikiLink } from './types'

/**
 * The main extension — composes:
 * 1. StateField (decorations)
 * 2. ViewPlugin (async resolution)
 * 3. Autocompletion
 * 4. Click handler
 * 5. Pointer guard
 */
export function wikiLinksExtension(config: WikiLinksConfig = {}): ReturnType<typeof createWikiLinksPlugin>[number] {
  const [field, plugin] = createWikiLinksPlugin(config)

  return Prec.highest([
    field,
    plugin,
    wikiLinksCompletionsExtension(config),
    wikiLinksClickHandlerExtension(config, () => ({ resolved: new Map(), decorations: [] as any })),
  ])
}

// Re-export for direct access to sub-parts
export { WikiLinkWidget } from './WikiLinkWidget'
export { parseWikiLinks, findPartialLinkAt } from './wikiLinksParser'