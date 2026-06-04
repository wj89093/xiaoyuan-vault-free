/**
 * scrollPositionHandlers — v1.5 滚动位置记忆
 *
 * 用户是读者 (主要看 agent 写的文档), 重开文档应回到上次位置
 * 存储位置: vault 的 SQLite (在 files 表旁边)
 *
 * 提供能力:
 *   - scroll:get    读取某文件的最后滚动位置
 *   - scroll:set    写入某文件的当前滚动位置 (upsert)
 *   - scroll:remove 清除某文件的记录 (e.g. 文件被删)
 */
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { db } from '../services/database/database'

export interface ScrollPosition {
  filePath: string
  scrollY: number
  lastHeading: string | null
  updatedAt: number
}

export function registerScrollPositionHandlers(): void {
  ipcMain.handle(
    'scroll:get',
    async (_event, filePath: string): Promise<ScrollPosition | null> => {
      if (!db || !filePath) return null
      try {
        const row = db
          .prepare(
            'SELECT file_path, scroll_y, last_heading, updated_at FROM scroll_positions WHERE file_path = ?'
          )
          .get(filePath) as
          | {
              file_path: string
              scroll_y: number
              last_heading: string | null
              updated_at: number
            }
          | undefined
        if (!row) return null
        return {
          filePath: row.file_path,
          scrollY: row.scroll_y,
          lastHeading: row.last_heading,
          updatedAt: row.updated_at,
        }
      } catch (err) {
        log.error('[scroll:get] error:', err)
        return null
      }
    }
  )

  ipcMain.handle(
    'scroll:set',
    async (
      _event,
      params: { filePath: string; scrollY: number; lastHeading?: string | null }
    ): Promise<boolean> => {
      if (!db || !params?.filePath) return false
      try {
        db.prepare(
          `INSERT INTO scroll_positions (file_path, scroll_y, last_heading, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(file_path) DO UPDATE SET
             scroll_y = excluded.scroll_y,
             last_heading = excluded.last_heading,
             updated_at = excluded.updated_at`
        ).run(params.filePath, params.scrollY, params.lastHeading ?? null, Date.now())
        return true
      } catch (err) {
        log.error('[scroll:set] error:', err)
        return false
      }
    }
  )

  ipcMain.handle('scroll:remove', async (_event, filePath: string): Promise<boolean> => {
    if (!db || !filePath) return false
    try {
      db.prepare('DELETE FROM scroll_positions WHERE file_path = ?').run(filePath)
      return true
    } catch (err) {
      log.error('[scroll:remove] error:', err)
      return false
    }
  })
}
