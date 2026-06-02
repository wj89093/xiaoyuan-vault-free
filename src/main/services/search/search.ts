import { db } from '../database/database'
import { normalizeRecord } from '../database/database'
import type { FileRecord } from '../database/database'
import log from 'electron-log/main'

export type { FileRecord } from '../database/database'

export function searchFiles(query: string): Promise<FileRecord[]> {
  if (!db) return Promise.resolve([])

  if (!query.trim()) {
    // Return all files
    const stmt = db.prepare(`
      SELECT path, name, title, tags, modified_at, folder
      FROM files
      ORDER BY modified_at DESC
      LIMIT 100
    `)
    return Promise.resolve(stmt.all().map((r) => normalizeRecord(r)))
  }

  // FTS search
  const stmt = db.prepare(`
    SELECT f.path, f.name, f.title, f.tags, f.modified_at, f.folder
    FROM files f
    JOIN files_fts fts ON f.rowid = fts.rowid
    WHERE files_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `)

  try {
    const rows = stmt.all(query + '*')
    return Promise.resolve(rows.map((r) => normalizeRecord(r)))
  } catch (e) {
    log.warn(
      '[database] FTS search failed, falling back to LIKE',
      e instanceof Error ? e.message : String(e)
    )
    const likeStmt = db.prepare(`
      SELECT path, name, title, tags, modified_at, folder
      FROM files
      WHERE content LIKE ? OR title LIKE ? OR tags LIKE ?
      LIMIT 50
    `)
    return Promise.resolve(
      likeStmt.all(`%${query}%`, `%${query}%`, `%${query}%`).map((r) => normalizeRecord(r))
    )
  }
}
