import { X } from 'lucide-react'
import type { JSX } from 'react'

interface ShortcutGuideProps {
  onClose: () => void
}

const isMac = navigator.platform.toUpperCase().includes('MAC')
const MOD = isMac ? '⌘' : 'Ctrl'

// Only shortcuts that are actually registered in useKeyboardShortcuts.ts
const SHORTCUTS = [
  { keys: `${MOD}+P`, desc: '快速切换文件' },
  { keys: `${MOD}+F`, desc: '搜索文件' },
  { keys: `${MOD}+D`, desc: '深色/亮色模式' },
  { keys: '?', desc: '显示快捷键' }
]

export function ShortcutGuide({ onClose }: ShortcutGuideProps): JSX.Element {
  return (
    <div className="quick-switch-overlay" onClick={onClose}>
      <div className="quick-switch" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className="quick-switch-header">
          <span style={{ fontWeight: 600, fontSize: 14 }}>快捷键</span>
          <button className="quick-switch-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '8px 0', maxHeight: 400, overflowY: 'auto' }}>
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 20px',
                fontSize: 13,
                borderBottom: i < SHORTCUTS.length - 1 ? '1px solid #f0f0f2' : 'none'
              }}
            >
              <span style={{ color: 'var(--color-text-primary)' }}>{s.desc}</span>
              <kbd
                style={{
                  background: 'var(--color-bg-hover)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'SF Mono, monospace'
                }}
              >
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
