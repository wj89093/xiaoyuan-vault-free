import { join } from 'path'
import { readFile, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { getVaultPath } from '../database/database'
import { searchFiles } from '../search/search'
import { parseFrontmatter } from '../frontmatter/index'
import log from 'electron-log/main'

interface RAGResult {
  title: string
  path: string
  file: string  // alias for path, for compatibility with chat.ts
  content: string
  score: number
}

interface RAGFile {
  path: string
  name: string
  isDirectory: boolean
  title?: string
}


export async function retrieveRelevantPages(query: string): Promise<RAGResult[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []

  // Step 1: Read root index.md (AutoAI-maintained catalog, LLM-wiki primary nav)
  const rootIndex = join(vaultPath, 'index.md')
  const wikiIndex = join(vaultPath, '_wiki', 'index.md')

  for (const idxPath of [rootIndex, wikiIndex]) {
    if (!existsSync(idxPath)) continue
    try {
      const indexContent = await readFile(idxPath, 'utf-8')
      const wikiFiles = await findPagesFromIndex(indexContent, query.toLowerCase(), vaultPath)
      if (wikiFiles.length > 0) {
        log.info(`[RAG] index-based (${idxPath.split('/').pop()}): found ${wikiFiles.length} pages`)
        return await fetchWikiPageContents(wikiFiles, query)
      }
    } catch (err) {
      log.warn(`[RAG] ${idxPath.split('/').pop()} failed, trying next:`, (err as Error).message)
    }
  }

  // Step 2: Fallback — search only _wiki/ files (not entire vault)
  try {
    const wikiDir = join(vaultPath, '_wiki')
    if (existsSync(wikiDir)) {
      const wikiFiles = await scanWikiFiles(wikiDir)
      const scored = await scoreWikiPages(wikiFiles, query, vaultPath)
      if (scored.length > 0) {
        log.info(`[RAG] wiki-search: found ${scored.length} pages`)
        return scored
      }
    }
  } catch (err) {
    log.warn('[RAG] wiki search failed:', (err as Error).message)
  }

  // Step 3: Last fallback — FTS5 across entire vault
  try {
    const files = await searchFiles(query)
    if (files && files.length > 0) {
      return await fetchPageContents(files.slice(0, 8), query)
    }
  } catch { /* fall through to empty */ }

  return []
}

// Scan all .md files in _wiki/ (recursive)
async function scanWikiFiles(dir: string): Promise<string[]> {
  const results: string[] = []

  async function walk(currentDir: string): Promise<void> {
    try {
      const entries = await readdir(currentDir)
      for (const name of entries.sort()) {
        if (name.startsWith('.')) continue
        const full = join(currentDir, name)
        const s = await stat(full)
        if (s.isDirectory()) {
          await walk(full)
        } else if (name.endsWith('.md')) {
          results.push(full)
        }
      }
    } catch { /* skip inaccessible */ }
  }

  await walk(dir)
  return results
}

// Parse index.md to find wiki pages relevant to query
async function findPagesFromIndex(
  indexContent: string,
  queryLower: string,
  vaultPath: string,
): Promise<string[]> {
  // Extract page titles/names from index.md
  const pageLinks = indexContent.match(/\[\[([^\]]+)\]\]/g) ?? []
  const pageNames = pageLinks.map(m => m.slice(2, -2))

  // Score each page by keyword relevance
  const scored: Array<{ name: string; score: number }> = []
  for (const name of pageNames) {
    const nameLower = name.toLowerCase()
    let score = 0
    for (const kw of queryLower.split(/\s+/)) {
      if (kw.length < 2) continue
      if (nameLower.includes(kw)) score += 3
    }
    if (score > 0) scored.push({ name, score })
  }

  scored.sort((a, b) => b.score - a.score)
  const topNames = scored.slice(0, 10).map(s => s.name)

  // Find actual file paths — search entire vault, not just _wiki/
  const searchDirs = ['_wiki/sources', '_wiki/entities', '_wiki/concepts', '_wiki', '0-收集', '']
  const results: string[] = []
  for (const name of topNames) {
    const safe = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/\.md$/, '')
    for (const dir of searchDirs) {
      const p = dir ? join(vaultPath, dir, `${safe}.md`) : join(vaultPath, `${safe}.md`)
      if (existsSync(p) && !results.includes(p)) {
        results.push(p)
        break
      }
    }
  }

  return results
}

