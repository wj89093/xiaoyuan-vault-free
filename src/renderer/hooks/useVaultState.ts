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
  // Actions
  handleNewVault: () => Promise<void>
  handleOpenVault: () => Promise<void>
  handleSelectFile: (filePath: string) => Promise<void>
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
      ;(window as any).__vaultFiles = fileList
      showToast('success', '知识库已创建并打开')
    }
  }, [])

  const handleOpenVault = useCallback(async () => {
    const path = await api.openVault()
    if (path) {
      setVaultPath(path)
      const fileList = await api.listFiles()
      setFiles(fileList)
      ;(window as any).__vaultFiles = fileList
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
    async (filePath: string) => {
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
      ;(window as any).__vaultFiles = fileList
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
      ;(window as any).__vaultFiles = fileList
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
        const result = await (api as any).archiveQuery?.(content)
        if (result?.success) {
          const parts: string[] = []
          if (result.entitiesLinked?.length) parts.push(`实体: ${result.entitiesLinked.join(', ')}`)
          if (result.conceptsLinked?.length) parts.push(`概念: ${result.conceptsLinked.join(', ')}`)
          const msg = parts.length
            ? `已存档 → 关联 ${parts.join(' | ')}`
            : `已存档 → ${result.sourcePage}`
          showToast('success', msg)
        } else {
          showToast('error', `存档失败: ${result?.error ?? '未知错误'}`)
        }
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
          ;(window as any).__vaultFiles = fileList
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

  return {
    vaultPath,
    files,
    selectedFile,
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
