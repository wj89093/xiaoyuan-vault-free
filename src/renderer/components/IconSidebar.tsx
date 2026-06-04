import { memo, useState, useRef, useCallback, type JSX } from 'react'
import {
  Search,
  Network,
  ClipboardCheck,
  BarChart3,
  Settings,
  FolderCog,
  FileText,
  FileOutput,
  StickyNote
} from 'lucide-react'

interface IconSidebarProps {
  activeView: string
  onViewChange: (view: string) => void
  onSearchFocus?: () => void
  onBriefingClick?: () => void
  onSchemaClick?: () => void
  onOpenTrash?: () => void
  onOpenOutput?: () => void
  onIndexClick?: () => void
}

const NAV_ITEMS = [
  { id: 'index', icon: StickyNote, label: '索引' },
  { id: 'search', icon: Search, label: '搜索' },
  { id: 'graph', icon: Network, label: '图谱' },
  { id: 'output', icon: FileOutput, label: '产出' },
  { id: 'lint', icon: ClipboardCheck, label: '检查' },
  { id: 'log', icon: FileText, label: '日志' },
  { id: 'schema', icon: FolderCog, label: '模式' },
  { id: 'review', icon: BarChart3, label: '简报' }
] as const

export const IconSidebar = memo(function IconSidebar({
  activeView,
  onViewChange,
  onSearchFocus,
  onBriefingClick,
  onSchemaClick,
  onOpenTrash,
  onOpenOutput,
  onIndexClick
}: IconSidebarProps): JSX.Element {
  const [clicked, setClicked] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const lastClickedRef = useRef<string | null>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // 点同一个 icon 第二次 → 关闭浮窗（日志/检查等面板 toggle 行为）
  const handleClick = useCallback(
    async (id: string) => {
      const prev = lastClickedRef.current
      setClicked(id)

      try {
        if (id === 'search') {
          await onSearchFocus?.()
        } else if (id === 'review') {
          await onBriefingClick?.()
        } else if (id === 'lint') {
          await onViewChange(id)
        } else if (id === 'output') {
          await onOpenOutput?.()
        } else if (id === 'schema') {
          await onSchemaClick?.()
        } else if (id === 'log') {
          await onViewChange('log')
        } else if (id === 'index') {
          await onIndexClick?.()
        } else if (id === 'trash') {
          await onOpenTrash?.()
        } else {
          await onViewChange(id)
        }

        // Success: clear clicked after 500ms, update last
        lastClickedRef.current = id
        setTimeout(() => setClicked((c) => (c === id ? null : c)), 500)
      } catch (err) {
        // Failure: reset to previous value, log and notify user
        console.error('[IconSidebar] handleClick failed:', err)
        setClicked(prev)
        if (window.toast) window.toast('操作失败，请重试')
      }
    },
    [
      onViewChange,
      onSearchFocus,
      onBriefingClick,
      onSchemaClick,
      onOpenTrash,
      onOpenOutput,
      onIndexClick
    ]
  )

  // P1-3: Keyboard navigation — ArrowLeft/ArrowRight within the toolbar
  const totalItems = NAV_ITEMS.length + 2 // +2 for settings & trash

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = (index + 1) % totalItems
        setFocusedIndex(next)
        buttonRefs.current[next]?.focus()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = (index - 1 + totalItems) % totalItems
        setFocusedIndex(prev)
        buttonRefs.current[prev]?.focus()
      }
    },
    [totalItems]
  )

  return (
    <div
      className="icon-sidebar"
      role="toolbar"
      aria-label="导航"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          const next = (focusedIndex + 1) % totalItems
          setFocusedIndex(next)
          buttonRefs.current[next]?.focus()
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const prev = (focusedIndex - 1 + totalItems) % totalItems
          setFocusedIndex(prev)
          buttonRefs.current[prev]?.focus()
        }
      }}
    >
      {NAV_ITEMS.map((item, i) => {
        const isActive = activeView === item.id || clicked === item.id
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttonRefs.current[i] = el
            }}
            role="menuitem"
            tabIndex={focusedIndex === i ? 0 : -1}
            className={'icon-nav-item' + (isActive ? ' active' : '')}
            onClick={() => handleClick(item.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            title={item.label}
            aria-pressed={isActive}
          >
            <item.icon size={20} strokeWidth={isActive ? 2 : 1.5} />
          </button>
        )
      })}
      <div className="icon-sidebar-spacer" />
      {/* Settings */}
      <button
        ref={(el) => {
          buttonRefs.current[NAV_ITEMS.length] = el
        }}
        role="menuitem"
        tabIndex={focusedIndex === NAV_ITEMS.length ? 0 : -1}
        className={
          'icon-nav-item' + (activeView === 'settings' || clicked === 'settings' ? ' active' : '')
        }
        onClick={() => handleClick('settings')}
        onKeyDown={(e) => handleKeyDown(e, NAV_ITEMS.length)}
        title="设置"
        aria-pressed={activeView === 'settings' || clicked === 'settings'}
      >
        <Settings
          size={20}
          strokeWidth={activeView === 'settings' || clicked === 'settings' ? 2 : 1.5}
        />
      </button>
      {/* Trash */}
      <button
        ref={(el) => {
          buttonRefs.current[NAV_ITEMS.length + 1] = el
        }}
        role="menuitem"
        tabIndex={focusedIndex === NAV_ITEMS.length + 1 ? 0 : -1}
        className={
          'icon-nav-item' + (activeView === 'trash' || clicked === 'trash' ? ' active' : '')
        }
        onClick={() => handleClick('trash')}
        onKeyDown={(e) => handleKeyDown(e, NAV_ITEMS.length + 1)}
        title="回收站"
        aria-pressed={activeView === 'trash' || clicked === 'trash'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={activeView === 'trash' || clicked === 'trash' ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </div>
  )
})