// Score and rank wiki pages by query relevance
interface ScoredResult {
  filePath: string
  title: string
  snippet: string
  score: number
}

async function scoreWikiPages(
  wikiFiles: string[],
  query: string,
  _vaultPath: string,
): Promise<RAGResult[]> {
  const results: ScoredResult[] = []
  const keywords = query.split(/\s+/).filter(k => k.length > 1)

  for (const filePath of wikiFiles) {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      const title = (frontmatter.title as string) ?? filePath.split('/').pop()?.replace('.md', '') ?? ''

      // Score by keyword density
      const contentLower = raw.toLowerCase()
      let score = 0
      for (const kw of keywords) {
        const escaped = kw.replace(/[.*+?^${}()|/[\]\\]/g, '\\$&')
        const matches = contentLower.match(new RegExp(escaped, 'gi'))
        if (matches) score += Math.min(matches.length, 10) * 0.1
      }

      if (score > 0) {
        const snippet = extractSnippet(raw, query, 200)
        results.push({ filePath, title, snippet, score })
      }
    } catch { /* skip */ }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 15).map(r => ({ title: r.title, path: r.filePath, file: r.filePath, content: r.snippet, score: r.score }))
}

async function fetchWikiPageContents(
  filePaths: string[],
  query: string,
): Promise<RAGResult[]> {
  const results: RAGResult[] = []
  for (const filePath of filePaths) {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      const title = (frontmatter.title as string) ?? filePath.split('/').pop()?.replace('.md', '') ?? ''
      const snippet = extractSnippet(raw, query, 200)
      results.push({ title, path: filePath, file: filePath, content: snippet, score: 1.0 })
    } catch { /* skip */ }
  }
  return results
}

async function fetchPageContents(
  files: RAGFile[],
  query: string
): Promise<RAGResult[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []

  const results: RAGResult[] = []

  for (const f of files) {
    try {
      const filePath = f.path ?? join(vaultPath, f.name)
      const fullPath = filePath.startsWith('/') ? filePath : join(vaultPath, filePath)
      if (!existsSync(fullPath)) continue
      if (f.isDirectory) continue

      const rawContent: string = await readFile(fullPath, 'utf-8')
      const title = String(f.title ?? f.name ?? filePath)

      // Extract relevant snippet
      const snippet = extractSnippet(rawContent, query, 200)

      // TF-IDF-like score based on keyword density
      const keywords = query.split(/\s+/).filter(k => k.length > 1)
      const contentLower = rawContent.toLowerCase()
      const queryLower = query.toLowerCase()
      let score = 0

      for (const kw of keywords) {
        const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        const matches = contentLower.match(regex)
        if (matches) score += Math.min(matches.length, 10) * 0.1
      }

      // Score boost for exact matches in title
      if (title.toLowerCase().includes(queryLower)) score += 1
      if (title.toLowerCase().includes(keywords[0]?.toLowerCase() ?? '')) score += 0.5

      results.push({ title, path: filePath, file: filePath, content: snippet, score })
    } catch (err) {
      log.warn('[RAG] fetchPage loop:', err)
    }
  }

  // Sort by relevance score
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, 5)
}

// ============ Stage 2: Generate Answer ============


export function extractSnippet(content: string, query: string, maxLen: number): string {
  const keywords = query.split(/\s+/).filter(k => k.length > 1)
  if (keywords.length === 0) return content.slice(0, maxLen) + '...'

  // Find best matching paragraph
  const paragraphs = content.split(/\n\n+/)
  let bestPara = content.slice(0, maxLen)
  let bestScore = 0

  for (const para of paragraphs) {
    let score = 0
    for (const kw of keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'gi')
      const matches = para.match(regex)
      if (matches) score += matches.length
    }
    if (score > bestScore) {
      bestScore = score
      bestPara = para
    }
  }

  return bestPara.length > maxLen
    ? bestPara.slice(0, maxLen) + '...'
    : bestPara
}

// ============ Session Management ============

// ─── Session management (delegated) ─────────────────────────────────