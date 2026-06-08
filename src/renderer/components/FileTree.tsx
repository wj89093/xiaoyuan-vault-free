import { memo, useState, useRef, useEffect, useMemo } from 'react'
import type { FileInfo } from '../types'
import { FileTreeContextMenu } from './FileTreeContextMenu'
import { Skeleton } from './Skeleton'
import { FileTreeHoverPreview } from './FileTreeHoverPreview'
import { FileTreeNode } from './FileTreeNode'
import { FileTreeFlatRow } from './FileTreeFlatRow'
import { flattenTree, type FlatTreeItem } from '../utils/flattenTree'

interface FileTreeProps {
  files: FileInfo[]
  selectedFile: string | null
  onSelect: (path: string) => void
  onRefresh?: () => void
  onNewFile?: (folderPath: string) => void
  onNewFolder?: (parentPath: string) => void
  vaultPath: string
  isSourceTab?: boolean
  isLoading?: boolean
}

// ── Helper: flatten directory tree into flat list ───────────────────
function flattenToList(
  nodes: FileInfo[],
  expanded: Set<string>,
  out: { path: string; isDirectory: boolean }[]
): void {
  for (const node of nodes) {
    out.push({ path: node.path, isDirectory: node.isDirectory })
    if (node.isDirectory && expanded.has(node.path) && node.children) {
      flattenToList(node.children, expanded, out)
    }
  }
}

