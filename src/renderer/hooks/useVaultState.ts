import type { XyVaultAPI } from '../../shared/window'
import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileInfo } from '../types'
import { showToast } from '../components/Toast'
import { useVaultSearch } from './useVaultSearch'

const api: XyVaultAPI = window.api

export interface VaultState {
  vaultPath: string | null
  files: FileInfo[]
  selectedFile: string | null
  // 2026-07-07 (backport from team 0640bba + 097dc46): multi-tab support
  // openTabs 维护所有打开的文件, selectedFile 是 derived (openTabs[activeTabIndex])
  openTabs: string[]
  activeTabIndex: number
  content: string
  isDirty: boolean
  searchQuery: string
  searchResults: FileInfo[]
  showSearchResults: boolean
  nativePreview: { path: string; content: string } | null
  isNativePreview: boolean
  recentFiles: Array<{ path: string; name: string }>
  // Setters
  setVaultPath: (v: string | null) => void
  setFiles: (f: FileInfo[]) => void
  setSelectedFile: (f: string | null) => void
  setContent: (c: string) => void
  setIsDirty: (d: boolean) => void
  setNativePreview: (p: { path: string; content: string } | null) => void
  setIsNativePreview: (v: boolean) => void
  setShowSearchResults: (v: boolean) => void
  // Tab operations (backport from team)
  openTab: (path: string) => void
  closeTab: (index: number) => void
  switchTab: (index: number) => void
  // Actions
  handleNewVault: () => Promise<void>
  handleOpenVault: () => Promise<void>
  // 2026-07-07 (backport from team 097dc46): handleSelectFile 加 addTab 参数
  //   addTab=false (默认, FileTree 点击): 重置 openTabs=[filePath], 单 tab 模式
  //   addTab=true (右键/主动): 多 tab 模式, 加新 tab 或切到已存在的 tab
  handleSelectFile: (filePath: string, options?: { addTab?: boolean }) => Promise<void>
  handleSave: () => Promise<void>
  handleNewFile: (folderPath: string, fileName: string) => Promise<void>
  handleNewFolder: (parentPath: string, folderName: string) => Promise<void>
  handleRefresh: () => Promise<void>
  handleSearch: (query: string) => Promise<void>
  handleCloseSearch: () => void
  handleOpenSearch: () => void
  handleContentChange: (value: string) => void
  handleSaveAIMessage: (content: string) => Promise<void>
}

