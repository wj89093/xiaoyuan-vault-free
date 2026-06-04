import { useState, useEffect, useRef, type JSX } from 'react'
import { Plus, FolderPlus, FileText, Pencil, Trash2 } from 'lucide-react'
import type { FileInfo } from '../types'
import log from 'electron-log/renderer'

interface FileTreeContextMenuProps {
  x: number
  y: number
  file: FileInfo
  vaultPath: string
  onClose: () => void
  onRefresh: () => void
  onNewFile: (folderPath: string) => void
  onNewFolder: (parentPath: string) => void
  onSelect: (path: string) => void
  /** P3-2026-06-03: Pro 仓 rename/delete handlers, Free 仓暂用 optional */
  onRename?: (oldPath: string, newName: string) => Promise<void>
  onDelete?: (filePath: string) => Promise<void>
}

interface MenuItemDef {
  icon: React.ReactNode
  label: string
  action: () => void
  danger?: boolean
  separator?: boolean
  condition?: boolean
}

export const FileTreeContextMenu = memo(function FileTreeContextMenu({
  x,
  y,
  file,
  vaultPath: _vaultPath,
  onClose,
  onRefresh,
  onNewFile,
  onNewFolder,
  onSelect
}: FileTreeContextMenuProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [visible, setVisible] = useState(false)

  // Outside-click and Escape key handler
  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setVisible(true))
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const baseItems: MenuItemDef[] = file.isDirectory
    ? [
        {
          icon: <Plus size={14} />,
          label: '新建文件',
          action: () => {
            onClose()
            onNewFile(file.path)
          }
        },
        {
          icon: <FolderPlus size={14} />,
          label: '新建文件夹',
          action: () => {
            onClose()
            onNewFolder(file.path)
          }
        },
        { separator: true, icon: null, label: '', action: () => {} },
        {
          icon: <FileText size={14} />,
          label: '打开',
          action: () => {
            onClose()
            onSelect(file.path)
          }
        },
        { separator: true, icon: null, label: '', action: () => {} },
        {
          icon: <Pencil size={14} />,
          label: '重命名',
          action: () => {
            void handleRename()
          }
        },
        {
          icon: <FileText size={14} />,
          label: '复制路径',
          action: () => {
            void handleCopyPath()
          }
        },
        {
          icon: <FileText size={14} />,
          label: '在 Finder 中显示',
          action: () => {
            void handleReveal()
          }
        },
        { separator: true, icon: null, label: '', action: () => {} },
        {
          icon: <Trash2 size={14} />,
          label: '删除',
          action: () => {
            void handleDelete()
          },
          danger: true
        }
      ]
    : [
        {
          icon: <FileText size={14} />,
          label: '打开',
          action: () => {
            onClose()
            onSelect(file.path)
          }
        },
        { separator: true, icon: null, label: '', action: () => {} },
        {
          icon: <Pencil size={14} />,
          label: '重命名',
          action: () => {
            void handleRename()
          }
        },
        {
          icon: <FileText size={14} />,
          label: '复制路径',
          action: () => {
            void handleCopyPath()
          }
        },
        {
          icon: <FileText size={14} />,
          label: '在 Finder 中显示',
          action: () => {
            void handleReveal()
          }
        },
        { separator: true, icon: null, label: '', action: () => {} },
        {
          icon: <Trash2 size={14} />,
          label: '删除',
          action: () => {
            void handleDelete()
          },
          danger: true
        }
      ]

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = baseItems.filter((item) => !item.separator && !item.condition)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((prev) => (prev + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((prev) => (prev - 1 + items.length) % items.length)
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault()
      items[focusedIndex]?.action()
    }
  }

  const handleDelete = async () => {
    if (!confirm('确认删除"' + file.name + '"？此操作不可恢复。')) return
    onClose()
    log.info('[FileTree] handleDelete:', file.path, 'isDirectory:', file.isDirectory)
    const result = file.isDirectory
      ? await (window.api as any).file.delete(file.path)
      : await (window.api.file.delete as any)(file.path)
    log.info('[FileTree] delete result:', result)
    onRefresh()
  }

  const handleRename = async () => {
    onClose()
    const newName = prompt('新名称:', file.name)
    if (newName && newName !== file.name) {
      await window.api.renameFile(file.path, newName)
      onRefresh()
    }
  }

  const handleReveal = () => {
    onClose()
    window.api.file.revealInFinder?.(file.path)
  }

  const handleCopyPath = async () => {
    onClose()
    await navigator.clipboard.writeText(file.path)
  }

  let itemIndex = 0
  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={containerRef}
        role="menu"
        tabIndex={-1}
        className="context-menu"
        style={{
          left: x,
          top: y,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 100ms ease, transform 100ms ease',
          transformOrigin: 'top left'
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.nativeEvent.stopImmediatePropagation()
        }}
        onKeyDown={handleKeyDown}
      >
        {baseItems
          .filter((item) => !item.separator || true)
          .map((item, i) => {
            if (item.separator) {
              return <div key={i} className="context-menu-separator" />
            }
            // Skip items with condition === false
            if (item.condition === false) return null
            const isFocused = itemIndex === focusedIndex
            const currentItemIndex = itemIndex
            itemIndex++
            return (
              <div
                key={i}
                role="menuitem"
                className={`context-menu-item${item.danger ? ' danger' : ''}${isFocused ? ' focused' : ''}`}
                onClick={item.action}
                onMouseEnter={() => setFocusedIndex(currentItemIndex)}
                style={isFocused ? { background: 'var(--color-surface-hover, #f0f0f5)' } : {}}
              >
                {item.icon} {item.label}
              </div>
            )
          })}
      </div>
    </>
  )
})
