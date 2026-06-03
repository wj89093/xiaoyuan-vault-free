/**
 * fileWatcher — vault 目录变更监听
 *
 * P1-2026-06-03 (Free 仓): 监听 vault 文件系统变化,emit `file:changed` IPC 事件
 * 让 KnowledgeGraph 等组件能感知外部 app 改动(如 git pull、外置编辑器保存等)
 *
 * 替代方案:用 chokidar(更稳,API 更干净)。本实现用 Node 内置 fs.watch 以避免新增依赖。
 *
 * 已知限制:
 * - fs.watch 在 Linux 上 recursive: true 是 Node 20+ 才支持的;macOS/Windows 一直支持
 * - rename 事件不区分 create vs delete,本 watcher 统一报 `modified` 供 Graph 重建
 *   (Graph 增量重建对 create/delete/modify 都适用,无需精细区分)
 * - 过滤掉 .git/、node_modules/、.system/、.trash/ 等内部目录
 */

import { watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { getMainWindowRef } from '../mainWindowRef'

export interface FileChange {
  path: string
  type: 'modified' | 'created' | 'deleted'
}

let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingChanges = new Map<string, FileChange>()
const DEBOUNCE_MS = 500

/** 不监听这些内部目录的文件变化 */
const IGNORED_PATTERNS = ['.git/', 'node_modules/', '.system/', '.trash/', '.DS_Store']

function shouldIgnore(filename: string): boolean {
  return IGNORED_PATTERNS.some((p) => filename.includes(p))
}

function flush(): void {
  if (pendingChanges.size === 0) return
  const changes = Array.from(pendingChanges.values())
  pendingChanges.clear()
  const win = getMainWindowRef()
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send('file:changed', changes)
  } catch (err) {
    console.error('[fileWatcher] send failed:', err)
  }
}

/**
 * 启动 vault 监听。
 * 若已有 watcher,先关闭。
 */
export function startFileWatcher(vaultPath: string): void {
  stopFileWatcher()
  if (!vaultPath) return

  try {
    watcher = watch(
      vaultPath,
      { recursive: true, persistent: true },
      (eventType, filename) => {
        if (!filename) return
        if (shouldIgnore(filename)) return
        // fs.watch 在 macOS 上 filename 是相对路径,在 Windows 上是绝对路径
        // 统一用绝对路径(主进程 viewer 端按绝对路径处理)
        const fullPath = filename.startsWith('/') ? filename : join(vaultPath, filename)
        // eventType: 'change' (内容修改) | 'rename' (创建/删除/重命名)
        // Graph 增量重建对三者都适用,统一标 'modified'
        const change: FileChange = { path: fullPath, type: 'modified' }
        pendingChanges.set(fullPath, change)

        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(flush, DEBOUNCE_MS)
      }
    )
    watcher.on('error', (err) => {
      console.error('[fileWatcher] watch error:', err)
    })
    console.log('[fileWatcher] started for', vaultPath)
  } catch (err) {
    console.error('[fileWatcher] start failed:', err)
  }
}

/**
 * 停止当前 watcher。
 */
export function stopFileWatcher(): void {
  if (watcher) {
    try {
      watcher.close()
    } catch (err) {
      console.error('[fileWatcher] close failed:', err)
    }
    watcher = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  pendingChanges.clear()
}

/** 测试/调试用: 当前是否在监听 */
export function isFileWatcherActive(): boolean {
  return watcher !== null
}