export function useVaultState() {
  /* eslint-disable react-hooks/set-state-in-effect */
  const [vaultPath, setVaultPath] = useState<string | null>(null)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  // 2026-07-07 (backport from team 0640bba): multi-tab state
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState<number>(0)
  const [content, setContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)
  const [_isLoading, setIsLoading] = useState(false)
  const [nativePreview, setNativePreview] = useState<{ path: string; content: string } | null>(null)
  const [isNativePreview, setIsNativePreview] = useState(false)
  const [recentFiles, setRecentFiles] = useState<Array<{ path: string; name: string }>>([])
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Search state (extracted hook) ────────────────────────────────
  const search = useVaultSearch()

  const handleNewVault = useCallback(async () => {
    const path = await api.openVault()
    if (path) {
      setVaultPath(path)
      const fileList = await api.listFiles()
      setFiles(fileList)
      window.__vaultFiles = fileList
      showToast('success', '知识库已创建并打开')
    }
  }, [])

  const handleOpenVault = useCallback(async () => {
    const path = await api.openVault()
    if (path) {
      setVaultPath(path)
      const fileList = await api.listFiles()
      setFiles(fileList)
      window.__vaultFiles = fileList
      // v1.5: 自动选中上次打开的文件 (inline, 避免引未声明的 handleSelectFile)
      try {
        const lastFile = await api.getLastFile?.(path)
        if (lastFile && fileList.some((f: FileInfo) => f.path === lastFile && !f.isDirectory)) {
          setSelectedFile(lastFile)
          const ext = lastFile.split('.').pop()?.toLowerCase() ?? ''
          const isMarkdown = ['md', 'markdown', 'mdown', 'mkd'].includes(ext)
          if (isMarkdown) {
            try {
              const c = await api.readFile(lastFile)
              setContent(c)
              setIsDirty(false)
            } catch {
              /* 文件被删 */
            }
          } else {
            // 二进制: 走 native preview
            setContent('')
            setIsNativePreview(true)
            setNativePreview(null)
            setIsLoading(true)
            try {
              const preview = await api.renderFile?.(lastFile)
              setNativePreview((preview ?? { type: 'unsupported' }) as any)
            } catch {
              setNativePreview({ type: 'unsupported' } as any)
            } finally {
              setIsLoading(false)
            }
          }
        }
      } catch {
        /* 不阻断 vault 打开 */
      }
      showToast('success', '知识库已打开')
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    const fileList = await api.listFiles()
    setFiles(fileList)
  }, [])

  // Auto-refresh file tree when Agent writes/edits files (import:completed event)
  useEffect(() => {
    const unsub = window.api?.onImportCompleted?.(() => {
      void handleRefresh()
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelectFile = useCallback(
    async (filePath: string, options?: { addTab?: boolean }) => {
      // 2026-07-07 (backport from team 097dc46): 加 addTab 参数
      //   addTab=false (默认, FileTree 点击): 重置 openTabs=[filePath], activeTabIndex=0 (单 tab 模式)
      //   addTab=true (右键/主动): 保留多 tab 逻辑 (加新 tab 或切到已存在的 tab)
      //   不管哪种, 都走完整流程 (auto-save 当前 + readFile + setContent)
      const addTab = options?.addTab ?? false
      const tabIndex = openTabs.indexOf(filePath)
      if (addTab) {
        if (tabIndex >= 0) {
          // 已开 tab → 切到该 tab
          setActiveTabIndex(tabIndex)
        } else {
          // 新文件 → 添加 tab
          setOpenTabs(prev => [...prev, filePath])
          setActiveTabIndex(openTabs.length)
        }
      } else {
        // 单 tab 模式: 重置 openTabs 为 [新文件], activeTabIndex=0
        //   避免 FileTree 浏览时 tab bar 被旧 tab 干扰
        setOpenTabs([filePath])
        setActiveTabIndex(0)
      }
      setSelectedFile(filePath)

      // Flush auto-save (only for markdown files — skip binary previews)
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = null
      }
      const prevExt = selectedFile?.split('.').pop()?.toLowerCase() ?? ''
      const prevIsMD = ['md', 'markdown', 'mdown', 'mkd'].includes(prevExt)
      if (selectedFile && isDirty && prevIsMD) {
        await api.saveFile(selectedFile, content).catch?.(() => {})
      }
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const isMarkdown = ['md', 'markdown', 'mdown', 'mkd'].includes(ext)
      if (!isMarkdown) {
        setSelectedFile(filePath)
        setContent('')
        setIsNativePreview(true)
        setNativePreview(null)
        setIsLoading(true)
        try {
          const preview = await api.renderFile?.(filePath)
          setNativePreview((preview ?? { type: 'unsupported' }) as any)
        } catch {
          setNativePreview({ type: 'unsupported' } as any)
        } finally {
          setIsLoading(false)
        }
        setIsDirty(false)
        search.setShowSearchResults(false)
        return
      }
      // Reset native preview BEFORE async read (prevents stale docx state)
      setNativePreview(null)
      setIsNativePreview(false)
      setIsLoading(true)
      let fileContent = ''
      try {
        fileContent = await api.readFile(filePath)
      } catch (err: any) {
        const code = err?.code ?? err?.cause?.code
        const msg = err?.message ?? String(err)
        if (code === 'ENOENT' || msg.includes('ENOENT') || msg.includes('no such file')) {
          showToast('error', '文件已被删除')
          setIsLoading(false)
          void handleRefresh?.()
          return
        }
        throw err
      } finally {
        setIsLoading(false)
      }
      setSelectedFile(filePath)
      setContent(fileContent)
      setIsDirty(false)
      search.setShowSearchResults(false)
      // v1.5: 记住上次打开的文件
      if (vaultPath) {
        void api.setLastFile?.(vaultPath, filePath)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleRefresh and search accessed via refs/context
    [selectedFile, isDirty, content, vaultPath]
  )

  const handleSave = useCallback(async () => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    if (selectedFile) {
      try {
        await api.saveFile(selectedFile, content)
        setIsDirty(false)
        showToast('success', '文件已保存')
      } catch (err) {
        showToast('error', `保存失败: ${err instanceof Error ? err.message : String(err)}`)
        // keep isDirty=true so user can retry
      }
    }
  }, [selectedFile, content])

  const handleNewFile = useCallback(
    async (folderPath: string, fileName: string) => {
      const base = folderPath === vaultPath || !folderPath ? '' : folderPath
      const filePath = `${base}/${fileName}.md`
      await api.saveFile(filePath, `# ${fileName}\n\n`)
      const fileList = await api.listFiles()
      setFiles(fileList)
      window.__vaultFiles = fileList
      setSelectedFile(filePath)
      setContent(`# ${fileName}\n\n`)
      setIsDirty(false)
    },
    [vaultPath]
  )

  const handleNewFolder = useCallback(
    async (parentPath: string, folderName: string) => {
      const base = parentPath === vaultPath || !parentPath ? '' : parentPath
      const folderPath = `${base}/${folderName}`
      await api.createFolder(folderPath)
      const fileList = await api.listFiles()
      setFiles(fileList)
      window.__vaultFiles = fileList
    },
    [vaultPath]
  )

  const handleContentChange = useCallback(
    (value: string) => {
      setContent(value)
      if (value !== content) {
        setIsDirty(true)
        // Auto-save after 1.5s of inactivity (Obsidian-style)
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = setTimeout(async () => {
          if (!selectedFile) return
          try {
            await api.saveFile(selectedFile, value)
            setIsDirty(false)
          } catch (err) {
            // Auto-save failure is non-critical but worth surfacing
            console.warn('[auto-save] failed:', err)
            showToast('warning', '自动保存失败，请手动保存')
            // keep isDirty=true
          }
        }, 1500)
      }
    },
    [selectedFile, content]
  )

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [])

  const handleSaveAIMessage = useCallback(
    async (content: string) => {
      if (!vaultPath) return
      try {
        // 2026-07-16 (Free 仓 backport from team c60c8f8 范围 / 补 expose):
        // archiveQuery 返回写入文件路径 (string), 不是 { success, entitiesLinked, ... }
        const result = await api.file.archiveQuery(content)
        showToast('success', `已存档 → ${result}`)
      } catch {
        showToast('error', '存档失败')
      }
    },
    [vaultPath]
  )

  // Auto-save before close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedFile && isDirty) {
        void api.saveFile(selectedFile, content).catch?.(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [selectedFile, isDirty, content])

  // ── 2026-06-23 17:26 窗口焦点恢复时自动刷新文件列表 ──
  //   修复: 用户在 Finder 删除/重建文件夹后, app 不识别外部变更
  //   根因: 无文件系统监听 (no chokidar/fs.watch), 只在 import:completed 刷新
  //   修法: 窗口从 Finder 切回来时自动 scanDirectory (1s 防抖)
  //   三仓通用 (xiaoyuan-team / xiaoyuan-vault-free / xiaoyuan-Vault)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onFocus = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void handleRefresh()
        timer = null
      }, 1000)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      if (timer) clearTimeout(timer)
    }
  }, [handleRefresh])

  // Track recent files

  useEffect(() => {
    if (!selectedFile) return
    const name = selectedFile.split('/').pop() ?? selectedFile
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== selectedFile)
      return [{ path: selectedFile, name }, ...filtered].slice(0, 8)
    })
  }, [selectedFile])

  // Auto-restore last vault on startup
  useEffect(() => {
    ;(async () => {
      try {
        const lastPath = await api.getLastVault?.()
        if (lastPath) {
          setVaultPath(lastPath)
          const fileList = await api.listFiles()
          setFiles(fileList)
          window.__vaultFiles = fileList
          // v1.5: 启动时也自动选中上次打开的文件
          try {
            const lastFile = await api.getLastFile?.(lastPath)
            if (lastFile && fileList.some((f: FileInfo) => f.path === lastFile && !f.isDirectory)) {
              setSelectedFile(lastFile)
              const ext = lastFile.split('.').pop()?.toLowerCase() ?? ''
              const isMarkdown = ['md', 'markdown', 'mdown', 'mkd'].includes(ext)
              if (isMarkdown) {
                try {
                  const c = await api.readFile(lastFile)
                  setContent(c)
                  setIsDirty(false)
                } catch {
                  /* 文件被删 */
                }
              } else {
                // 二进制: 走 native preview
                setContent('')
                setIsNativePreview(true)
                setNativePreview(null)
                setIsLoading(true)
                try {
                  const preview = await api.renderFile?.(lastFile)
                  setNativePreview((preview ?? { type: 'unsupported' }) as any)
                } catch {
                  setNativePreview({ type: 'unsupported' } as any)
                } finally {
                  setIsLoading(false)
                }
              }
            }
          } catch {
            /* 不阻断启动 */
          }
        }
      } catch {
        /* first launch, show welcome */
      }
    })().catch(() => {})
  }, [])

  // 2026-07-07 (backport from team 0640bba): multi-tab operations
  // openTab 走 handleSelectFile(path, { addTab: true }) (统一逻辑 + 自动 readFile)
  //   之前 openTab 不读文件, 导致"在新标签页打开"后内容是旧的 (跟 switchTab 同源 bug)
  const openTab = useCallback((path: string) => {
    void handleSelectFile(path, { addTab: true })
  }, [handleSelectFile])

  const closeTab = useCallback((index: number) => {
    setOpenTabs(prev => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) {
        setSelectedFile(null)
        setActiveTabIndex(0)
      } else if (activeTabIndex >= index && activeTabIndex > 0) {
        setActiveTabIndex(activeTabIndex - 1)
        setSelectedFile(next[activeTabIndex - 1])
      } else if (activeTabIndex >= next.length) {
        setActiveTabIndex(next.length - 1)
        setSelectedFile(next[next.length - 1])
      } else {
        setSelectedFile(next[activeTabIndex])
      }
      return next
    })
  }, [activeTabIndex])

  // switchTab 调 handleSelectFile 走完整流程 (读文件 + setContent)
  //   4800a28 修复: 之前 switchTab 只 setSelectedFile 不读文件 → 点击 tab 切不动
  //   用 { addTab: true } 保留多 tab 逻辑 (不重置 openTabs)
  const switchTab = useCallback((index: number) => {
    if (index >= 0 && index < openTabs.length) {
      void handleSelectFile(openTabs[index], { addTab: true })
    }
  }, [openTabs, handleSelectFile])

  return {
    vaultPath,
    files,
    selectedFile,
    openTabs,
    activeTabIndex,
    content,
    isDirty,
    searchQuery: search.searchQuery,
    searchResults: search.searchResults,
    showSearchResults: search.showSearchResults,
    nativePreview,
    isNativePreview,
    recentFiles,
    setVaultPath,
    setFiles,
    setSelectedFile,
    setContent,
    setIsDirty,
    setNativePreview,
    setIsNativePreview,
    setShowSearchResults: search.setShowSearchResults,
    openTab,
    closeTab,
    switchTab,
    handleNewVault,
    handleOpenVault,
    handleSelectFile,
    handleSave,
    handleNewFile,
    handleNewFolder,
    handleRefresh,
    handleSearch: search.handleSearch,
    handleOpenSearch: search.handleOpenSearch,
    handleCloseSearch: search.handleCloseSearch,
    handleContentChange,
    handleSaveAIMessage
  }
}
