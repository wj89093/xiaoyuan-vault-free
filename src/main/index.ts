import { config } from 'dotenv'
import { app } from 'electron'

// Load .env: dev from project root, prod from userData
const envPath = app.isPackaged
  ? join(app.getPath('userData'), '.env')
  : join(__dirname, '../../.env')
config({ path: envPath })
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { BrowserWindow, globalShortcut } from 'electron'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log/main'
import { createTray } from './tray'
import { IS_PRO } from './buildFeatures'
import { openImportWindow } from './importWindow'
import { setMainWindowRef } from './mainWindowRef'
import { triggerGraphRebuild } from './graphUtils'
import { registerAuthHandlers, handleAuthCallback } from './ipc/authHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerMiscHandlers } from './ipc/miscHandlers'
import { registerMaintainHandlers } from './ipc/maintainHandlers'

import { registerFileHandlers } from './ipc/fileHandlers'
import { registerVaultHandlers } from './ipc/vaultHandlers'
// 不要在 index.ts 重复注册，否则会报 "Attempted to register a second handler"


// Config file for persisting app state
const configPath = join(app.getPath('userData'), 'vault-config.json')

async function readConfig(): Promise<Record<string, unknown>> {
  try {
    if (existsSync(configPath)) {
      return JSON.parse(await readFile(configPath, 'utf-8')) as Record<string, unknown>
    }
  } catch (err) { log.error('[App] startup error:', err) }
  return {}
}

async function writeConfig(data: Record<string, unknown>): Promise<void> {
  await writeFile(configPath, JSON.stringify(data, null, 2), 'utf-8')
}

// Configure logging
log.initialize()
log.transports.file.level = 'info'

// Global exception handler
process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error)
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    center: true,
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    log.info('Main window ready')
  })

  // Refresh file tree when window comes back from hidden (AI Chat hides main window)
  mainWindow.on('show', () => {
    mainWindow?.webContents.send('import:completed', [])
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch?.(() => {})
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  setMainWindowRef(mainWindow)
}



// IPC Handlers
function setupIpcHandlers(): void {
  // Modular IPC handlers (split by domain)
  registerFileHandlers()
  registerVaultHandlers()
  registerAuthHandlers()
  registerSettingsHandlers()
  registerMiscHandlers()
  registerMaintainHandlers()
  // AI Chat IPC handlers 由 clipboard.ts 的 ensureIPC() 统一注册
}

// ─── URL Scheme 注册 ────────────────────────────────────────
app.setAsDefaultProtocolClient('xiaoyuan')

// 处理 xiaoyuan:// URL 回调（macOS）
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleAuthCallback(url)
})

void app.whenReady().then(() => {
  log.info('App starting...')

  electronApp.setAppUserModelId('com.xiaoyuan.vault')

  // Dock icon stays visible (app also shows in Dock, not just tray)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIpcHandlers()
  createWindow()
  createTray(mainWindow!)

// Helper: ensure main window exists
  const ensureMainWindow = (): BrowserWindow | null => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      createTray(mainWindow!)
    }
    if (mainWindow?.isMinimized()) mainWindow.restore()
    if (mainWindow) { mainWindow.show(); mainWindow.focus() }
    return mainWindow
  }

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    ensureMainWindow()
  })
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    const win = ensureMainWindow()
    win?.webContents.send('shortcut:quick-switch')
  })
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const win = ensureMainWindow()
    if (win) openImportWindow(win)
  })
  // AI Chat shortcut — Pro 版专属
  
  log.info(`[GlobalShortcut] Cmd+Shift+O (show), Cmd+Shift+F (search), Cmd+Shift+I (import)${IS_PRO ? ', Cmd+I (AI Chat)' : ''} registered`)

  app.on('activate', () => {
    const allWindows = BrowserWindow.getAllWindows()
    log.info('[App] activate event, windows:', allWindows.length, 'mainWindow:', !!mainWindow && !mainWindow.isDestroyed())
    // Always restore/create main window
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow()
      createTray(mainWindow!)
    } else {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// Prevent app from quitting when all windows closed (stay in tray)
app.on('window-all-closed', () => {
  log.info('All windows closed, staying in tray')
  // Do NOT quit - keep running in tray on all platforms
})

// Handle tray "退出" to allow clean quit via app.exit()
;(app as any).isQuitting = false

app.on('before-quit', (e) => {
  if (!(app as any).isQuitting) {
    e.preventDefault()
    log.info('Quit prevented, hiding to tray')
  }
})
