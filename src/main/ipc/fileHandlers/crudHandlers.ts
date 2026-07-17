/**
 * crudHandlers — File CRUD + render handlers
 *
 * Channels: file:rename, file:move, file:delete, folder:delete, folder:create,
 *           file:list, file:search, file:read, file:save, file:render
 *
 * 测试便利: 10 个 `_xxxImpl` 函数 export, 测试可绕过 ipcMain.handle 直接调用实现.
 * 创建: 2026-07-17 (跟 importHandlers 同步抽 internal)
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

// ============================================================================
// Internal 实现 (导出用于测试)
// ============================================================================

// Image / PDF / Office 文件支持的扩展名白名单 (跟原实现一致)
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']
const PDF_EXTS = ['pdf']
const DOCX_EXTS = ['docx', 'doc']
const SHEET_EXTS = ['xlsx', 'xls', 'csv', 'tsv', 'ods']
const SLIDE_EXTS = ['pptx', 'ppt']
const HTML_EXTS = ['html', 'htm']

export async function _fileRenameImpl(oldPath: string, newName: string): Promise<boolean> {
  return renameFile(oldPath, newName)
}

export async function _fileMoveImpl(filePath: string, newParentDir: string): Promise<boolean> {
  return moveFile(filePath, newParentDir)
}

export async function _fileDeleteImpl(vaultPath: string, filePath: string): Promise<boolean> {
  const { unlink, rename, copyFile, mkdir } = await import('fs/promises')
  const { getTrashDir } = await import('./utils')
  const fullPath = filePath.startsWith('/') ? filePath : join(vaultPath, filePath)
  const trashDir = getTrashDir(vaultPath)
  await mkdir(trashDir, { recursive: true })
  const trashName = `${Date.now()}-${createHash('md5').update(fullPath).digest('hex').slice(0, 8)}`
  const trashPath = join(trashDir, trashName)
  // Move to trash (try rename first, fallback to copy)
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
}

export async function _folderDeleteImpl(folderPath: string): Promise<boolean> {
  return deleteFolder(folderPath)
}

export async function _folderCreateImpl(folderPath: string): Promise<boolean> {
  return createFolder(folderPath)
}

export async function _fileListImpl(): Promise<unknown[]> {
  return listVaultFiles()
}

export async function _fileSearchImpl(query: string): Promise<unknown[]> {
  return searchFiles(query)
}

export async function _fileReadImpl(filePath: string): Promise<string> {
  return getFileContent(filePath)
}

export async function _fileSaveImpl(filePath: string, content: string): Promise<boolean> {
  const { writeFile, mkdir } = await import('fs/promises')
  const { dirname } = await import('path')
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf-8')
  return true
}

export interface RenderResult {
  type: 'image' | 'pdf' | 'docx' | 'spreadsheet' | 'pptx' | 'html' | 'htmlIframe' | 'unsupported'
  dataUrl?: string
  content?: string
}

export async function _fileRenderImpl(filePath: string): Promise<RenderResult> {
  const vaultPath = getVaultPath()
  const fullPath = vaultPath
    ? filePath.startsWith(vaultPath)
      ? filePath
      : join(vaultPath, filePath)
    : filePath
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const fileName = filePath.split('/').pop() ?? filePath

  const fs = await import('fs/promises')

  // Images: embed directly
  if (IMAGE_EXTS.includes(ext)) {
    const data = await fs.readFile(fullPath)
    return {
      type: 'image',
      dataUrl: `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${data.toString('base64')}`
    }
  }

  // PDF: data URL for renderer-side PDF.js
  if (PDF_EXTS.includes(ext)) {
    const data = await fs.readFile(fullPath)
    return { type: 'pdf', dataUrl: `data:application/pdf;base64,${data.toString('base64')}` }
  }

  // DOCX: docx-preview rendering
  if (DOCX_EXTS.includes(ext)) {
    const data = await fs.readFile(fullPath)
    return {
      type: 'docx',
      dataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${data.toString('base64')}`
    }
  }

  // XLSX: SheetJS rendering
  if (SHEET_EXTS.includes(ext)) {
    const data = await fs.readFile(fullPath)
    return {
      type: 'spreadsheet',
      dataUrl: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${data.toString('base64')}`
    }
  }

  // PPTX: pptx-preview rendering
  if (SLIDE_EXTS.includes(ext)) {
    const data = await fs.readFile(fullPath)
    return {
      type: 'pptx',
      dataUrl: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${data.toString('base64')}`
    }
  }

  // HTML/HTM: raw content for iframe rendering
  if (HTML_EXTS.includes(ext)) {
    try {
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
}

// ============================================================================
// IPC 注册 (thin wrapper — 委托给 _xxxImpl)
// ============================================================================

export function registerCrudHandlers(): void {
  ipcMain.handle('file:rename', (_, oldPath: string, newName: string) =>
    _fileRenameImpl(oldPath, newName)
  )
  ipcMain.handle('file:move', (_, filePath: string, newParentDir: string) =>
    _fileMoveImpl(filePath, newParentDir)
  )
  ipcMain.handle('file:delete', (_, vaultPath: string, filePath: string) =>
    _fileDeleteImpl(vaultPath, filePath)
  )
  ipcMain.handle('folder:delete', (_, folderPath: string) =>
    _folderDeleteImpl(folderPath)
  )
  ipcMain.handle('folder:create', (_, folderPath: string) =>
    _folderCreateImpl(folderPath)
  )
  ipcMain.handle('file:list', () => _fileListImpl())
  ipcMain.handle('file:search', (_, query: string) => _fileSearchImpl(query))
  ipcMain.handle('file:read', (_, filePath: string) => _fileReadImpl(filePath))
  ipcMain.handle('file:save', (_, filePath: string, content: string) =>
    _fileSaveImpl(filePath, content)
  )
  ipcMain.handle('file:render', (_, filePath: string) => _fileRenderImpl(filePath))
}