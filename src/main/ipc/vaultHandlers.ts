import { ipcMain, dialog, app, type BrowserWindow } from 'electron'
import { getMainWindowRef } from '../mainWindowRef'
import { mkdir, writeFile, readFile, symlink } from 'fs/promises'
import { join } from 'path'
import log from 'electron-log/main'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { initDatabase, getVaultPath } from '../services/database/database'
/* autoAI engine: removed */
import { setVaultPath } from '../services/clipboard/clipboard'
import { triggerGraphRebuild } from '../graphUtils'
import { startFileWatcher } from '../services/fileWatcher'

const configPath = join(app.getPath('userData'), 'vault-config.json')

async function readConfig(): Promise<Record<string, unknown>> {
  try {
    if (existsSync(configPath)) {
      return JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
    }
  } catch {
    log.warn('[Vault] operation failed')
  }
  return {}
}

async function writeConfig(data: Record<string, unknown>): Promise<void> {
  await writeFile(configPath, JSON.stringify(data, null, 2), 'utf-8')
}

async function addVaultToList(vaultPath: string): Promise<void> {
  const config = await readConfig()
  const vaults =
    (config.vaults as Array<{ path: string; name: string; lastOpened: number }> | undefined) ?? []
  const name = vaultPath.split('/').pop() ?? '未命名'
  const filtered = vaults.filter((v) => v.path !== vaultPath)
  filtered.unshift({ path: vaultPath, name, lastOpened: Date.now() })
  await writeConfig({ ...config, vaults: filtered.slice(0, 10), lastVaultPath: vaultPath })
}

function getMainWindow(): BrowserWindow | null {
  return getMainWindowRef()
}

// ── Vault skeleton helpers (DRY extraction) ────────────────────────────────
const VAULT_DIRS = ['_raw', '_wiki', '_schema', '_lint', '_briefing', '_output'] as const
const VAULT_TEMPLATES: Array<[string, string]> = [
  ['vault-index-template.md', 'index.md'],
  ['vault-log-template.md', 'log.md'],
  ['vault-lint-template.md', '_lint/lint.md'],
  ['vault-summary-template.md', '_briefing/summary.md']
]
const VAULT_OPTIONAL_TEMPLATES: Array<[string, string]> = [
  ['vault-usage-guide.md', '_wiki/使用说明.md'],
  ['LLM-wiki.md', 'LLM-wiki.md'],
  ['Agents.md', 'Agents.md']
]

async function initVaultDirs(vaultPath: string): Promise<void> {
  for (const dir of VAULT_DIRS) {
    await mkdir(join(vaultPath, dir), { recursive: true })
  }
}

async function writeVaultTemplates(vaultPath: string): Promise<void> {
  for (const [tplName, destRel] of VAULT_TEMPLATES) {
    const tplPath = join(__dirname, '..', 'templates', tplName)
    if (existsSync(tplPath)) {
      await writeFile(join(vaultPath, destRel), await readFile(tplPath, 'utf-8'), 'utf-8')
    }
  }
  for (const [tplName, destRel] of VAULT_OPTIONAL_TEMPLATES) {
    const tplPath = join(__dirname, '..', 'templates', tplName)
    if (existsSync(tplPath)) {
      await writeFile(join(vaultPath, destRel), await readFile(tplPath, 'utf-8'), 'utf-8')
    }
  }
}

async function createVaultAtPath(vaultPath: string): Promise<string> {
  await mkdir(vaultPath, { recursive: true })
  await initVaultDirs(vaultPath)
  await writeVaultTemplates(vaultPath)
  await initDatabase(vaultPath)
  await addVaultToList(vaultPath)
  setVaultPath(vaultPath)
  startFileWatcher(vaultPath)
  triggerGraphRebuild()
  return vaultPath
}

export function registerVaultHandlers(): void {
  registerVaultLifecycleHandlers()
  registerVaultBrowseHandlers()
  registerVaultDialogHandlers()
}

