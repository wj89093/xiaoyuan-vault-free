/**
 * VersionHistoryPanel — 右侧抽屉：查看/恢复文件历史版本
 *
 * Props:
 *   filePath — 当前打开的文件完整路径
 *   onClose — 关闭回调
 *   onRestore — 恢复后回调（通知父组件重新加载文件）
 */
import { useState, useEffect, memo } from 'react'
import { X, Clock, RotateCcw } from 'lucide-react'

interface BackupEntry {
  timestamp: string
  size: number
  isoTime: string
}

interface VersionHistoryPanelProps {
  filePath: string
  fileName: string
  onClose: () => void
  onRestore: () => void
}

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  filePath,
  fileName,
  onClose,
  onRestore
}: VersionHistoryPanelProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<BackupEntry | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!filePath) return
    setLoading(true)
    window.api.file.listBackups?.(filePath)
      .then((list: unknown) => {
        setBackups(list as BackupEntry[])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filePath])

  async function handleSelect(entry: BackupEntry) {
    setSelected(entry)
    setPreviewLoading(true)
    try {
      const content = await (window.api.file.previewBackup as any)(filePath, entry.timestamp)
      setPreview(content)
    } catch {
      setPreview('加载失败')
    }
    setPreviewLoading(false)
  }

  async function handleRestore(entry: BackupEntry) {
    if (!confirm(`确定恢复到 ${entry.isoTime} 的版本？当前内容将被覆盖。`)) return
    setRestoring(true)
    try {
      const ok = await (window.api.file.restoreBackup as any)(filePath, entry.timestamp)
      if (ok) {
        onRestore()
        onClose()
      } else {
        alert('恢复失败')
      }
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-elevated)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>历史版本</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 6,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center'
          }}
          title="关闭"
        >
          <X size={18} />
        </button>
      </div>

      {/* File name */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--text-tertiary)',
          background: 'var(--surface-hover)'
        }}
      >
        <span style={{ fontFamily: 'monospace' }}>{fileName}</span>
        <span style={{ marginLeft: 8 }}>共 {backups.length} 个版本</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
        {/* Backup list */}
        <div style={{ width: 160, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
          {loading && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13
              }}
            >
              加载中…
            </div>
          )}
          {!loading && backups.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13
              }}
            >
              暂无历史版本
            </div>
          )}
          {!loading &&
            backups.map((entry) => (
              <div
                key={entry.timestamp}
                onClick={() => handleSelect(entry)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 12,
                  borderBottom: '1px solid var(--border)',
                  background:
                    selected?.timestamp === entry.timestamp
                      ? 'var(--primary-alpha)'
                      : 'transparent',
                  color: selected?.timestamp === entry.timestamp ? 'var(--primary)' : 'var(--text)'
                }}
              >
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{entry.isoTime}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {(entry.size / 1024).toFixed(1)} KB
                </div>
              </div>
            ))}
        </div>

        {/* Preview + actions */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 13
              }}
            >
              点击左侧版本预览内容
            </div>
          )}
          {selected && (
            <>
              {/* Preview */}
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
                {previewLoading ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>加载预览…</div>
                ) : (
                  <pre
                    style={{
                      fontSize: 12,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'var(--text)',
                      margin: 0,
                      maxHeight: '100%',
                      overflow: 'auto'
                    }}
                  >
                    {preview || '(空)'}
                  </pre>
                )}
              </div>

              {/* Actions */}
              <div
                style={{
                  padding: '10px 16px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  gap: 8,
                  background: 'var(--surface-elevated)'
                }}
              >
                <button
                  onClick={() => handleRestore(selected)}
                  disabled={restoring}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500
                  }}
                >
                  <RotateCcw size={14} />
                  {restoring ? '恢复中…' : '恢复此版本'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
})