export const FileTree = memo(function FileTree({
  files, selectedFile, onSelect, onRefresh,
  onNewFile, _onNewFolder, vaultPath, isSourceTab, isLoading,
}: FileTreeProps): JSX.Element {

  // ── State ─────────────────────────────────────────────────────────
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([vaultPath, vaultPath + '/_wiki'])
  )
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileInfo } | null>(null)
  const [hoverPreview, setHoverPreview] = useState<{ x: number; y: number; name: string; summary: string } | null>(null)
  const [hoverError, setHoverError] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)

  // ── Refs ───────────────────────────────────────────────────────────
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flatItems = useRef<{ path: string; isDirectory: boolean }[]>([])
  // P3-1: preserve scroll position ref to avoid scrolling to top on files reload
  const scrollTopRef = useRef(0)

  // ── Derived ──────────────────────────────────────────────────────
  const roots = files[0]?.children ? files : files.filter(f => !f.path.includes('/'))

  // P3-1: capture scroll position before files refresh, restore after
  const containerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!containerRef.current) return
    scrollTopRef.current = containerRef.current.scrollTop
  }, [files])

  useEffect(() => {
    if (!containerRef.current) return
    // Restore saved scroll position after items re-render
    requestAnimationFrame(() => {
      if (containerRef.current) containerRef.current.scrollTop = scrollTopRef.current
    })
  }, [files])

  // Re-build flatItems whenever files or expanded state changes
  useEffect(() => {
    flatItems.current = []
    flattenToList(roots, expandedFolders, flatItems.current)
    if (focusedIndex >= flatItems.current.length) {
      setFocusedIndex(flatItems.current.length - 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, expandedFolders, roots])

  // Auto-expand top-level directories when files become available
  useEffect(() => {
    if (files.length === 0) return
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.add(vaultPath)
      for (const f of files) {
        if (f.isDirectory) next.add(f.path)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, files.length])

  // Close menus on outside click
  useEffect(() => {
    if (!contextMenu && !hoverPreview) return
    const handler = () => {
      setContextMenu(null)
      setHoverPreview(null)
    }
    window.addEventListener('click', handler, { once: true })
    return () => window.removeEventListener('click', handler)
  }, [contextMenu, hoverPreview])

  // Cleanup drag event listeners on unmount
  useEffect(() => {
    const cleanup = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    document.addEventListener('drop', cleanup, true)
    document.addEventListener('dragover', cleanup, true)
    return () => {
      document.removeEventListener('drop', cleanup, true)
      document.removeEventListener('dragover', cleanup, true)
    }
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────

  const toggleFolder = (path: string) => {
    const next = new Set(expandedFolders)
    if (next.has(path)) next.delete(path); else next.add(path)
    setExpandedFolders(next)
  }

  const handleMouseEnter = (e: React.MouseEvent, file: FlatTreeItem) => {
    if (file.isDirectory) return
    setHoverError(false)
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    hoverTimer.current = setTimeout(async () => {
      try {
        const content = await window.api.readFile(file.path)
        const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
        let summary = ''
        if (fmMatch) {
          const fm = fmMatch[1]
          const sm = fm.match(/^summary:\s*(.+)/m)
          if (sm) summary = sm[1].slice(0, 120)
        }
        if (!summary) {
          const body = content.replace(/^---[\s\S]*?---\n?/, '').trim()
          summary = body.split('\n').filter(l => l.trim()).slice(0, 2).join(' ').slice(0, 120)
        }
        setHoverPreview({ x: rect.right + 8, y: rect.top, name: file.name, summary: summary || '(无内容)' })
        setHoverError(false)
      } catch (err) {
        console.error('[FileTree] hover preview failed:', err)
        setHoverError(true)
      }
    }, 300)
  }

  const handleMouseLeave = () => { clearTimeout(hoverTimer.current) }

  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDropOnFolder = async (e: React.DragEvent, folderPath: string) => {
    e.preventDefault()
    setDropTarget(null)
    const srcPath = e.dataTransfer.getData('text/plain')
    if (srcPath && srcPath !== folderPath) {
      try {
        await window.api.moveFile(srcPath, folderPath)
        onRefresh?.()
      } catch (err) {
        console.error('[FileTree] drop on folder failed:', err)
        setDragError('移动文件失败：目标文件夹不可用')
        setTimeout(() => setDragError(null), 5000)
      }
    }
  }

  const handleDropOnFile = async (e: React.DragEvent, filePath: string) => {
    e.preventDefault()
    setDropTarget(null)
    const srcPath = e.dataTransfer.getData('text/plain')
    if (srcPath && srcPath !== filePath) {
      const parentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : ''
      if (!parentDir) {
        setDragError('无法移动到根目录')
        setTimeout(() => setDragError(null), 5000)
        return
      }
      try {
        await window.api.moveFile(srcPath, parentDir)
        onRefresh?.()
      } catch (err) {
        console.error('[FileTree] drop on file failed:', err)
        setDragError('移动文件失败')
        setTimeout(() => setDragError(null), 5000)
      }
    }
  }

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null)
    const srcPath = e.dataTransfer.getData('text/plain')
    if (srcPath) {
      const fileName = srcPath.split('/').pop() ?? 'Untitled'
      const newPath = `${vaultPath}/${fileName}`
      if (srcPath !== newPath) {
        try {
          await window.api.moveFile(srcPath, vaultPath)
          onRefresh?.()
        } catch (err) {
          console.error('[FileTree] drop on root failed:', err)
          setDragError('移动文件失败')
          setTimeout(() => setDragError(null), 5000)
        }
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // setDropTarget is called per-item via onDragOver on the item itself
  }

  const handleDragLeave = () => setDropTarget(null)

  const handleContextMenu = (e: React.MouseEvent, file: FlatTreeItem) => {
    setContextMenu({ x: e.clientX, y: e.clientY, file })
  }

  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    const items = flatItems.current
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(focusedIndex + 1, items.length - 1)
      setFocusedIndex(next)
      itemRefs.current[next]?.focus()
      // P3-1: scroll focused item into view
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(focusedIndex - 1, 0)
      setFocusedIndex(prev)
      itemRefs.current[prev]?.focus()
      // P3-1: scroll focused item into view
      itemRefs.current[prev]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const item = items[focusedIndex]
      if (!item) return
      if (item.isDirectory) toggleFolder(item.path)
      else onSelect(item.path)
    } else if (e.key === 'Escape') {
      setFocusedIndex(-1)
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  const emptyLabel = vaultPath ? '暂无文件' : '知识库还是空的'

  // P3-2026-06-02: 派生拍平列表(给 FileTreeFlatRow 用)
  // 暂未接入 react-window FixedSizeList,见 docs/PHASE3_PLAN_2026-06-02.md
  const flatRows = useMemo(
    () => flattenTree(roots, expandedFolders),
    [roots, expandedFolders],
  )

  if (isLoading) {
    return (
      <div className="file-tree" role="tree">
        <div style={{ padding: '12px 16px' }}>
          <Skeleton lines={4} />
        </div>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="file-tree" role="tree">
        <div className="file-tree-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" strokeWidth="1.2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <p>{emptyLabel}</p>
          <p className="file-tree-empty-hint">{vaultPath ? '拖拽文件到此处，或点击上方 + 新建' : '拖拽文件到此处，或点击下方打开知识库'}</p>
          <button className="btn btn-secondary" onClick={() => onNewFile?.()} style={{ marginTop: 8 }} tabIndex={0}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 2v10M2 7h10"/>
            </svg>
            {isSourceTab ? '导入文件' : '新建第一个文件'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="file-tree"
      role="tree"
      onKeyDown={handleTreeKeyDown}
      tabIndex={-1}
      ref={containerRef}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDrop={handleDropOnRoot}
    >
      {dragError && (
        <div className="file-tree-drag-error" role="alert">
          {dragError}
        </div>
      )}
      {flatRows.length > 0 ? (
        flatRows.map((item, i) => (
          <FileTreeFlatRow
            key={item.path}
            item={item}
            flatIdx={i}
            expandedFolders={expandedFolders}
            selectedFile={selectedFile}
            focusedIndex={focusedIndex}
            dropTarget={dropTarget}
            onToggle={toggleFolder}
            onSelect={onSelect}
            onContextMenu={handleContextMenu}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onDragStart={handleDragStart}
            onDropOnFolder={handleDropOnFolder}
            onDropOnFile={handleDropOnFile}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            itemRefs={itemRefs}
          />
        ))
      ) : (
        // 拍平后为空(理论上不会发生,roots 一定非空)
        roots.map((file, i) => (
          <FileTreeNode
            key={file.path}
            file={file}
            depth={0}
            flatIdx={i}
            expandedFolders={expandedFolders}
            selectedFile={selectedFile}
            focusedIndex={focusedIndex}
            dropTarget={dropTarget}
            onToggle={toggleFolder}
            onSelect={onSelect}
            onContextMenu={handleContextMenu}
            onMouseLeave={handleMouseLeave}
            onDragStart={handleDragStart}
            onDropOnFolder={handleDropOnFolder}
            onDropOnFile={handleDropOnFile}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            itemRefs={itemRefs}
            flatItemsRef={flatItems}
          />
        ))
      )}

      {/* Hover preview */}
      {hoverPreview && !hoverError && (
        <FileTreeHoverPreview
          x={hoverPreview.x}
          y={hoverPreview.y}
          name={hoverPreview.name}
          summary={hoverPreview.summary}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <FileTreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={() => setContextMenu(null)}
          onRename={async (oldPath, newName) => {
            try {
              const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : vaultPath
              await window.api.moveFile(oldPath, `${parentDir}/${newName}`)
              setContextMenu(null)
              onRefresh?.()
            } catch (err) { console.error('[FileTree] rename failed:', err); setContextMenu(null) }
          }}
          onDelete={async (filePath) => {
            try {
              await window.api.deleteFile(filePath)
              setContextMenu(null)
              onRefresh?.()
            } catch (err) { console.error('[FileTree] delete failed:', err); setContextMenu(null) }
          }}
          vaultPath={vaultPath}
        />
      )}
    </div>
  )
})
