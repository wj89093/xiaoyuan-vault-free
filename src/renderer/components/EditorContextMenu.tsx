import { memo, useState, useCallback, useEffect, useRef } from 'react'
import {
  Scissors,
  ClipboardPaste,
  Trash2,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Code,
  Link,
  Quote,
  SquareCode,
  Image,
  Table,
  Minus,
  Copy,
  CheckSquare
} from 'lucide-react'

export interface EditorContextMenuAction {
  label: string
  icon: React.ReactNode
  action: () => void
  danger?: boolean
  separatorBefore?: boolean
  shortcut?: string
  disabled?: boolean
}

function MenuItem({ item, onClose }: { item: EditorContextMenuAction; onClose: () => void }) {
  if (item.separatorBefore) {
    return <div className="context-menu-separator" role="separator" />
  }
  return (
    <div
      role="menuitem"
      className={`context-menu-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
      aria-disabled={item.disabled}
      tabIndex={item.disabled ? -1 : 0}
      onClick={() => {
        if (item.disabled) return
        item.action()
        onClose()
      }}
      onKeyDown={(e) => {
        if (item.disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          item.action()
          onClose()
        }
      }}
    >
      {item.icon}
      <span>{item.label}</span>
      {item.shortcut && <span className="context-menu-kbd">{item.shortcut}</span>}
    </div>
  )
}

export interface EditorContextMenuProps {
  x: number
  y: number
  editorView: any
  onClose: () => void
  onFormat?: (command: string, params?: any) => void
}

export const EditorContextMenu = memo(function EditorContextMenu({
  x,
  y,
  editorView,
  onClose,
  onFormat
}: EditorContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [pos] = useState(() => {
    // Clamp to viewport
    const vw = window.innerWidth
    const vh = window.innerHeight
    const menuW = 200
    const menuH = 460
    return {
      left: Math.min(x, vw - menuW - 8),
      top: Math.min(y, vh - menuH - 8)
    }
  })

  // Focus trap — move focus into menu on mount and trap Tab cycling
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    // Fade in animation
    requestAnimationFrame(() => setVisible(true))
    const first = el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    const t = setTimeout(() => first?.focus(), 16)
    return () => clearTimeout(t)
  }, [])

  // Trap Tab/Shift+Tab to cycle within menu items; Escape closes
  useEffect(() => {
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const el = menuRef.current
      if (!el) return
      const items = Array.from(
        el.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
      )
      if (items.length === 0) return
      e.preventDefault()
      const focused = document.activeElement
      const idx = items.indexOf(focused as HTMLElement)
      const next = e.shiftKey ? (idx - 1 + items.length) % items.length : (idx + 1) % items.length
      items[next]?.focus()
    }
    document.addEventListener('keydown', handleTab)
    return () => document.removeEventListener('keydown', handleTab)
  }, [])

  const buildActions = useCallback((): EditorContextMenuAction[] => {
    if (!editorView) return []

    const view = editorView
    const state = view.state
    const { from, to } = state.selection.main
    const hasSelection = from !== to

    return [
      // ── 编辑 ──
      {
        label: '剪切',
        icon: <Scissors size={14} />,
        shortcut: '⌘X',
        disabled: !hasSelection,
        action: () => {
          if (!hasSelection) return
          const text = state.sliceDoc(from, to)
          navigator.clipboard
            .writeText(text)
            .then(() => {
              view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
            })
            .catch((err) => {
              console.warn('[context-menu] cut failed:', err)
              showToast('error', '剪切失败')
            })
        },
        separatorBefore: true
      },
      {
        label: '复制',
        icon: <Copy size={14} />,
        shortcut: '⌘C',
        disabled: !hasSelection,
        action: () => {
          if (!hasSelection) return
          navigator.clipboard.writeText(state.sliceDoc(from, to)).catch((err) => {
            console.warn('[context-menu] copy failed:', err)
            showToast('error', '复制失败')
          })
        }
      },
      {
        label: '粘贴',
        icon: <ClipboardPaste size={14} />,
        shortcut: '⌘V',
        action: async () => {
          try {
            const text = await navigator.clipboard.readText()
            if (text) {
              view.dispatch({ changes: { from: to, to, insert: text }, selection: { anchor: to } })
            }
          } catch (err) {
            console.warn('[context-menu] paste failed:', err)
            showToast('error', '粘贴失败，请检查浏览器权限')
          }
        }
      },
      {
        label: '删除',
        icon: <Trash2 size={14} />,
        shortcut: '⌫',
        disabled: !hasSelection,
        action: () => {
          if (!hasSelection) return
          view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
        },
        danger: true
      },

      // ── 格式 ──
      {
        label: '标题 1',
        icon: <Heading1 size={14} />,
        action: () => onFormat?.('heading', { level: 1 }),
        separatorBefore: true
      },
      {
        label: '标题 2',
        icon: <Heading2 size={14} />,
        action: () => onFormat?.('heading', { level: 2 })
      },
      {
        label: '标题 3',
        icon: <Heading3 size={14} />,
        action: () => onFormat?.('heading', { level: 3 })
      },
      {
        label: '粗体',
        icon: <Bold size={14} />,
        action: () => onFormat?.('bold')
      },
      {
        label: '斜体',
        icon: <Italic size={14} />,
        action: () => onFormat?.('italic')
      },
      {
        label: '行内代码',
        icon: <Code size={14} />,
        shortcut: '⌘E',
        action: () => onFormat?.('code')
      },
      {
        label: '链接',
        icon: <Link size={14} />,
        action: () => onFormat?.('link')
      },
      {
        label: '引用',
        icon: <Quote size={14} />,
        shortcut: '⌘⇧Q',
        action: () => onFormat?.('quote')
      },

      // ── 插入 ──
      {
        label: '代码块',
        icon: <SquareCode size={14} />,
        shortcut: '⌘⇧C',
        action: () => onFormat?.('codeblock'),
        separatorBefore: true
      },
      {
        label: '图片',
        icon: <Image size={14} />,
        shortcut: '⌘⇧I',
        action: () => onFormat?.('image')
      },
      {
        label: '表格',
        icon: <Table size={14} />,
        action: () => onFormat?.('table')
      },
      {
        label: '分割线',
        icon: <Minus size={14} />,
        action: () => onFormat?.('hr')
      },

      // ── 全选 ──
      {
        label: '全选',
        icon: <CheckSquare size={14} />,
        shortcut: '⌘A',
        action: () => view.dispatch({ selection: { anchor: 0, head: state.doc.length } }),
        separatorBefore: true
      }
    ]
  }, [editorView, onFormat])

  const actions = buildActions()

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        role="menu"
        className="context-menu"
        style={{
          left: pos.left,
          top: pos.top,
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 100ms ease, transform 100ms ease',
          transformOrigin: 'top left'
        }}
        onClick={(e) => {
          e.stopPropagation()
          e.nativeEvent.stopImmediatePropagation()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          // Arrow key navigation between items
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            const items = menuRef.current?.querySelectorAll<HTMLElement>(
              '[role="menuitem"]:not([aria-disabled="true"])'
            )
            if (!items || items.length === 0) return
            const focused = document.activeElement
            const idx = Array.from(items).indexOf(focused as HTMLElement)
            if (idx === -1) {
              items[0]?.focus()
            } else {
              const next =
                e.key === 'ArrowDown'
                  ? (idx + 1) % items.length
                  : (idx - 1 + items.length) % items.length
              items[next]?.focus()
            }
          }
        }}
      >
        {actions.map((item, i) => (
          <MenuItem key={i} item={item} onClose={onClose} />
        ))}
      </div>
    </>
  )
})

// Mini toast helper — avoid importing the whole Toast module to keep this file self-contained
function showToast(type: 'success' | 'error' | 'warning', message: string) {
  const fn = (window as any).__showToast
  if (fn) fn(type, message)
  else console.warn('[Toast]', type, message)
}