function registerVaultLifecycleHandlers(): void {
  ipcMain.handle('vault:getLast', async () => {
    const config = await readConfig()
    const vaultPath = config.lastVaultPath as string | undefined
    if (vaultPath && existsSync(vaultPath)) {
      await initDatabase(vaultPath)
      setVaultPath(vaultPath)
      startFileWatcher(vaultPath)
      triggerGraphRebuild()
      return vaultPath
    }
    return null
  })

  ipcMain.handle('vault:create', async () => {
    const mainWindow = getMainWindow()
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '新建知识库',
      buttonLabel: '创建知识库',
      nameFieldStringValue: '我的知识库',
      properties: ['createDirectory']
    })
    if (!result.canceled && result.filePath) {
      const vaultPath = result.filePath
      await createVaultAtPath(vaultPath)

      // Create desktop shortcut to Raw folder
      try {
        const vaultName = vaultPath.split('/').pop() ?? 'Vault'
        const desktopRaw = join(homedir(), 'Desktop', vaultName + '-Raw')
        const rawDir = join(vaultPath, '_raw')
        if (!existsSync(desktopRaw)) {
          await symlink(rawDir, desktopRaw, 'dir')
        }
      } catch (e) {
        log.warn('[Vault] desktop symlink failed (non-critical):', e)
      }

      return vaultPath
    }
  })

  ipcMain.handle('vault:clear', async () => {
    await writeConfig({})
    return true
  })

  ipcMain.handle('vault:createAt', async (_, vaultPath: string) => {
    try {
      return await createVaultAtPath(vaultPath)
    } catch (err) {
      console.error('[Vault] createVaultAtPath error:', err)
      return null
    }
  })
}

function registerVaultBrowseHandlers(): void {
  ipcMain.handle('vault:open', async () => {
    const mainWindow = getMainWindow()
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '选择 Vault 文件夹'
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const vaultPath = result.filePaths[0]
      await initDatabase(vaultPath)
      await addVaultToList(vaultPath)
      setVaultPath(vaultPath)
      startFileWatcher(vaultPath)
      triggerGraphRebuild()
      return vaultPath
    }
    return null
  })

  ipcMain.handle('vault:path', () => {
    return getVaultPath()
  })

  ipcMain.handle('vault:list', async () => {
    const config = await readConfig()
    const all =
      (config.vaults as Array<{ path: string; name: string; lastOpened: number }> | undefined) ?? []
    const existing = all.filter((v) => existsSync(v.path))
    // Clean up stale entries from config
    if (existing.length !== all.length) {
      await writeConfig({ ...config, vaults: existing })
    }
    return existing
  })

  ipcMain.handle('vault:openPath', async (_, vaultPath: string) => {
    if (!existsSync(vaultPath)) return null
    await initDatabase(vaultPath)
    await addVaultToList(vaultPath)
    setVaultPath(vaultPath)
    startFileWatcher(vaultPath)
    triggerGraphRebuild()
    return vaultPath
  })

  ipcMain.handle('vault:remove', async (_, vaultPath: string) => {
    const config = await readConfig()
    const vaults =
      (config.vaults as Array<{ path: string; name: string; lastOpened: number }> | undefined) ?? []
    await writeConfig({ ...config, vaults: vaults.filter((v) => v.path !== vaultPath) })
    return true
  })

  ipcMain.handle('vault:refresh', async () => {
    const vp = getVaultPath()
    if (!vp) return { ok: false }
    try {
      await initDatabase(vp)
      const main = getMainWindow()
      if (main && !main.isDestroyed()) main.webContents.send('import:completed', [])
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
}

function registerVaultDialogHandlers(): void {
  ipcMain.handle('dialog:selectDirectory', async () => {
    const win =
      getMainWindow() ??
      BrowserWindow.getFocusedWindow() ??
      BrowserWindow.getAllWindows()[0] ??
      null
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择知识库存放位置'
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
