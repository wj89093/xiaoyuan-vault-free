import React from 'react'
import type { JSX } from 'react'
import { Sidebar } from './Sidebar'
import { IconSidebar } from './IconSidebar'
import { EditorHeader } from './EditorHeader'
import { Editor } from './Editor'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { WelcomeScreen } from './WelcomeScreen'
import { VaultCreationWizard } from './VaultCreationWizard'
import { BacklinksPanel } from './BacklinksPanel'
import { TrashPanel } from './TrashPanel'
import { SearchPanel } from './SearchPanel'
import { IndexFloat } from './IndexFloat'
import { OutputPanel } from './OutputPanel'
import { MemoryPanel } from './MemoryPanel'
import { SettingsPanel } from './SettingsPanel'
import { LintPanel } from './LintPanel'
import { LogPanel } from './LogPanel'
import { SchemaPanel } from './SchemaPanel'
import { ToastContainer, type ToastMessage } from './Toast'
import type { VaultState } from '../hooks/useVaultState'
import type { AppUIState } from '../hooks/useAppUIState'

interface VaultRouterProps {
  vaultState: VaultState
  ui: AppUIState
  toasts: Array<{ id: string; type: 'success' | 'error' | 'warning' | 'info'; message: string }>
  dismissToast: (id: string) => void
  handleOpenVaultItem: (path: string) => Promise<void>
  handleDeleteVault: (path: string) => Promise<void>
  handleEditorWikiLink: (target: string) => void
  handleReference: (ref: any) => void
  handleViewChange: (view: string) => void
}

