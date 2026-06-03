/**
 * importHandlers — File import, raw conversion and archive handlers
 *
 * Channels: file:import, file:convertRaw, file:listRaw, file:archiveQuery
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { getVaultPath } from '../../services/database/database'
import { convertWithJS } from '../../services/operations/converters'

export function registerImportHandlers(): void {
  ipcMain.handle('file:import', async (_, vaultPath: string, filePaths: string[]) => {
    const { mkdir, copyFile } = await import('fs/promises')
    const { basename, extname } = await import('path')
    const { markConverted } = await import('./utils')
    const results: Array<{ name: string; path: string; status: string; error?: string }> = []
    for (const srcPath of filePaths) {
      const ext = extname(srcPath).toLowerCase()
      const fileName = basename(srcPath)
      const month = new Date().toISOString().slice(0, 7)
      const rawDir = join(vaultPath, '_raw', month)
      await mkdir(rawDir, { recursive: true })
      const dest = join(rawDir, fileName)
      try {
        await copyFile(srcPath, dest)
        results.push({ name: fileName, path: dest, status: 'ok' })
        if (ext === '.md') {
          markConverted(dest)
        }
      } catch (e) {
        results.push({ name: fileName, path: dest, status: 'error', error: String(e) })
      }
    }
    return results
  })

  ipcMain.handle('file:convertRaw', async (_, rawPath: string, _vaultPath: string) => {
    const { writeFile } = await import('fs/promises')
    const { extname } = await import('path')
    const { isConverted, markConverted } = await import('./utils')
    if (await isConverted(rawPath))
      return { success: true, mdPath: rawPath.replace(extname(rawPath), '.md') }
    const markdown: string = await convertWithJS(rawPath)
    if (markdown) {
      const mdPath = rawPath.replace(extname(rawPath), '.md')
      await writeFile(mdPath, markdown, 'utf-8')
      await markConverted(rawPath)
      return { success: true, mdPath }
    }
    return { success: false, error: 'Conversion failed' }
  })

  ipcMain.handle('file:listRaw', async (_, vaultPath: string) => {
    const { readdir, stat } = await import('fs/promises')
    const { join } = await import('path')
    const { existsSync } = await import('fs')
    const { isConverted } = await import('./utils')
    const rawDir = join(vaultPath, '_raw')
    if (!existsSync(rawDir)) return []
    const months = await readdir(rawDir)
    const result: Array<{
      month: string
      files: Array<{ name: string; path: string; converted: boolean }>
    }> = []
    const inboxPath = join(rawDir, 'inbox')
    if (existsSync(inboxPath)) {
      const inboxFiles = await readdir(inboxPath)
      const files = inboxFiles.map((name) => ({
        name,
        path: join(inboxPath, name),
        converted: false
      }))
      result.unshift({ month: 'inbox', files })
    }
    for (const month of months) {
      if (month === 'inbox' || month === 'assets' || month.startsWith('.')) continue
      const monthPath = join(rawDir, month)
      if (!(await stat(monthPath)).isDirectory()) continue
      const files = await readdir(monthPath)
      const fileList = files
        .filter((f) => !f.startsWith('.'))
        .map((name) => ({
          name,
          path: join(monthPath, name),
          converted: isConverted(join(monthPath, name)) as unknown as boolean
        }))
      result.push({ month, files: fileList })
    }
    return result
  })

  ipcMain.handle('file:archiveQuery', async (_, content: string) => {
    const { mkdir, writeFile } = await import('fs/promises')
    const { join } = await import('path')
    const vaultPath = getVaultPath()
    if (!vaultPath) {
      throw new Error('No vault open')
    }
    const { getTrashDir } = await import('./utils')
    const trashDir = getTrashDir(vaultPath)
    await mkdir(trashDir, { recursive: true })
    const fp = join(trashDir, `query-${Date.now()}.md`)
    await writeFile(fp, content, 'utf-8')
    return fp
  })
}
