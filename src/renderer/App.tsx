/* eslint-disable react-hooks/rules-of-hooks, react-hooks/exhaustive-deps */
import { useEffect, useCallback, lazy, Suspense, type JSX } from 'react'
import React from 'react'
import { QuickSwitch } from './components/QuickSwitch'
// P4-2026-06-02 (backport): lazy 加载 - 知识图谱只在用户点击图标时显示,首屏不加载 vendor-d3(691KB)
const KnowledgeGraph = lazy(() =>
  import('./components/KnowledgeGraph').then((m) => ({ default: m.KnowledgeGraph }))
)
import { ShortcutGuide } from './components/ShortcutGuide'
import { MermaidTest } from './components/MermaidTest'
import { VaultRouter } from './components/VaultRouter'
// 2026-07-09 backport: post-commit audit 配, App 启动检查 uncommitted
import { AuditNotice } from './components/AuditNotice'
import { ImportApp } from './ImportApp'
import { useVaultState } from './hooks/useVaultState'
import type { FileInfo } from '../shared/window'
import { useAppUIState } from './hooks/useAppUIState'
import { useKeyboardShortcuts, useGlobalShortcuts } from './hooks/useKeyboardShortcuts'

import { useImportObserver } from './hooks/useImportObserver'
import { useToasts } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'

// ── Settings event listener hook ────────────────────────────────────
function useSettingsListener(
  openSchema: () => void,
  openLint: () => void,
  openSettings: () => void
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const { panel, tab } = (e as CustomEvent).detail ?? {}
      if (panel === 'schema' || tab === 'schema') {
        openSchema()
      } else if (panel === 'lint' || tab === 'lint') {
        openLint()
      } else {
        openSettings()
      }
    }
    document.addEventListener('open-settings', handler)
    return () => document.removeEventListener('open-settings', handler)
  }, [openSchema, openLint, openSettings])
}

// ── Import observer callback factory ────────────────────────────────
function useImportObserverCallbacks(setFiles: (files: FileInfo[]) => void) {
  return {
    showOnboarding: false,
    onFilesImported: () => {
      window.api.file.list().then((f) => setFiles(f as FileInfo[]))
    },
    onFirstImportAnalyze: async (filePaths: string[], handleSendMessage?: (msg: string) => void) => {
      if (filePaths.length === 0) return
      const filesContent: string[] = []
      for (const p of filePaths.slice(0, 3)) {
        try {
          const c = await window.api.readFile(p)
          const name = p.split('/').pop() ?? p
          filesContent.push(`### ${name}\n${((c ?? '') as string).slice(0, 1500)}`)
        } catch {
          /* skip */
        }
      }
      const hint = filePaths.length > 3 ? `(共 ${filePaths.length} 个，仅展示前 3 个)` : ''
      const question = `我刚导入了 ${filePaths.length} 个文件${hint}。请帮我：

1. 分析这些文件属于哪些领域/主题
2. 建议在 _wiki/ 下创建哪些子目录
3. 为每个领域设计 Schema 字段
4. 告诉我知识库的推荐使用方式

文件内容：
${filesContent.join('\n\n')}`
      handleSendMessage?.(question)
    }
  }
}

// ── Last vault restore ─────────────────────────────────────────────
function useLastVaultRestore(handleOpenVaultItem: (path: string) => void) {
  useEffect(() => {
    if (!window.api) return
    window.api.getLastVault?.().then((vaultPath) => {
      if (vaultPath) handleOpenVaultItem(vaultPath)
    })
  }, [handleOpenVaultItem])
}

// ── Vault path global sync (for CM6 extensions) ─────────────────────
function useVaultPathSync(vaultPath: string | null) {
  useEffect(() => {
    ;(window as any).__vaultPath = vaultPath ?? null
  }, [vaultPath])
}

// ── Theme initialization ─────────────────────────────────────────
function useThemeInit() {
  useEffect(() => {
    const applyTheme = (theme: 'light' | 'dark' | 'system') => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', theme)
      }
    }
    if (!window.api?.settings?.getTheme) {
      // Fallback: system preference
      applyTheme('system')
      return
    }
    window.api.settings.getTheme().then((theme: 'light' | 'dark' | 'system') => {
      applyTheme(theme ?? 'system')
      // Listen for system theme changes when in 'system' mode
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = () => {
        if (theme === 'system') applyTheme('system')
      }
      mq.addEventListener('change', onChange)
    })
  }, [])
}

