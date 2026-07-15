/**
 * AuditTab.tsx — backport from team ada72e9 (2026-07-07 23:09)
 */


import { useState, useEffect, useCallback, type JSX } from 'react'
import { RefreshCw, FileText, AlertTriangle } from 'lucide-react'

interface AuditEntry {
  ts: string
  actor: string
  sha: string
  files_changed: number
  files: string[]
  source: string
}

interface AuditTabProps {
  /** 当前 vault 路径, 用于读 _log/ */
  vaultPath: string | null
  /** 限制返回条数, 默认 50 */
  limit?: number
  /** 用户点击文件时回调 (父组件可以打开文件) */
  onSelectFile?: (path: string) => void
}

export function AuditTab({ vaultPath, limit = 50, onSelectFile }: AuditTabProps): JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAudit = useCallback(async () => {
    if (!vaultPath) {
      setEntries([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.vault.readAuditLog(vaultPath, limit)
      setEntries(result ?? [])
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setLoading(false)
    }
  }, [vaultPath, limit])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadAudit()
  }, [loadAudit])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 1. 没 vault 路径
  if (!vaultPath) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        请先打开一个 vault
      </div>
    )
  }

  // 2. loading
  if (loading && entries.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        加载审计记录中...
      </div>
    )
  }

  // 3. error
  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-red)', fontSize: 13 }}>
        加载失败: {error}
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => void loadAudit()}
            style={{
              padding: '4px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-bg)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // 4. empty
  if (entries.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
        <FileText size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
        <div>暂无审计记录</div>
        <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace', opacity: 0.7 }}>
          配合 templates/hooks/post-commit 使用
        </div>
        <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace', opacity: 0.7 }}>
          第一次 commit 后会写入 _log/YYYY-MM-DD/*.jsonl
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => void loadAudit()}
            style={{
              padding: '4px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-bg)',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RefreshCw size={12} /> 刷新
          </button>
        </div>
      </div>
    )
  }

  // 5. 渲染列表
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 头部: 计数 + 刷新 */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: 'var(--color-text-secondary)',
        }}
      >
        <span>{entries.length} 条审计记录</span>
        <button
          onClick={() => void loadAudit()}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            background: loading ? 'var(--color-surface-hover)' : 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 11,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="刷新"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.map((entry, i) => {
          const isUnknown = entry.actor === 'unknown'
          const actorColor = isUnknown ? 'var(--color-red)' : 'var(--color-text-primary)'
          const tsDate = new Date(entry.ts)
          const tsStr = isNaN(tsDate.getTime())
            ? entry.ts
            : tsDate.toLocaleString('zh-CN', { hour12: false })

          return (
            <div
              key={`${entry.sha}-${i}`}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--color-border)',
                fontSize: 12,
              }}
            >
              {/* header: actor + sha + ts */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                {isUnknown && <AlertTriangle size={12} color="var(--color-red)" />}
                <span style={{ fontWeight: 600, color: actorColor }}>{entry.actor}</span>
                <code
                  style={{
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'monospace',
                  }}
                >
                  {entry.sha}
                </code>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  {tsStr}
                </span>
              </div>

              {/* files */}
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  wordBreak: 'break-all',
                }}
              >
                {entry.files_changed} 个文件:{' '}
                {entry.files.map((f, j) => (
                  <span
                    key={j}
                    onClick={() => onSelectFile?.(f)}
                    style={{
                      cursor: onSelectFile ? 'pointer' : 'default',
                      textDecoration: onSelectFile ? 'underline dotted' : 'none',
                      color: onSelectFile ? 'var(--color-accent, #3db872)' : 'inherit',
                    }}
                    title={onSelectFile ? `打开 ${f}` : f}
                  >
                    {f}
                    {j < entry.files.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
