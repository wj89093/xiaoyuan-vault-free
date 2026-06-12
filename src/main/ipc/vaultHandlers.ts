import { ipcMain, dialog, BrowserWindow } from 'electron'
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
// v1.9: STATE_MAP.json — AI 入门手册, 列出 vault 所有状态文件
import { writeStateMap } from '../services/state/stateMap'
// v1.5: 共享 readConfig/writeConfig (从 services/config 抽出来)
import { readConfig, writeConfig } from '../services/config'

async function addVaultToList(vaultPath: string): Promise<void> {
  const config = await readConfig()
  const vaults = config.vaults ?? []
  const name = vaultPath.split('/').pop() ?? '未命名'
  const filtered = vaults.filter((v) => v.path !== vaultPath)
  filtered.unshift({ path: vaultPath, name, lastOpenedAt: Date.now() })
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
  ['vault-summary-template.md', '_briefing/summary.md'],
  ['LLM-wiki.md', 'LLM-wiki.md'],
  ['markdown-capabilities.md', 'MARKDOWN_CAPABILITIES.md'],
  // Phase 1 (2026-06-11): 对接外部 AI 指引
  ['connect-template.md', 'CONNECT.md'],
  // v1.9 (2026-06-12): AI 入门指南 — 告诉外部 AI 怎么使用 _state/ SUMMARY/INDEX
  ['ai-onboarding-v19.md', 'AI-ONBOARDING.md']
]
const VAULT_OPTIONAL_TEMPLATES: Array<[string, string]> = [
  ['vault-usage-guide.md', '_wiki/使用说明.md'],
  ['AGENTS.md', 'AGENTS.md']
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
  // v1.6: 递归拷贝 skills/ 整个目录到 vault 根
  await writeSkillTemplates(vaultPath)
}

// v1.6: 拷贝 skills/ 整个目录 (9 个 Skill 模板)
async function writeSkillTemplates(vaultPath: string): Promise<void> {
  const srcDir = join(__dirname, '..', 'templates', 'skills')
  const destDir = join(vaultPath, 'skills')
  if (!existsSync(srcDir)) return
  if (!existsSync(destDir)) await mkdir(destDir, { recursive: true })
  const { readdir } = await import('fs/promises')
  const files = (await readdir(srcDir)).filter((f: string) => f.endsWith('.md'))
  for (const f of files) {
    const content = await readFile(join(srcDir, f), 'utf-8')
    await writeFile(join(destDir, f), content, 'utf-8')
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
    const vaultPath = config.lastVaultPath
    if (vaultPath && existsSync(vaultPath)) {
      await initDatabase(vaultPath)
      setVaultPath(vaultPath)
      startFileWatcher(vaultPath)
      triggerGraphRebuild()
      return vaultPath
    }
    return null
  })

  // v1.5: 上次打开文件记忆 — 重开 vault 自动选中上次文件
  ipcMain.handle('vault:getLastFile', async (_event, vaultPath: string): Promise<string | null> => {
    const config = await readConfig()
    const lastFiles = config.lastFiles ?? {}
    return lastFiles[vaultPath] ?? null
  })

  ipcMain.handle(
    'vault:setLastFile',
    async (_event, vaultPath: string, filePath: string): Promise<boolean> => {
      try {
        const config = await readConfig()
        const lastFiles = config.lastFiles ?? {}
        lastFiles[vaultPath] = filePath
        await writeConfig({ ...config, lastFiles })
        return true
      } catch (err) {
        log.error('[Vault] setLastFile failed:', err)
        return false
      }
    }
  )

  ipcMain.handle('vault:create', async () => {
    const mainWindow = getMainWindow()
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '新建知识库',
      buttonLabel: '创建知识库',
      defaultPath: '我的知识库',
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

      // Phase 1: _state/VAULT_STATE.json (创建后立即写, 外部 AI 能读到)
      await writeVaultState(vaultPath)
      // v1.9: _state/STATE_MAP.json — 同步写出 vault 状态地图
      await writeStateMap()

      return vaultPath
    }
  })

  ipcMain.handle('vault:clear', async () => {
    await writeConfig({ vaults: [] })
    return true
  })

  ipcMain.handle('vault:createAt', async (_, vaultPath: string) => {
    try {
      const result = await createVaultAtPath(vaultPath)
      // Phase 1: _state/VAULT_STATE.json (创建后立即写)
      if (result) {
        await writeVaultState(vaultPath)
        // v1.9: 同步 STATE_MAP
        await writeStateMap()
      }
      return result
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
      // Phase 1: _state/VAULT_STATE.json (Obsidian 模式)
      await writeVaultState(vaultPath)
      // v1.9: 同步 STATE_MAP
      await writeStateMap()
      return vaultPath
    }
    return null
  })

  ipcMain.handle('vault:path', () => {
    return getVaultPath()
  })

  ipcMain.handle('vault:list', async () => {
    const config = await readConfig()
    const all = config.vaults ?? []
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
    // Phase 1: _state/VAULT_STATE.json (Obsidian 模式)
    await writeVaultState(vaultPath)
    // v1.9: 同步 STATE_MAP
    await writeStateMap()
    return vaultPath
  })

  ipcMain.handle('vault:remove', async (_, vaultPath: string) => {
    const config = await readConfig()
    const vaults = config.vaults ?? []
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

// ─── Phase 1: _state/VAULT_STATE.json (Obsidian 模式, 2026-06-11) ────────
async function writeVaultState(vaultPath: string): Promise<void> {
  try {
    const stateDir = join(vaultPath, '_state')
    await mkdir(stateDir, { recursive: true })
    const state = JSON.stringify(
      {
        currentVault: 'personal',
        updatedAt: new Date().toISOString(),
        isSwitching: false,
        vault: {
          path: vaultPath,
          name: vaultPath.split('/').pop() ?? ''
        },
        personalVault: null,
        teamVault: null
      },
      null,
      2
    )
    await writeFile(join(stateDir, 'VAULT_STATE.json'), state, 'utf-8')
  } catch (e) {
    log.warn('[VAULT_STATE] write failed:', e)
  }
}
