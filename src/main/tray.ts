import { Tray, Menu, nativeImage, app, Notification } from 'electron'
import { join } from 'path'
import log from 'electron-log/main'
import { openImportWindow } from './importWindow'
// 2026-07-16 (Free 仓 backport from team 37a8b15): 删 eslint-disable, 用 setIsQuitting 替代 (app as any).isQuitting
import { setIsQuitting } from './index'

let tray: Electron.Tray | null = null

export function createTray(mainWindow: Electron.BrowserWindow): Electron.Tray {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(__dirname, '../../resources/icon.png')

  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    log.warn('Tray icon not found, using fallback')
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANklEQVR4nGNgGLyg6v9/FEyGxi1omAiDsGvENIg2BhCnGY8hw8CAgY8FVEPITEjYDSJRI70BAIlX/REcJpYbAAAAAElFTkSuQmCC'
    )
  } else {
    icon = icon.resize({ width: 16, height: 16 })
  }

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开晓园 Vault',
      click: () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: '快速导入文件...',
      click: () => {
        if (!mainWindow.isDestroyed()) openImportWindow(mainWindow)
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setIsQuitting(true)
        app.quit()
      }
    }
  ])

  tray.setToolTip('晓园 Vault')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  tray.on('double-click', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  log.info('Tray created')
  return tray
}

export function showTrayNotification(title: string, body?: string): void {
  if (!Notification.isSupported()) {
    log.warn('[Tray] notifications not supported on this platform')
    return
  }
  const notification = new Notification({
    title: `晓园 Vault：${title}`,
    body: body ?? '',
    silent: false
  })
  notification.on('click', () => {
    if (!tray) return
    // macOS: bring app to foreground
    app.show()
    app.focus()
  })
  notification.show()
  log.info(`[Tray] notification: ${title}`)
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
