/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { fetchURL, saveURLToVault } from '../services/urlFetch'
import { openImportWindow } from '../importWindow'
import { importFilesToVault, setVaultPath } from '../services/clipboard/clipboard'
import { triggerGraphRebuild } from '../graphUtils'
import {
  convertWithJS,
  getSupportedExtensions,
  canTranscribeAudio
} from '../services/operations/converters'

export function registerImportHandlers(): void {
  // ── Import window ──────────────────────────────────────────────────
  ipcMain.handle('import:open', async (event) => {
    const webContents = event.sender
    const mainWindow = webContents.hostWebContents ?? webContents
    openImportWindow(mainWindow as any)
  })

  // ── URL → vault ────────────────────────────────────────────────────
  ipcMain.handle('import:fetchUrl', async (_, url: string) => {
    try {
      const result = await fetchURL(url)
      return { title: result.title, content: result.content }
    } catch (err) {
      log.error('fetchUrl error:', err)
      throw new Error(String(err))
    }
  })

  ipcMain.handle('import:saveUrl', async (_, url: string, vaultPath: string) => {
    try {
      const result = await fetchURL(url)
      return saveURLToVault(url, vaultPath, result.title)
    } catch (err) {
      log.error('saveUrl error:', err)
      throw err
    }
  })

  ipcMain.handle('url:fetch', async (_, url: string) => {
    return fetchURL(url)
  })

  ipcMain.handle('url:save', async (_, url: string, vaultPath: string) => {
    const result = await fetchURL(url)
    return saveURLToVault(url, vaultPath, result.title)
  })

  // ── File import → vault ──────────────────────────────────────────────
  ipcMain.handle('import:files', async (_, filePaths: string[], vaultPath: string) => {
    return importFilesToVault(filePaths, vaultPath)
  })

  ipcMain.handle('import:autoTrigger', async (_, _filePaths: string[]) => {
    // autoAI import queue: removed — was dead code
    return true
  })

  // ── Clipboard capture ───────────────────────────────────────────────
  ipcMain.handle('clipboard:start', (_, vaultPath: string) => {
    setVaultPath(vaultPath)
    triggerGraphRebuild()
    return true
  })

  ipcMain.handle('clipboard:stop', () => {
    return true
  })

  ipcMain.handle('clipboard:setVaultPath', (_, vaultPath: string) => {
    setVaultPath(vaultPath)
    return true
  })

  // ── Format conversion ───────────────────────────────────────────────
  ipcMain.handle('converter:convert', async (_, filePath: string) => {
    return convertWithJS(filePath)
  })

  ipcMain.handle('converter:supported', () => {
    return getSupportedExtensions()
  })

  ipcMain.handle('converter:transcribe', (_, filePath: string) => {
    if (!canTranscribeAudio(filePath)) return { success: false, error: '不支持的音频格式' }
    return { success: false, error: 'Whisper 模型未配置' }
  })
}
