import Database from 'better-sqlite3'
import { join, basename } from 'path'
import { readdir, stat, readFile, mkdir, unlink, rmdir } from 'fs/promises'
import log from 'electron-log/main'
import { parseFrontmatter } from '../frontmatter/index'

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export let db: Database.Database | null = null
export let vaultPath: string = ''

export interface FileRecord {
  path: string
  name: string
  isDirectory: boolean
  modified: number
  children?: FileRecord[]
  title?: string
  tags?: string
}

export async function initDatabase(vault: string): Promise<void> {
  vaultPath = vault
  const dbPath = join(vault, '.xiaoyuan', 'index.db')

  // Ensure .xiaoyuan directory exists
  await mkdir(join(vault, '.xiaoyuan'), { recursive: true })

  // Atomic swap: create new connection before closing old one
  const oldDb = db
  db = new Database(dbPath)
  if (oldDb) {
    try { oldDb.close() } catch { /* already closed */ }
  }

  // Enable WAL for better concurrency
  db.pragma('journal_mode = WAL')

  // FTS5 全文索引 (content_rowid references SQLite implicit rowid, not files.id)
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE,
      name TEXT,
      title TEXT,
      content TEXT,
      tags TEXT,
      frontmatter TEXT,
      folder TEXT,
      modified_at INTEGER,
      content_hash TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
      path,
      name,
      title,
      content,
      tags,
      content='files',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, path, name, title, content, tags)
      VALUES (new.rowid, new.path, new.name, new.title, new.content, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, path, name, title, content, tags)
      VALUES ('delete', old.rowid, old.path, old.name, old.title, old.content, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
      INSERT INTO files_fts(files_fts, rowid, path, name, title, content, tags)
      VALUES ('delete', old.rowid, old.path, old.name, old.title, old.content, old.tags);
      INSERT INTO files_fts(rowid, path, name, title, content, tags)
      VALUES (new.rowid, new.path, new.name, new.title, new.content, new.tags);
    END;
  `)

  // Index existing files
  await indexVault(vault)
  log.info('Database initialized:', dbPath)
}

async function indexVault(dir: string): Promise<void> {
  if (!db) return

  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      await indexVault(fullPath)
    } else if (entry.name.endsWith('.md')) {
      await indexFile(fullPath)
    }
  }
}

async function indexFile(filePath: string): Promise<void> {
  if (!db) return

  try {
    const content = await readFile(filePath, 'utf-8')
    const stats = await stat(filePath)
    const relPath = filePath.replace(vaultPath + '/', '')
    const name = basename(relPath)
    const { frontmatter } = parseFrontmatter(content)
    const title = frontmatter.title ?? extractTitle(content) ?? (name.replace(/\.md$/, ''))
    const hash = simpleHash(content)

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO files (path, name, title, content, tags, frontmatter, modified_at, content_hash, folder)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const folder = relPath.includes('/')
      ? relPath.split('/').slice(0, -1).join('/')
      : ''

    stmt.run(
      relPath,
      name,
      title,
      content,
      frontmatter.tags?.join(', ') ?? '',
      JSON.stringify(frontmatter),
      stats.mtimeMs,
      hash,
      folder
    )
  } catch (err) {
    log.error('Index error:', err)
  }
}

export function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : ''
}

export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}

export function normalizeRecord(r: any): FileRecord {
  return {
    path: r.path,
    name: r.name ?? r.path.split('/').pop() ?? r.path,
    isDirectory: false,
    modified: r.modified_at,
    title: r.title ?? undefined,
    tags: r.tags ?? undefined
  }
}

export async function fsDeleteRecursive(dirPath: string): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await fsDeleteRecursive(fullPath)
    } else {
      await unlink(fullPath)
    }
  }
  await rmdir(dirPath)
}

export async function scanDirectory(dir: string, basePath: string = ''): Promise<FileRecord[]> {
  const results: FileRecord[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      const children = await scanDirectory(fullPath, relPath)
      results.push({
        path: relPath,
        name: entry.name,
        isDirectory: true,
        modified: 0,
        children
      })
    } else {
      const stats = await stat(fullPath)
      // Check DB for metadata
      let title: string | undefined
      let tags: string | undefined
      if (db) {
        const record = db.prepare('SELECT title, tags FROM files WHERE path = ?').get(relPath) as any
        if (record) {
          title = record.title ?? undefined
          tags = record.tags ?? undefined
        }
      }
      results.push({
        path: relPath,
        name: entry.name,
        isDirectory: false,
        modified: stats.mtimeMs,
        title,
        tags
      })
    }
  }

  // Sort: folders first, then files alphabetically
  results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return results
}

/**
 * Get the vault path
 */
export function getVaultPath(): string {
  return vaultPath
}

// ─── FTS5 Content Search Engine ────────────────────────────────────

export interface SearchResult {
  path: string
  title: string
  topic: string
  snippet: string
  rank: number
  tags: string
  summary: string
}

/**
 * Full-text search across vault markdown files using FTS5 + BM25 ranking.
 * Filters by _wiki/ or specific topic path. Returns ranked results with snippets.
 */
export function searchVault(
  query: string,
  opts?: { topic?: string; maxResults?: number; includeRaw?: boolean }
): SearchResult[] {
  if (!db) return []

  const maxResults = opts?.maxResults ?? 5
  const topicFilter = opts?.topic ? `_wiki/${opts.topic}/` : '_wiki/'
  const pathFilter = opts?.includeRaw ? '' : topicFilter

  try {
    // Build FTS5 query with path filtering
    // Use ' OR ' for multi-word queries (any word match)
    const terms = query.trim().split(/\s+/).filter(Boolean).map(t => `"${t}"`).join(' OR ')

    const rows = db.prepare(`
      SELECT
        f.path,
        f.title,
        f.tags,
        f.frontmatter,
        snippet(files_fts, 1, '<b>', '</b>', '…', 40) AS snippet,
        bm25(files_fts, 1.0, 1.0, 3.0, 0.5, 0.5) AS rank
      FROM files_fts
      JOIN files f ON f.rowid = files_fts.rowid
      WHERE files_fts MATCH ?
        AND f.path LIKE ?
      ORDER BY rank
      LIMIT ?
    `).all(terms, `${pathFilter}%`, maxResults) as Array<{
      path: string; title: string; tags: string | null;
      frontmatter: string | null; snippet: string; rank: number
    }>

    return rows.map(r => {
      // Extract topic from path: _wiki/{topic}/file.md → {topic}
      const parts = r.path.split('/')
      const topic = parts.length > 2 && parts[0] === '_wiki' ? parts[1] : (parts[0] ?? '根目录')

      // Extract summary from frontmatter
      let summary = ''
      try {
        if (r.frontmatter) {
          const fm = JSON.parse(r.frontmatter) as Record<string, unknown>
          summary = String(fm.summary ?? '')
        }
      } catch { /* ignore */ }

      return {
        path: r.path,
        title: r.title ?? r.path.split('/').pop()?.replace(/\.md$/, '') ?? r.path,
        topic,
        snippet: r.snippet || '(匹配内容)',
        rank: Math.round(r.rank * 100) / 100,
        tags: r.tags ?? '',
        summary,
      }
    })
  } catch (err) {
    log.error('searchVault error:', err)
    return []
  }
}

/** Re-index a single file after write/edit. Called by write/edit tool handlers. */
export function reindexFile(relPath: string): void {
  if (!db || !vaultPath) return
  const fullPath = join(vaultPath, relPath)
  indexFile(fullPath).catch(err => log.error('reindexFile error:', err))
}

/** Remove a file from the search index. Called by delete tool handlers. */
export function removeFromIndex(relPath: string): void {
  if (!db) return
  try {
    db.prepare('DELETE FROM files WHERE path = ?').run(relPath)
  } catch (err) {
    log.error('removeFromIndex error:', err)
  }
}