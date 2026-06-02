/**
 * backupManager.ts — git-style version control for vault files
 *
 * Before every write/edit, automatically backup the current file to:
 *   _briefing/backups/{relPath}/{timestamp}.bak
 *
 * Functions:
 *   createBackup(vaultPath, relPath) — create backup before mutation
 *   listBackups(vaultPath, relPath) — list backup timestamps
 *   previewBackup(vaultPath, relPath, ts) — read backup content
 *   restoreBackup(vaultPath, relPath, ts) — restore backup (overwrites current)
 *   deleteBackup(vaultPath, relPath, ts) — delete one backup
 */
import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const BACKUP_DIR = '_briefing/backups'

export interface BackupEntry {
  timestamp: string // ISO string, also used as filename key
  size: number
  isoTime: string // human-readable
}

/** Create a timestamped backup of the current file.
 * Returns the backup path on success, empty string on failure.
 * Does NOT throw — failures are silent (backup is best-effort). */
export async function createBackup(vaultPath: string, relPath: string): Promise<string> {
  if (!relPath || relPath.includes('..')) return ''
  const targetPath = join(vaultPath, relPath)
  if (!existsSync(targetPath)) return '' // no file to backup

  try {
    const raw = await readFile(targetPath, 'utf-8')
    const backupDir = join(vaultPath, BACKUP_DIR, relPath)
    await mkdir(backupDir, { recursive: true })
    const ts = Date.now().toString()
    const bakPath = join(backupDir, ts + '.bak')
    await writeFile(bakPath, raw, 'utf-8')
    return bakPath
  } catch {
    return ''
  }
}

/** List all backups for a given relative file path.
 * Returns entries sorted newest-first. */
export async function listBackups(vaultPath: string, relPath: string): Promise<BackupEntry[]> {
  const backupDir = join(vaultPath, BACKUP_DIR, relPath)
  if (!existsSync(backupDir)) return []

  let entries: string[]
  try {
    entries = await readdir(backupDir)
  } catch {
    return []
  }

  const backups: BackupEntry[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.bak')) continue
    const ts = entry.replace('.bak', '')
    try {
      const st = await stat(join(backupDir, entry))
      backups.push({
        timestamp: ts,
        size: st.size,
        isoTime: new Date(parseInt(ts)).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      })
    } catch {
      /* skip unreadable */
    }
  }

  return backups.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
}

/** Read the content of a specific backup. */
export async function previewBackup(
  vaultPath: string,
  relPath: string,
  ts: string
): Promise<string> {
  const bakPath = join(vaultPath, BACKUP_DIR, relPath, ts + '.bak')
  if (!existsSync(bakPath)) return ''
  try {
    return await readFile(bakPath, 'utf-8')
  } catch {
    return ''
  }
}

/** Restore a backup — copies the backup over the current file.
 * Returns true on success. */
export async function restoreBackup(
  vaultPath: string,
  relPath: string,
  ts: string
): Promise<boolean> {
  const bakPath = join(vaultPath, BACKUP_DIR, relPath, ts + '.bak')
  if (!existsSync(bakPath)) return false
  try {
    const content = await readFile(bakPath, 'utf-8')
    const targetPath = join(vaultPath, relPath)
    const parent = targetPath.split('/').slice(0, -1).join('/')
    if (parent) await mkdir(parent, { recursive: true })
    await writeFile(targetPath, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

/** Delete a specific backup. */
export async function deleteBackup(
  vaultPath: string,
  relPath: string,
  ts: string
): Promise<boolean> {
  const bakPath = join(vaultPath, BACKUP_DIR, relPath, ts + '.bak')
  if (!existsSync(bakPath)) return false
  try {
    await unlink(bakPath)
    return true
  } catch {
    return false
  }
}

/** Get backup count for a file. */
export async function backupCount(vaultPath: string, relPath: string): Promise<number> {
  const backups = await listBackups(vaultPath, relPath)
  return backups.length
}
