/**
 * AuditNotice.tsx — backport from team ada72e9 (2026-07-07 23:09)
 */

import { useEffect, useState, type JSX } from 'react'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'

interface UncommittedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  author: string | null
  mtime: number
  diffLines: number
}

interface AuditNoticeProps {
  /** vault 路径 */
  vaultPath: string | null
  /** 通知显示多久后自动消失 (ms), 默认 5000 */
  autoHideMs?: number
  /** 用户点 "查看审计" 按钮时回调 */
  onOpenAudit?: () => void
}

const AUTO_HIDE_DEFAULT = 5000

export function AuditNotice({ vaultPath, autoHideMs = AUTO_HIDE_DEFAULT, onOpenAudit }: AuditNoticeProps): JSX.Element | null {
  const [status, setStatus] = useState<{
    files: UncommittedFile[]
    hasPostCommitHook: boolean
    isGitRepo: boolean
  } | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // 1. App 启动 / 切 vault 时调 IPC 检查
  useEffect(() => {
    if (!vaultPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await window.api.vault.gitStatus(vaultPath)
        if (!cancelled) {
          setStatus(result)
          setDismissed(false)  // 切 vault 重新弹
        }
      } catch {
        if (!cancelled) setStatus(null)
      }
    })()
    return () => { cancelled = true }
  }, [vaultPath])

  // 2. 自动消失
  useEffect(() => {
    if (!status || status.files.length === 0) return
    const t = setTimeout(() => setDismissed(true), autoHideMs)
    return () => clearTimeout(t)
  }, [status, autoHideMs])

  // 3. 渲染条件: 非 git repo / 没改动 / 已 dismiss → 不渲染
  if (!status || !status.isGitRepo || status.files.length === 0 || dismissed) {
    return null
  }

  const files = status.files
  const unknownCount = files.filter(f => f.author === null).length
  const totalLines = files.reduce((sum, f) => sum + f.diffLines, 0)

  return (
    <div
      role="alertdialog"
      aria-label="外部修改通知"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 700,
        background: 'var(--color-bg)',
        border: '1px solid #f5a623',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.1)',
        padding: '12px 16px',
        minWidth: 360,
        maxWidth: 520,
        fontSize: 13,
        color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertTriangle size={16} color="#f5a623" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            检测到 {files.length} 个文件被外部修改
            {totalLines > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6, fontSize: 12 }}>
                ({totalLines} 行改动)
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {unknownCount > 0 && (
              <span style={{ color: 'var(--color-red)' }}>
                ⚠️ {unknownCount} 个改动 actor 未知 (git user.name 未设)
                <br />
              </span>
            )}
            {!status.hasPostCommitHook && (
              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
                💡 提示: .git/hooks/post-commit 未装, 审计不会被自动记录
                <br />
              </span>
            )}
            点 "查看" 打开审计 tab 详细查看
          </div>

          {/* 展开: 显示文件列表 (最多 5 个) */}
          {expanded && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                background: 'var(--color-surface-hover, #f5f5f7)',
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 11,
                maxHeight: 120,
                overflowY: 'auto',
              }}
            >
              {files.slice(0, 10).map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, color: 'var(--color-text-secondary)' }}>
                  <span style={{ width: 60, flexShrink: 0, opacity: 0.6 }}>{f.status}</span>
                  <span style={{ flex: 1, wordBreak: 'break-all' }}>{f.path}</span>
                  <span style={{ flexShrink: 0, opacity: 0.6 }}>+{f.diffLines}</span>
                </div>
              ))}
              {files.length > 10 && (
                <div style={{ marginTop: 4, color: 'var(--color-text-tertiary)' }}>
                  ... 还有 {files.length - 10} 个
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={onOpenAudit}
              style={{
                padding: '4px 12px',
                background: 'var(--color-primary, #007aff)',
                border: 'none',
                borderRadius: 4,
                color: 'white',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              查看 <ChevronRight size={12} />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {expanded ? '收起' : `展开 (${files.length})`}
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="关闭"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            padding: 2,
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
