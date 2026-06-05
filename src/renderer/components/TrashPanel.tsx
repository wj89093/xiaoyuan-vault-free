import { useState, useEffect, useCallback, memo, type JSX } from 'react'
import { Trash2, RotateCcw, X, AlertTriangle } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface TrashItem {
  originalPath: string
  trashPath: string
  deletedAt: number
  name: string
}

interface TrashPanelProps {
  vaultPath: string | null
  onNavigate: (path: string) => void
  onClose: () => void
}

export const TrashPanel = memo(function TrashPanel({ vaultPath, onNavigate, onClose }: TrashPanelProps): JSX.Element {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)

  const loadTrash = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const list = await window.api.trashList(vaultPath)
      setItems(list)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [vaultPath])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadTrash()
    })
    return () => cancelAnimationFrame(id)
  }, [loadTrash])

  const handleRestore = async (item: TrashItem) => {
    if (!vaultPath) return
    if (!confirm('确认恢复文件？')) return
    await window.api.trashRestore(vaultPath, item.trashPath)
    await loadTrash()
  }

  const handlePermanentDelete = async (item: TrashItem) => {
    if (!vaultPath) return
    if (!confirm(`永久删除 "${item.name}"？此操作不可恢复。`)) return
    await window.api.trashDelete(vaultPath, item.trashPath)
    await loadTrash()
  }

  const handleEmpty = async () => {
    if (!vaultPath) return
    if (!confirm('清空回收站？所有文件将永久删除。')) return
    for (const item of items) {
      await window.api.trashDelete(vaultPath, item.trashPath)
    }
    await loadTrash()
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <FloatingPanel
      title="回收站"
      icon={<Trash2 size={15} />}
      onClose={onClose}
      width={380}
      height={480}
      bottomOffset={80}
    >
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {items.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-2) var(--space-4) var(--space-1)' }}>
            <button
              onClick={() => {
                void handleEmpty()
              }}
              style={{
                fontSize: 11,
                padding: 'var(--space-1) var(--space-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                background: 'var(--color-surface)',
                color: 'var(--color-red)',
                cursor: 'pointer'
              }}
            >
              <AlertTriangle size={11} style={{ marginRight: 4 }} />
              清空回收站
            </button>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-4)' }}>
          {loading ? (
            <div
              style={{
                color: 'var(--color-text-tertiary, #a1a1a6)',
                fontSize: 13,
                textAlign: 'center',
                padding: 32
              }}
            >
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div
              style={{
                color: 'var(--color-text-tertiary, #a1a1a6)',
                fontSize: 13,
                textAlign: 'center',
                padding: 32
              }}
            >
              回收站为空
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {items.map((item) => (
                <div
                  key={item.originalPath}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)'
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: ',var(--space-2)',cursor: 'pointer' }}
                    tabIndex={0}
                    role="button"
                    onClick={() => {
                      void onNavigate(item.originalPath)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void onNavigate(item.originalPath)
                      }
                    }}
                  >
                    <Trash2 size={12} style={{ color: 'var(--color-text-tertiary, #8e8e93)' }} />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 13,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--color-text-tertiary, #a1a1a6)',
                        flexShrink: 0
                      }}
                    >
                      {formatDate(item.deletedAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: ',var(--space-1)',marginTop: 8 }}>
                    <button
                      onClick={() => {
                        void handleRestore(item)
                      }}
                      aria-label="恢复文件"
                      style={{
                        flex: 1,
                        fontSize: 11,
                        padding: 'var(--space-1) 0',
                        borderRadius: 6,
                        border: 'none',
                        background: 'var(--color-blue)',
                        color: 'var(--color-surface, #fff)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--space-1)'
                      }}
                    >
                      <RotateCcw size={11} /> 恢复
                    </button>
                    <button
                      onClick={() => {
                        void handlePermanentDelete(item)
                      }}
                      aria-label="永久删除"
                      style={{
                        flex: 1,
                        fontSize: 11,
                        padding: 'var(--space-1) 0',
                        borderRadius: 6,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-red)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--space-1)'
                      }}
                    >
                      <X size={11} /> 删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </FloatingPanel>
  )
})
