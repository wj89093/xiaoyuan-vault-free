import { useState, useEffect, type JSX } from 'react'
import { BarChart3, RefreshCw, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface ConversationSummary {
  date: string
  time: string
  title: string
  topic: string
  decisions: string[]
  relatedFiles: string[]
  nextSteps: string[]
}

interface MemoryPanelProps {
  onClose: () => void
}

export const MemoryPanel = memo(function MemoryPanel({ onClose }: MemoryPanelProps): JSX.Element {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadConversations = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const vaultPath = await (window.api as any).getVaultPath?.()
      if (!vaultPath) {
        setConversations([])
        setLoading(false)
        return
      }
      const today = new Date().toISOString().slice(0, 10)
      const convs = await (window.api as any).getConversations?.(today)
      setConversations(convs ?? [])
    } catch (err) {
      console.error('[MemoryPanel] loadConversations failed:', err)
      setLoadError(err instanceof Error ? err.message : String(err))
      setConversations([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadConversations()
  }, [])

  const renderCard = (conv: ConversationSummary, i: number) => (
    <div key={i} className="memory-card" style={{ cursor: 'default' }}>
      <div className="memory-card-header">
        <Clock size={12} />
        <span className="memory-card-time">
          {conv.date} {conv.time}
        </span>
        {conv.topic && <span className="memory-card-topic">{conv.topic}</span>}
      </div>
      <div className="memory-card-title">{conv.title}</div>
      {conv.decisions.length > 0 && (
        <div className="memory-card-section">
          <div className="memory-card-section-label">决策</div>
          {conv.decisions.slice(0, 2).map((d, j) => (
            <div key={j} className="memory-card-item">
              <CheckCircle2 size={11} className="memory-card-item-icon" />
              <span>{d}</span>
            </div>
          ))}
        </div>
      )}
      {conv.nextSteps.length > 0 && (
        <div className="memory-card-section">
          <div className="memory-card-section-label">下一步</div>
          {conv.nextSteps.slice(0, 2).map((s, j) => (
            <div key={j} className="memory-card-item">
              <ChevronRight size={11} className="memory-card-item-icon" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div role="region" aria-label="记忆面板" aria-busy={loading}>
      <FloatingPanel title="记忆" icon={<BarChart3 size={15} />} onClose={onClose}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 12px',
            gap: 8,
            borderBottom: '1px solid var(--color-border)'
          }}
        >
          <button
            onClick={() => void loadConversations()}
            disabled={loading}
            aria-label="刷新记忆"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: loading ? 'var(--color-surface-hover)' : 'var(--color-surface)',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: loading ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)'
            }}
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />{' '}
            {loading ? '加载中...' : '刷新'}
          </button>
        </div>
        {loading ? (
          <div className="memory-panel-loading">
            <RefreshCw
              size={16}
              className="animate-spin"
              style={{ color: 'var(--color-text-tertiary)' }}
            />
          </div>
        ) : loadError ? (
          <div
            className="memory-panel-empty"
            role="status"
            aria-live="polite"
            style={{ color: 'var(--color-red, #ef4444)' }}
          >
            刷新失败：{loadError}
          </div>
        ) : conversations.length === 0 ? (
          <div className="memory-panel-empty">今日暂无对话记录</div>
        ) : (
          <div className="memory-panel-list">{conversations.map(renderCard)}</div>
        )}
      </FloatingPanel>
    </div>
  )
})