function App(): JSX.Element {
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  if (hash === '#/mermaid') return <MermaidTest />
  if (hash === '#/import') return <ImportApp />

  // ── Theme ────────────────────────────────────────────────────────
  useThemeInit()

  // ── State from hooks ─────────────────────────────────────────────
  const vaultState = useVaultState()
  const {
    vaultPath,
    files,
    selectedFile,
    setVaultPath: _setVaultPath,
    setSelectedFile
  } = vaultState

  const { toasts, dismiss: dismissToast } = useToasts()

  // ── vault:openFile event (opens agent-prompt.md in editor) ─────────
  // 2026-07-15: free 仓无 vault:fileOpened IPC, 保留 useEffect 框架 (未来兼容)
  useEffect(() => {
    // no-op: free 仓不实现 vault:fileOpened 事件
    return () => { }
  }, [setSelectedFile])

  const ui = useAppUIState()
  const {
    showQuickSwitch,
    setShowQuickSwitch,
    showGraph,
    setShowGraph,
    showShortcuts,
    setShowShortcuts,
    openSettings,
    openLint,
    openSchema,
    openLog
  } = ui

  // ── Import observer ───────────────────────────────────────────────
  const importCb = useImportObserverCallbacks(vaultState.setFiles)
  const { pendingImports, clearPending } = useImportObserver(importCb)

  // Onboarding: first import triggers file analysis (AI prompt was
  // wired through handleSendMessage in earlier versions; that handle
  // is no longer available after the v1.8.0 chat-panel refactor, so
  // we just drain the pending queue here and the read-and-prompt
  // logic remains in importCb.onFirstImportAnalyze for callers that
  // can still pass a working handle).
  useEffect(() => {
    if (
      importCb.showOnboarding &&
      pendingImports.length > 0 &&
      !sessionStorage.getItem('onboarding_analyzed')
    ) {
      sessionStorage.setItem('onboarding_analyzed', '1')
      clearPending()
    }
  }, [pendingImports, importCb.showOnboarding, clearPending])

  // ── Event listeners ──────────────────────────────────────────────
  useSettingsListener(openSchema, openLint, openSettings)

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useKeyboardShortcuts(
    vaultPath,
    setShowQuickSwitch,
    setShowShortcuts,
    showQuickSwitch,
    showShortcuts
  )
  useGlobalShortcuts(vaultPath, setShowQuickSwitch)

  // ── Vault lifecycle ───────────────────────────────────────────────
  const handleOpenVaultItem = useCallback(async (path: string) => {
    const result = await window.api?.vault?.openPath?.(path)
    if (result) _setVaultPath(path)
  }, [])

  useLastVaultRestore(handleOpenVaultItem)
  useVaultPathSync(vaultPath)

  // Load vault list for welcome screen
  useEffect(() => {
    window.api?.vault?.list?.()?.then((vaults) => {
      if (vaults?.length) ui.setVaultList(vaults)
    })
  }, [])

  const handleDeleteVault = useCallback(async (path: string) => {
    if (!window.api) return
    ui.setVaultList((prev: any) => prev.filter((v: any) => v.path !== path))
  }, [])

  const handleReference = useCallback((_ref: any) => {}, [])

  const handleEditorWikiLink = useCallback(
    (target: string) => {
      // Recursively flatten file tree to search all levels
      const flatten = (items: any[]): any[] => {
        const result: any[] = []
        for (const item of items) {
          if (item.isDirectory && item.children) {
            result.push(...flatten(item.children))
          }
          result.push(item)
        }
        return result
      }
      const flatFiles = flatten(files)
      const targetClean = target.replace(/\.md$/, '')
      const match = flatFiles.find((f: any) => {
        const fullPath = String(f.path ?? '')
        const pathNoExt = fullPath.replace(/\.md$/, '')
        const name = fullPath.split('/').pop()?.replace(/\.md$/, '') ?? ''
        return (
          name === targetClean ||
          pathNoExt.endsWith('/' + targetClean) ||
          pathNoExt.endsWith(targetClean) ||
          pathNoExt === targetClean ||
          fullPath === target
        )
      })
      if (match) {
        void vaultState.handleSelectFile(match.path)
        return
      }
      // Not found in file tree — try as relative path, fall back to _wiki/
      if (targetClean.includes('/')) {
        void vaultState.handleSelectFile(targetClean + '.md')
      } else {
        const wikiGuess = '_wiki/' + targetClean + '.md'
        const inWiki = flatFiles.some((f: any) => String(f.path ?? '') === wikiGuess)
        void vaultState.handleSelectFile(inWiki ? wikiGuess : targetClean + '.md')
      }
    },
    [files, vaultState.handleSelectFile]
  )

  // ── IconSidebar view routing ──────────────────────────────────────
  const handleViewChange = useCallback(
    (view: string) => {
      // Toggle: if already on this view, close the panel
      if (ui.activeView === view) {
        if (view === 'graph') setShowGraph(false)
        if (view === 'lint') ui.setShowLint(false)
        if (view === 'log') ui.setShowLog(false)
        if (view === 'settings') ui.setShowSettings(false)
        ui.setActiveView('')
        return
      }
      ui.setActiveView(view)
      if (view === 'graph') {
        setShowGraph((v) => !v)
        return
      }
      if (view === 'settings') {
        openSettings()
        return
      }
      if (view === 'lint') {
        openLint()
        return
      }
      if (view === 'log') {
        openLog()
        return
      }
    },
    [ui, setShowGraph, openSettings, openLint, openLog]
  )

  // P1-2026-06-02 (backport): stable callbacks for memoized KnowledgeGraph / ShortcutGuide
  const handleGraphSelect = useCallback(
    (path: string) => {
      void vaultState.handleSelectFile(path)
      setShowGraph(false)
    },
    [vaultState.handleSelectFile, setShowGraph]
  )
  const handleGraphClose = useCallback(() => setShowGraph(false), [setShowGraph])
  const handleShortcutsClose = useCallback(() => setShowShortcuts(false), [setShowShortcuts])

  // ── Render ────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="app-container">
        {showQuickSwitch && (
          <QuickSwitch
            files={files}
            recentFiles={vaultState.recentFiles}
            onSelect={(path: string) => {
              setSelectedFile(path)
              setShowQuickSwitch(false)
            }}
            onClose={() => setShowQuickSwitch(false)}
          />
        )}
        {showGraph && vaultPath && (
          <div className="kg-overlay">
            <Suspense
              fallback={
                <div className="kg-skeleton" role="status" aria-live="polite" aria-label="加载中">
                  <div className="kg-skeleton-header">
                    <div className="skeleton-line skeleton-line-title" />
                    <div className="skeleton-line skeleton-line-stat" />
                  </div>
                  <div className="kg-skeleton-body">
                    <div className="kg-skeleton-node kg-skeleton-node-1" />
                    <div className="kg-skeleton-node kg-skeleton-node-2" />
                    <div className="kg-skeleton-node kg-skeleton-node-3" />
                  </div>
                </div>
              }
            >
              <KnowledgeGraph
                files={files}
                selectedFile={selectedFile}
                onSelect={handleGraphSelect}
                onClose={handleGraphClose}
              />
            </Suspense>
          </div>
        )}
        {showShortcuts && <ShortcutGuide onClose={handleShortcutsClose} />}

        <VaultRouter
          vaultState={vaultState}
          ui={ui}
          toasts={toasts}
          dismissToast={dismissToast}
          handleOpenVaultItem={handleOpenVaultItem}
          handleDeleteVault={handleDeleteVault}
          handleEditorWikiLink={handleEditorWikiLink}
          handleReference={handleReference}
          handleViewChange={handleViewChange}
        />

        {/* 2026-07-09: 启动 / 切 vault 后检查 uncommitted 改动 */}
        <AuditNotice
          vaultPath={vaultPath}
          onOpenAudit={() => {
            // 直接跳 audit tab (LogPanel initialTab = 'audit')
            ui.openLogWithTab('audit')
          }}
        />
      </div>
    </ErrorBoundary>
  )
}

export default App
