import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface FloatingPanelProps {
  title: string
  icon?: React.ReactNode
  onClose: () => void
  width?: number
  height?: number
  defaultPos?: { x: number; y: number }
  children: React.ReactNode
  /** Override vertical position from bottom (for stacking multiple panels) */
  bottomOffset?: number
}

export function FloatingPanel({
  title,
  icon,
  onClose,
  width = 480,
  height = 600,
  defaultPos,
  children,
  bottomOffset: _bb = 80
}: FloatingPanelProps): JSX.Element {
  void _bb
  const [pos, setPos] = useState(
    () =>
      defaultPos ?? {
        x: (window.innerWidth - width) / 2,
        y: (window.innerHeight - height) / 2
      }
  )
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [panelWidth, _setPanelWidth] = useState(width)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap + Escape key handler
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement
    const panelEl = panelRef.current

    // Move focus into panel
    const firstFocusable = panelEl?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    firstFocusable?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      // Basic focus trap
      if (e.key === 'Tab' && panelEl) {
        const focusable = Array.from(
          panelEl.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled'))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea')) return
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y })
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) =>
      setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    const onUp = () => setDragging(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging, dragStart])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="panel-title"
      aria-label={title}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: panelWidth,
        height,
        zIndex: 600,
        background: 'var(--color-surface, #fff)',
        borderRadius: 12,
        boxShadow: dragging
          ? '0 16px 48px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)'
          : '0 8px 40px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--color-border, #e5e5ea)',
        transition: 'width 150ms ease-out, box-shadow 200ms ease'
      }}
    >
      {/* Title bar */}
      <div
        id="panel-title"
        aria-label="拖拽移动"
        title="拖动此标题栏以移动面板"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-border, #e5e5ea)',
          background: 'var(--color-surface-hover, #f9f9fb)',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none'
        }}
        onMouseDown={handleDragStart}
      >
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{title}</span>
        <kbd
          title="按 Escape 关闭面板"
          style={{
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid var(--color-border, #d1d1d6)',
            color: 'var(--color-text-tertiary, #8e8e93)',
            background: 'var(--color-surface-hover, #f5f5f7)',
            cursor: 'default',
            userSelect: 'none'
          }}
        >
          Esc
        </kbd>
        <button
          onClick={onClose}
          aria-label="关闭"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary, #8e8e93)',
            padding: 2,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
    </div>
  )
}
