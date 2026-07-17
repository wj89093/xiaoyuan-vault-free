/**
 * importHandlers — File import, raw conversion and archive handlers
 *
 * Channels: file:import, file:convertRaw, file:listRaw, file:archiveQuery
 *
 * 测试便利: 4 个 `_xxxImpl` 函数 export, 测试可绕过 ipcMain.handle 直接调用实现.
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { getVaultPath } from '../../services/database/database'
import { convertWithJS } from '../../services/operations/converters'

// ============================================================================
// Internal 实现 (导出用于测试)
// ============================================================================

export interface FileImportResult {
  name: string
  path: string
  status: 'ok' | 'error'
  error?: string
}

export async function _fileImportImpl(
  vaultPath: string,
  filePaths: string[]
): Promise<FileImportResult[]> {
  const { mkdir, copyFile } = await import('fs/promises')
  const { basename, extname } = await import('path')
  const { markConverted } = await import('./utils')
  const results: FileImportResult[] = []
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
}

export interface FileConvertRawResult {
  success: boolean
  mdPath?: string
  error?: string
}

export async function _fileConvertRawImpl(
  rawPath: string,
  _vaultPath: string
): Promise<FileConvertRawResult> {
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
}

export interface RawFileEntry {
  name: string
  path: string
  converted: boolean
}

export interface RawMonthGroup {
  month: string
  files: RawFileEntry[]
}

export async function _fileListRawImpl(vaultPath: string): Promise<RawMonthGroup[]> {
  const { readdir, stat } = await import('fs/promises')
  const { existsSync } = await import('fs')
  const { isConverted } = await import('./utils')
  const rawDir = join(vaultPath, '_raw')
  if (!existsSync(rawDir)) return []
  const months = await readdir(rawDir)
  const result: RawMonthGroup[] = []
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
}

export async function _fileArchiveQueryImpl(content: string): Promise<string> {
  const { mkdir, writeFile } = await import('fs/promises')
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
}

// ============================================================================
// IPC 注册 (thin wrapper — 委托给 _xxxImpl)
// ============================================================================

export function registerImportHandlers(): void {
  ipcMain.handle('file:import', (_, vaultPath: string, filePaths: string[]) =>
    _fileImportImpl(vaultPath, filePaths)
  )
  ipcMain.handle('file:convertRaw', (_, rawPath: string, vaultPath: string) =>
    _fileConvertRawImpl(rawPath, vaultPath)
  )
  ipcMain.handle('file:listRaw', (_, vaultPath: string) => _fileListRawImpl(vaultPath))
  ipcMain.handle('file:archiveQuery', (_, content: string) => _fileArchiveQueryImpl(content))
}