export function VaultRouter({
  vaultState,
  ui,
  toasts,
  dismissToast,
  handleOpenVaultItem,
  handleDeleteVault,
  handleEditorWikiLink,
  handleReference,
  handleViewChange
}: VaultRouterProps): JSX.Element {
  const {
    vaultPath,
    files,
    selectedFile,
    content,
    isDirty,
    setVaultPath: _setVaultPath,
    setSelectedFile,
    setContent,
    handleNewVault,
    handleOpenVault,
    handleSelectFile,
    handleSave,
    handleNewFile,
    handleNewFolder,
    handleRefresh,
    handleSearch,
    handleCloseSearch,
    handleContentChange
  } = vaultState

  const wikiFiles = files.filter(
    (f: any) => (f.path as string).startsWith('_wiki/') || f.path === '_wiki'
  )
  const displayFiles = vaultState.showSearchResults ? vaultState.searchResults : files

  if (!vaultPath || ui.showOnboarding) {
    return (
      <>
        <WelcomeScreen
          onOpenVault={() => void handleOpenVault()}
          onNewVault={() => ui.setShowVaultCreation(true)}
          showOnboarding={ui.showOnboarding}
          onCompleteOnboarding={() => {
            ui.setShowOnboarding(false)
            setTimeout(() => {
              if (vaultPath) handleSelectFile(vaultPath + '/_wiki/使用说明.md')
            }, 1000)
          }}
          vaults={ui.vaultList}
          onOpenVaultItem={handleOpenVaultItem}
          onDeleteVault={handleDeleteVault}
        />
        {ui.showVaultCreation && (
          <VaultCreationWizard
            onClose={() => ui.setShowVaultCreation(false)}
            onCreated={(path, name) => {
              ui.setVaultList(((prev: any) => {
                const filtered = prev.filter((v: any) => v.path !== path)
                return [{ path, name, lastOpened: Date.now() }, ...filtered]
              }) as any)
              ui.setShowVaultCreation(false)
              ui.setShowOnboarding(true)
              _setVaultPath(path)
              // Refresh file tree after creating vault
              void handleRefresh()
              // Auto-open 使用说明.md shortly after wizard closes
              setTimeout(() => {
                handleSelectFile(path + '/_wiki/使用说明.md')
              }, 300)
            }}
          />
        )}
        <ToastContainer toasts={toasts as unknown as ToastMessage[]} onDismiss={dismissToast} />
      </>
    )
  }

  // ── Main editor layout ──────────────────────────────────────────
  return (
    <>
      <IconSidebar
        activeView={ui.activeView}
        onViewChange={handleViewChange}
        onSearchFocus={() => ui.setShowSearchFloat(((v) => !v) as any)}
        onBriefingClick={() => {
          ui.setActiveView('review')
          ui.setShowBriefing(((v) => !v) as any)
        }}
        onSchemaClick={() => ui.setShowSchema(((v) => !v) as any)}
        onOpenTrash={() => ui.setShowTrash(((v) => !v) as any)}
        onOpenOutput={() => ui.setShowOutput(((v) => !v) as any)}
        onIndexClick={() => {
          ui.setShowIndexFloat(((v) => !v) as any)
        }}
      />
      <Sidebar
        vaultPath={vaultPath}
        wikiFiles={wikiFiles}
        displayFiles={displayFiles}
        selectedFile={selectedFile}
        showSearchResults={vaultState.showSearchResults}
        searchQuery={vaultState.searchQuery}
        searchResults={vaultState.searchResults}
        onNewVault={handleNewVault}
        onOpenVault={handleOpenVault}
        onManageVault={() => {
          _setVaultPath(null)
          setSelectedFile('')
          setContent('')
          ui.setShowOnboarding(false)
          ui.setShowVaultCreation(false)
        }}
        onSwitchVault={handleOpenVaultItem}
        onSearch={handleSearch}
        onCloseSearch={handleCloseSearch}
        onSelectFile={handleSelectFile}
        onNewFile={handleNewFile}
        onNewWikiFile={(folderPath) => void handleNewFile(folderPath || '_wiki', 'Untitled')}
        onNewFolder={handleNewFolder}
        onRefresh={handleRefresh}
      />
      <div className="main-content">
        {ui.showBacklinks && (
          <BacklinksPanel
            selectedFile={selectedFile}
            onNavigate={(path) => {
              handleSelectFile(path)
              ui.setShowBacklinks(false)
            }}
            onClose={() => ui.setShowBacklinks(false)}
          />
        )}
        {ui.showBriefing && <MemoryPanel onClose={() => ui.setShowBriefing(false)} />}
        <div className="editor-container">
          {selectedFile ? (
            <>
              <EditorHeader
                selectedFile={selectedFile}
                isDirty={isDirty}
                onSave={() => {
                  void handleSave()
                }}
                onShowHistory={() => {
                  ui.openVersionHistory()
                }}
              />
              <Editor
                key={selectedFile ?? '__empty__'}
                value={content}
                onChange={handleContentChange}
                onWikiLinkNavigate={handleEditorWikiLink}
                nativePreview={vaultState.nativePreview}
                isNativePreview={vaultState.isNativePreview}
                onReference={handleReference}
              />
            </>
          ) : (
            <div className="welcome-screen">
              <span className="welcome-title">选择或创建文件</span>
              <span className="welcome-desc">
                在左侧选择一个文件进行编辑，或点击工具栏创建新文件
              </span>
            </div>
          )}
        </div>
      </div>

      {ui.showVersionHistory && selectedFile && (
        <VersionHistoryPanel
          filePath={selectedFile}
          fileName={selectedFile.split('/').pop() ?? '文件'}
          onClose={() => {
            ui.setShowVersionHistory(false)
          }}
          onRestore={() => {
            void vaultState.handleSelectFile(selectedFile)
          }}
        />
      )}

      {ui.showSettings && (
        <SettingsPanel
          onClose={() => ui.setShowSettings(false)}
          _vaultPath={vaultPath}
          _onSelectFile={handleSelectFile as any}
        />
      )}
      {ui.showIndexFloat && (
        <IndexFloat
          vaultPath={vaultPath}
          files={files}
          onSelectFile={handleSelectFile}
          onClose={() => ui.setShowIndexFloat(false)}
        />
      )}
      {ui.showSearchFloat && (
        <SearchPanel
          onClose={() => ui.setShowSearchFloat(false)}
          onSelectFile={(path) => {
            handleSelectFile(path)
            ui.setShowSearchFloat(false)
          }}
        />
      )}
      {ui.showOutput && <OutputPanel onClose={() => ui.setShowOutput(false)} />}
      {ui.showTrash && vaultPath && (
        <TrashPanel
          vaultPath={vaultPath}
          onNavigate={(path) => {
            handleSelectFile(path)
            ui.setShowTrash(false)
          }}
          onClose={() => ui.setShowTrash(false)}
        />
      )}
      {ui.showLint && <LintPanel onClose={() => ui.setShowLint(false)} vaultPath={vaultPath} />}
      {ui.showSchema && <SchemaPanel onClose={() => ui.setShowSchema(false)} />}
      {ui.showLog && (
        <LogPanel onClose={() => ui.setShowLog(false)} onSelectFile={handleSelectFile} />
      )}

      <ToastContainer toasts={toasts as unknown as ToastMessage[]} onDismiss={dismissToast} />
    </>
  )
}
