import { FolderOpen, Search, Settings, ChevronRight } from 'lucide-react'
import { FileTree } from './FileTree'
import { SearchResults } from './SearchResults'
import type { FileInfo } from '../types'
import { useState, useEffect } from 'react'

interface VaultInfo {
  path: string
  name: string
  lastOpened: number
}

interface SidebarProps {
  vaultPath: string | null
  wikiFiles?: FileInfo[]
  displayFiles: FileInfo[]
  selectedFile: string | null
  showSearchResults: boolean
  searchQuery: string
  searchResults: FileInfo[]
  onNewVault: () => Promise<void>
  onOpenVault: () => Promise<void>
  onManageVault?: () => void
  onSwitchVault?: (vaultPath: string) => void
  onSearch: (query: string) => void
  onCloseSearch: () => void
  onSelectFile: (path: string) => void
  onNewFile: (folderPath: string, fileName: string) => Promise<void>
  onNewWikiFile?: (folderPath: string) => void
  onNewFolder: (parentPath: string, folderName: string) => Promise<void>
  onRefresh?: () => void
}

export function Sidebar({
  vaultPath, wikiFiles, displayFiles,
  selectedFile, showSearchResults, searchQuery, searchResults,

  _onNewVault,

  _onOpenVault,
  onSearch, onCloseSearch, onSelectFile,
  onNewFile, onNewWikiFile, onNewFolder,
  onRefresh, onManageVault, onSwitchVault,
}: SidebarProps): JSX.Element {
  const [sidebarTab, setSidebarTab] = useState<'files' | 'wiki'>('files')
  const [showVaultMenu, setShowVaultMenu] = useState(false)
  const [showMultiVault, setShowMultiVault] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const [vaultList, setVaultList] = useState<VaultInfo[]>([])

  // Load vault list when popover opens
  useEffect(() => {
    if (showVaultMenu) {
      void (window.api as any).vaultList?.().then((list: VaultInfo[]) => {
        setVaultList(list)
      }).catch(() => setVaultList([]))
    }
  }, [showVaultMenu])

  // Auto-refresh file index when switching to wiki tab
  useEffect(() => {
    if (sidebarTab === 'wiki') {
      void (window.api as any).vaultRefresh?.()
    }
  }, [sidebarTab])

  // P1-2: Close vault menu on Escape
  useEffect(() => {
    if (!showVaultMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowVaultMenu(false); setShowMultiVault(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showVaultMenu])

  // P1-3: Clear switching flag after FileTree renders (approx 300ms covers mount+render)
  useEffect(() => {
    if (!isSwitching) return
    const timer = setTimeout(() => setIsSwitching(false), 300)
    return () => clearTimeout(timer)
  }, [isSwitching])

  const wikiDisplayFiles = wikiFiles ?? displayFiles.filter(f => f.path.startsWith('_wiki/') || f.path === '_wiki')
  const rawFiles = displayFiles.filter(f => f.path.startsWith('_raw/') || f.path === '_raw')

  // Other vaults (excluding current)
  const otherVaults = vaultList.filter(v => v.path !== vaultPath)

  const handleSwitchVault = async (path: string) => {
    setShowVaultMenu(false)
    setShowMultiVault(false)
    if (onSwitchVault) {
      await onSwitchVault(path)
    } else {
      await (window.api as any).vaultOpenPath?.(path)
    }
  }

  return (
    <div className="sidebar">
      {/* Search bar (slides in when searching) */}
      {showSearchResults && (
        <div className="sidebar-search-bar">
          <div className="search-wrapper">
            <Search className="search-icon" size={14} />
            <input type="text" className="search-input" placeholder="搜索文件..." value={searchQuery}
              onChange={e => { void onSearch(e.target.value) }} autoFocus />
            <button className="search-close-btn" onClick={onCloseSearch}>✕</button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      {/* P2-5: Ctrl+1/2 keyboard shortcuts for tab switching */}
      <div className="sidebar-tab-bar" role="tablist" onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); setIsSwitching(true); setSidebarTab('files') }
        if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); setIsSwitching(true); setSidebarTab('wiki') }
      }}>
        <button className={'sidebar-tab' + (sidebarTab === 'files' ? ' active' : '')}
          role="tab"
          aria-selected={sidebarTab === 'files'}
          onClick={() => { setIsSwitching(true); setSidebarTab('files') }}
          title="来源 (Ctrl+1)">来源</button>
        <button className={'sidebar-tab' + (sidebarTab === 'wiki' ? ' active' : '')}
          role="tab"
          aria-selected={sidebarTab === 'wiki'}
          onClick={() => { setIsSwitching(true); setSidebarTab('wiki') }}
          title="知识 (Ctrl+2)">知识</button>
      </div>

      {/* File Tree */}
      <div className="sidebar-files">
        {showSearchResults ? (
          <SearchResults results={searchResults} query={searchQuery} onSelect={onSelectFile} onClose={onCloseSearch} />
        ) : sidebarTab === 'files' ? (
          <FileTree key={vaultPath} files={rawFiles} selectedFile={selectedFile} onSelect={onSelectFile}
            onRefresh={onRefresh}
            onNewFile={() => { void window.api.openImportWindow?.().catch(e => console.error('[Sidebar] openImportWindow failed:', e)) }}
            onNewFolder={(parentPath) => { void onNewFolder(parentPath, 'Untitled').catch?.(err => console.error('[Sidebar] onNewFolder failed:', err)) }}
            vaultPath={vaultPath}
            isSourceTab={true} />
        ) : isSwitching ? (
          <div className="loading" style={{ position: 'absolute', inset: 0, background: 'rgba(var(--bg-primary-rgb),0.7)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="loading-spinner" />
            切换中...
          </div>
        ) : (
          <FileTree key={vaultPath} files={wikiDisplayFiles} selectedFile={selectedFile} onSelect={onSelectFile}
            onRefresh={onRefresh}
            onNewFile={(folderPath) => { void (onNewWikiFile ?? onNewFile)(folderPath || '_wiki', 'Untitled') }}
            onNewFolder={(parentPath) => { const base = (parentPath === vaultPath || !parentPath) ? '_wiki' : parentPath; void onNewFolder(base, 'Untitled').catch?.(err => console.error('[Sidebar] onNewFolder failed:', err)) }}
            vaultPath={vaultPath} />
        )}
      </div>

      {/* Bottom: Obsidian-style vault switcher */}
      <div
        className={`sidebar-footer${vaultPath ? ' sidebar-footer--active' : ' sidebar-footer--empty'}`}
        onClick={vaultPath ? () => setShowVaultMenu(v => !v) : undefined}
        role={vaultPath ? 'button' : undefined}
        tabIndex={vaultPath ? 0 : undefined}
      >
        <FolderOpen size={13} className="sidebar-footer-icon" title={vaultPath ?? '未打开知识库'} />
        <span className="sidebar-footer-vault" title={vaultPath ?? '未打开'}>{vaultPath?.split('/').pop() ?? '未打开'}</span>
        {vaultPath && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="sidebar-footer-cog">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </svg>
        )}

        {showVaultMenu && vaultPath && (
          <>
            <div className="vault-popover-backdrop" onClick={e => { e.stopPropagation(); setShowVaultMenu(false); setShowMultiVault(false) }} />

            {/* Multi-vault panel */}
            {showMultiVault ? (
              <div className="vault-popover vault-popover--wide" onClick={e => e.stopPropagation()}>
                <div className="vault-popover-header">
                  <button className="vault-popover-back" onClick={() => setShowMultiVault(false)}>
                    ← 返回
                  </button>
                  <span>切换知识库</span>
                </div>
                <div className="vault-popover-list">
                  {otherVaults.length === 0 ? (
                    <div className="vault-popover-empty">暂无其他知识库</div>
                  ) : otherVaults.map(vault => (
                    <button
                      key={vault.path}
                      className="vault-popover-vault-item"
                      onClick={() => { void handleSwitchVault(vault.path) }}
                    >
                      <FolderOpen size={14} />
                      <div className="vault-popover-vault-info">
                        <span className="vault-popover-vault-name">{vault.name}</span>
                        <span className="vault-popover-vault-path">{vault.path}</span>
                      </div>
                      <ChevronRight size={12} className="vault-popover-vault-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Main popover */
              <div className="vault-popover" onClick={e => e.stopPropagation()}>
                <div className="vault-popover-current">
                  <FolderOpen size={16} />
                  <span>{vaultPath?.split('/').pop()}</span>
                </div>
                <div className="vault-popover-path">{vaultPath}</div>

                {otherVaults.length > 0 && (
                  <>
                    <div className="vault-popover-divider" />
                    <button className="vault-popover-item vault-popover-item--switch" onClick={() => setShowMultiVault(true)}>
                      <FolderOpen size={14} />
                      <span>切换知识库</span>
                      <span className="vault-popover-badge">{otherVaults.length}</span>
                      <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
                    </button>
                  </>
                )}

                <div className="vault-popover-divider" />
                <button className="vault-popover-item" onClick={() => { void onManageVault?.(); setShowVaultMenu(false) }}>
                  <Settings size={14} /> 管理知识库
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}