/**
 * operationLog — append-only activity log
 * Pure fs, no Agent dependency.
 */

import log from 'electron-log/main'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'

// ─── Log rotation constants (P1.6) ──────────────────────────────────────
const LOG_MAX_LINES = 5000 // rotate when exceeded

async function rotateLog(vaultPath: string): Promise<void> {
  try {
    const { mkdir } = await import('fs/promises')
    const logPath = join(vaultPath, 'log.md')
    const archiveDir = join(vaultPath, '_briefing', 'logs')
    await mkdir(archiveDir, { recursive: true })
    const raw = await readFile(logPath, 'utf-8')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')
    const archivePath = join(archiveDir, `log-${ts}.md`)
    await writeFile(archivePath, raw, 'utf-8')
    log.info('[operationLog] rotated log to:', archivePath)
    // Keep last 100 lines as new log seed
    const lines = raw.split('\n')
    const seed = lines.slice(-100).join('\n')
    const header = '# 操作日志\n\n> 历史已归档，详见 _briefing/logs/\n\n'
    await writeFile(logPath, header + seed, 'utf-8')
  } catch (e) {
    log.warn('[operationLog] rotate failed:', (e as Error).message)
  }
}

/** Append entries to operation log. Auto-rotates if too large. */
export async function appendToOperationLog(vaultPath: string, entries: string[]): Promise<void> {
  if (!entries.length) return
  const logPath = join(vaultPath, 'log.md')
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const content = ['', `### ${ts}`, ...entries.map((e) => `  - ${String(e)}`)].join('\n')
  try {
    const existing = await readFile(logPath, 'utf-8').catch(() => '')
    // P1.6: check line count before append, rotate if needed
    const totalLines = existing.split('\n').length + content.split('\n').length
    if (totalLines > LOG_MAX_LINES) {
      await rotateLog(vaultPath)
    }
    const afterRotate = await readFile(logPath, 'utf-8').catch(() => '')
    await writeFile(logPath, afterRotate + content, 'utf-8')
  } catch (e) {
    log.warn('[operationLog] write failed:', (e as Error).message)
  }
}
