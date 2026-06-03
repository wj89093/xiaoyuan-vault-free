/**
 * useWikiLinks.ts — Wiki Link Rendering & Navigation
 *
 * Re-export facade for the new modular structure.
 * All implementation has moved to ./useWikiLinks/
 *
 * Usage (unchanged):
 *   import { wikiLinksExtension, type WikiLinksConfig, ... } from './useWikiLinks/index'
 */
export {
  wikiLinksExtension,
  WikiLinkWidget,
  parseWikiLinks,
  findPartialLinkAt,
  type WikiLinkStatus,
  type WikiLinkSuggestion,
  type WikiLinkResolvedTarget,
  type WikiLinksConfig,
  type ParsedWikiLink
} from './useWikiLinks/index'
