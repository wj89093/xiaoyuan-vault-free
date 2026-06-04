/**
 * lastSeenHandlers — v1.5 未读/新内容标记
 *
 * 用户是读者 (主要看 agent 写的文档), 需要知道哪些文件是新的
 *
 * 工作流:
 *   1. 用户打开 vault, 读 last_seen_files 表
 *   2. FileTree 中文件 mtime > last_seen_at 标 "未读" 小圆点
 *   3. 用户在 Editor 中实际打开文件, mark seen
 *
 * 提供能力:
 *   - lastSeen:mark       记录某文件被用户看过 (now)
 *   - lastSeen:getAll     拿所有 last_seen_at (FileTree 用, 一次性)
 *   - lastSeen:getForFile 拿单个文件的 last_seen_at (Editor 显示用)
 *   - lastSeen:clear      清除某文件的记录 (重置为未读)
 */
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { db } from '../services/database/database'

export interface LastSeenMap {
  [filePath: string]: number
}

export function registerLastSeenHandlers(): void {
  ipcMain.handle('lastSeen:mark', async (_event, filePath: string): Promise<boolean> => {
    if (!db || !filePath) return false
    try {
      db.prepare(
        `INSERT INTO last_seen_files (file_path, last_seen_at)
         VALUES (?, ?)
         ON CONFLICT(file_path) DO UPDATE SET last_seen_at = excluded.last_seen_at`
      ).run(filePath, Date.now())
      return true
    } catch (err) {
      log.error('[lastSeen:mark] error:', err)
      return false
    }
  })

  ipcMain.handle('lastSeen:getAll', async (): Promise<LastSeenMap> => {
    if (!db) return {}
    try {
      const rows = db
        .prepare('SELECT file_path, last_seen_at FROM last_seen_files')
        .all() as Array<{ file_path: string; last_seen_at: number }>
      const map: LastSeenMap = {}
      for (const row of rows) {
        map[row.file_path] = row.last_seen_at
      }
      return map
    } catch (err) {
      log.error('[lastSeen:getAll] error:', err)
      return {}
    }
  })

  ipcMain.handle('lastSeen:getForFile', async (_event, filePath: string): Promise<number | null> => {
    if (!db || !filePath) return null
    try {
      const row = db
        .prepare('SELECT last_seen_at FROM last_seen_files WHERE file_path = ?')
        .get(filePath) as { last_seen_at: number } | undefined
      return row?.last_seen_at ?? null
    } catch (err) {
      log.error('[lastSeen:getForFile] error:', err)
      return null
    }
  })

  ipcMain.handle('lastSeen:clear', async (_event, filePath: string): Promise<boolean> => {
    if (!db || !filePath) return false
    try {
      db.prepare('DELETE FROM last_seen_files WHERE file_path = ?').run(filePath)
      return true
    } catch (err) {
      log.error('[lastSeen:clear] error:', err)
      return false
    }
  })
}
