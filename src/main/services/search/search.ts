import { db } from '../database/database'
import { normalizeRecord } from '../database/database'
import type { FileRecord } from '../database/database'
import log from 'electron-log/main'

export type { FileRecord } from '../database/database'

/**
 * v1.7: options 参数 — Agent 端省 token 关键
 *   - limit: 改 SQL LIMIT (默认 50, 之前固定写死 50)
 *   - topic: 限定 folder (按 _wiki/{topic}/ 目录), 不全表扫
 *
 * 注: query.trim() 为空时也支持 topic 过滤 (用于 topic 列表查询)
 */
export function searchFiles(
  query: string,
  options?: { limit?: number; topic?: string }
): Promise<FileRecord[]> {
  if (!db) return Promise.resolve([])

  const limit = options?.limit ?? 50
  const topicFilter = options?.topic

  if (!query.trim()) {
    // Return all files
    const stmt = db.prepare(`
      SELECT path, name, title, tags, modified_at, folder
      FROM files
      ${topicFilter ? 'WHERE folder = ?' : ''}
      ORDER BY modified_at DESC
      LIMIT ?
    `)
    const rows = topicFilter ? stmt.all(topicFilter, limit) : stmt.all(limit)
    return Promise.resolve(rows.map((r) => normalizeRecord(r)))
  }

  // FTS search
  // snippet(files_fts, 3, ...) column 3 = content, 16 tokens 前后文
  const stmt = db.prepare(`
    SELECT f.path, f.name, f.title, f.tags, f.modified_at, f.folder,
           snippet(files_fts, 3, '<mark>', '</mark>', '…', 16) AS snippet
    FROM files f
    JOIN files_fts fts ON f.rowid = fts.rowid
    WHERE files_fts MATCH ?
    ${topicFilter ? 'AND f.folder = ?' : ''}
    ORDER BY rank
    LIMIT ?
  `)

  try {
    const rows = topicFilter
      ? stmt.all(query + '*', topicFilter, limit)
      : stmt.all(query + '*', limit)
    return Promise.resolve(rows.map((r) => normalizeRecord(r)))
  } catch (e) {
    log.warn(
      '[database] FTS search failed, falling back to LIKE',
      e instanceof Error ? e.message : String(e)
    )
    const likeStmt = db.prepare(`
      SELECT path, name, title, tags, modified_at, folder, '' AS snippet
      FROM files
      WHERE (content LIKE ? OR title LIKE ? OR tags LIKE ?)
      ${topicFilter ? 'AND folder = ?' : ''}
      LIMIT ?
    `)
    const likeParams = [`%${query}%`, `%${query}%`, `%${query}%`]
    if (topicFilter) likeParams.push(topicFilter)
    likeParams.push(String(limit))
    return Promise.resolve(
      likeStmt.all(...likeParams).map((r) => normalizeRecord(r))
    )
  }
}
