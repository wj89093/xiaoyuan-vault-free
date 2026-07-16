/**
 * useWikiLinksSuggestions.ts — Vault file-based suggestion provider for wiki link completion
 *
 * Exposes getSuggestions() on window.__wikiLinkSuggestions so the wiki links extension
 * can use it without tight coupling to the vault state.
 */
import type { WikiLinkSuggestion } from './types'
import type { FileInfo } from '../../types'

// Global suggestion provider (set by App.tsx when vault files are loaded)
let _getSuggestions: ((query: string) => Promise<WikiLinkSuggestion[]>) | null = null

// The raw vault files list (updated when vault loads/changes)
let _vaultFiles: FileInfo[] = []

function _fileInfoToSuggestion(file: FileInfo): WikiLinkSuggestion {
  const label = file.path.split('/').pop()?.replace(/\.md$/, '') ?? file.name
  return {
    target: file.path,
    label,
    detail: file.path,
    boost: 0
  }
}

export function updateVaultFiles(files: FileInfo[]): void {
  _vaultFiles = files
  window.__vaultFiles = files
}

export function registerWikiLinksSuggestionsProvider(
  _suggestions: (query: string) => Promise<WikiLinkSuggestion[]>
): void {
  _getSuggestions = _suggestions
  window.__wikiLinkSuggestions = _getSuggestions
}

export function getWikiLinksSuggestionsProvider(): (
  query: string
) => Promise<WikiLinkSuggestion[]> | null {
  if (_getSuggestions) return _getSuggestions
  // 2026-07-16 (Free 仓 backport from team c6a1e1f): window 全局类型用 unknown[], 这里 cast 一下
  return (window.__wikiLinkSuggestions as (query: string) => Promise<WikiLinkSuggestion[]>) ?? null
}
