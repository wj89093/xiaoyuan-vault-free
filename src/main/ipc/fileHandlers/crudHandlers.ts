/**
 * crudHandlers — File CRUD + render handlers
 *
 * Channels: file:rename, file:move, file:delete, folder:delete, folder:create,
 *           file:list, file:search, file:read, file:render
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { createHash } from 'crypto'
import log from 'electron-log/main'
import {
  renameFile,
  moveFile,
  deleteFolder,
  createFolder,
  getFileContent,
  listVaultFiles
} from '../../services/operations/crud'
import { getVaultPath } from '../../services/database/database'
import { searchFiles } from '../../services/search/search'

export function registerCrudHandlers(): void {
  ipcMain.handle('file:rename', (_, oldPath: string, newName: string) => {
    return renameFile(oldPath, newName)
  })

  ipcMain.handle('file:move', (_, filePath: string, newParentDir: string) => {
    return moveFile(filePath, newParentDir)
  })

  ipcMain.handle('file:delete', async (_, vaultPath: string, filePath: string) => {
    const { unlink, rename, copyFile, mkdir } = await import('fs/promises')
    const { getTrashDir } = await import('./utils')
    const fullPath = filePath.startsWith('/') ? filePath : join(vaultPath, filePath)
    const trashDir = getTrashDir(vaultPath)
    await mkdir(trashDir, { recursive: true })
    const trashName = `${Date.now()}-${createHash('md5').update(fullPath).digest('hex').slice(0, 8)}`
    const trashPath = join(trashDir, trashName)
    // Move to trash
    try {
      await rename(fullPath, trashPath)
    } catch {
      await copyFile(fullPath, trashPath)
    }
    try {
      await unlink(fullPath)
    } catch {
      /* file already moved */
    }
    // Track original path for restore
    try {
      const { readFile, writeFile } = await import('fs/promises')
      const metaPath = join(trashDir, '.trash-meta.json')
      const meta: Record<string, string> = await readFile(metaPath, 'utf-8')
        .then((r) => JSON.parse(r) as Record<string, string>)
        .catch(() => ({}) as Record<string, string>)
      meta[trashName] = fullPath
      await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    } catch (e) {
      log.warn('[Trash] meta save failed:', (e as Error).message)
    }
    return true
  })

  ipcMain.handle('folder:delete', (_, folderPath: string) => {
    return deleteFolder(folderPath)
  })

  ipcMain.handle('folder:create', (_, folderPath: string) => {
    return createFolder(folderPath)
  })

  ipcMain.handle('file:list', () => {
    return listVaultFiles()
  })

  ipcMain.handle('file:search', (_, query: string) => {
    return searchFiles(query)
  })

  ipcMain.handle('file:read', (_, filePath: string) => {
    return getFileContent(filePath)
  })

  ipcMain.handle('file:render', async (_, filePath: string) => {
    const vaultPath = getVaultPath()
    const fullPath = vaultPath
      ? filePath.startsWith(vaultPath)
        ? filePath
        : join(vaultPath, filePath)
      : filePath
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const fileName = filePath.split('/').pop() ?? filePath

    // Images: embed directly
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      const fs = await import('fs/promises')
      const data = await fs.readFile(fullPath)
      return {
        type: 'image',
        dataUrl: `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${data.toString('base64')}`
      }
    }

    // PDF: return data URL for renderer-side PDF.js rendering
    if (ext === 'pdf') {
      const fs = await import('fs/promises')
      const data = await fs.readFile(fullPath)
      return { type: 'pdf', dataUrl: `data:application/pdf;base64,${data.toString('base64')}` }
    }

    // DOCX/DOC: return binary data for docx-preview rendering in renderer
    if (['docx', 'doc'].includes(ext)) {
      const fs = await import('fs/promises')
      const data = await fs.readFile(fullPath)
      return {
        type: 'docx',
        dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${data.toString('base64')}`
      }
    }

    // XLSX/XLS/CSV/TSV/ODS: return binary data for renderer-side SheetJS rendering
    if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) {
      const fs = await import('fs/promises')
      const data = await fs.readFile(fullPath)
      return {
        type: 'spreadsheet',
        dataUrl: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.toString('base64')}`
      }
    }

    // PPTX/PPT: return binary data for renderer-side pptx-preview rendering
    if (['pptx', 'ppt'].includes(ext)) {
      const fs = await import('fs/promises')
      const data = await fs.readFile(fullPath)
      return {
        type: 'pptx',
        dataUrl: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${data.toString('base64')}`
      }
    }

    // HTML/HTM: return raw content for React iframe rendering
    if (['html', 'htm'].includes(ext)) {
      try {
        const fs = await import('fs/promises')
        const raw = await fs.readFile(fullPath, 'utf-8')
        return { type: 'htmlIframe', content: raw }
      } catch (e) {
        log.warn('[fileRender] html read failed:', fileName, (e as Error).message)
      }
      return {
        type: 'html',
        content: `<div class="native-preview-html"><p>无法读取此文件</p></div>`
      }
    }

    // Unsupported
    return { type: 'unsupported' }
  })
}
