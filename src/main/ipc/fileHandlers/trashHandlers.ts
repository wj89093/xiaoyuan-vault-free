/**
 * trashHandlers — Trash list/restore/delete/clean + external-open handlers
 *
 * Channels: file:openExternal, file:revealInFinder, file:trashList,
 *           file:trashRestore, file:trashDelete, file:trashClean
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { getVaultPath } from '../../services/database/database'

export function registerTrashHandlers(): void {
  // ── Trash metadata (maps trash filename → original path) ────
  async function loadTrashMeta(trashDir: string): Promise<Record<string, string>> {
    const { readFile } = await import('fs/promises')
    try {
      const raw = await readFile(join(trashDir, '.trash-meta.json'), 'utf-8')
      return JSON.parse(raw) as Record<string, string>
    } catch { return {} }
  }

  async function saveTrashMeta(trashDir: string, meta: Record<string, string>): Promise<void> {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(trashDir, '.trash-meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
  }

  async function _addTrashMeta(trashDir: string, trashName: string, originalPath: string): Promise<void> {
    const meta = await loadTrashMeta(trashDir)
    meta[trashName] = originalPath
    await saveTrashMeta(trashDir, meta)
  }

  async function removeTrashMeta(trashDir: string, trashName: string): Promise<void> {
    const meta = await loadTrashMeta(trashDir)
    delete meta[trashName]
    await saveTrashMeta(trashDir, meta)
  }

  ipcMain.handle('file:openExternal', async (_, filePath: string) => {
    const { shell } = await import('electron')
    const vaultPath = getVaultPath()
    const fullPath = vaultPath
      ? (filePath.startsWith(vaultPath) ? filePath : join(vaultPath, filePath))
      : filePath
    const errMsg = await shell.openPath(fullPath)
    if (errMsg) { log.warn('[fileOpenExternal] failed:', fullPath, errMsg); return { ok: false, error: errMsg } }
    return { ok: true }
  })

  ipcMain.handle('file:revealInFinder', async (_, filePath: string) => {
    const { shell } = await import('electron')
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('file:trashList', async (_, vaultPath: string) => {
    const { readdir, stat, mkdir } = await import('fs/promises')
    const { getTrashDir } = await import('./utils')
    const trashDir = getTrashDir(vaultPath)
    await mkdir(trashDir, { recursive: true })
    const meta = await loadTrashMeta(trashDir)
    const entries = await readdir(trashDir).catch(() => [])
    const files: Array<{ originalPath: string; trashPath: string; deletedAt: number; name: string }> = []
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const fullPath = join(trashDir, entry)
      const s = await stat(fullPath).catch(() => null)
      if (!s) continue
      files.push({
        originalPath: meta[entry] ?? '',
        trashPath: fullPath,
        deletedAt: s.mtimeMs,
        name: meta[entry]?.split('/').pop() ?? entry,
      })
    }
    return files.sort((a, b) => b.deletedAt - a.deletedAt)
  })

  ipcMain.handle('file:trashRestore', async (_, vaultPath: string, trashPath: string) => {
    const { rename } = await import('fs/promises')
    const { getTrashDir } = await import('./utils')
    const trashDir = getTrashDir(vaultPath)
    const meta = await loadTrashMeta(trashDir)
    const trashName = trashPath.split('/').pop()!
    const originalPath = meta[trashName] ?? join(vaultPath, trashName.replace(/^\d+-\w+-/, ''))
    try {
      await rename(trashPath, originalPath)
      await removeTrashMeta(trashDir, trashName)
    } catch (e) { log.warn('[TrashRestore] failed:', e) }
    return true
  })

  ipcMain.handle('file:trashDelete', async (_, vaultPath: string, trashPath: string) => {
    const { unlink, rmdir, stat } = await import('fs/promises')
    const { getTrashDir } = await import('./utils')
    const trashDir = getTrashDir(vaultPath)
    const trashName = trashPath.split('/').pop()!
    try {
      const s = await stat(trashPath)
      if (s.isDirectory()) await rmdir(trashPath, { recursive: true })
      else await unlink(trashPath)
      await removeTrashMeta(trashDir, trashName)
    } catch (e) { log.warn('[Trash] delete failed:', e) }
    return true
  })

  ipcMain.handle('file:trashClean', async (_, vaultPath: string) => {
    const { readdir, unlink, rmdir, stat, mkdir } = await import('fs/promises')
    const { getTrashDir } = await import('./utils')
    const trashDir = getTrashDir(vaultPath)
    await mkdir(trashDir, { recursive: true })
    const entries = await readdir(trashDir).catch(() => [])
    let count = 0
    for (const entry of entries) {
      if (entry.startsWith('.')) continue
      const fullPath = join(trashDir, entry)
      try {
        const s = await stat(fullPath)
        if (s.isDirectory()) await rmdir(fullPath, { recursive: true })
        else await unlink(fullPath)
        count++
      } catch (e) { log.warn('[Trash] clean error:', e) }
    }
    // Clear meta
    await saveTrashMeta(trashDir, {})
    log.info(`[Trash] cleaned ${count} items`)
    return count
  })
}