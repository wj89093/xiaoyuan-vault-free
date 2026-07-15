import { useState, useEffect, memo, type JSX } from 'react'
import { FileOutput, RefreshCw } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface OutputPanelProps {
  onClose: () => void
}

export const OutputPanel = memo(function OutputPanel({ onClose }: OutputPanelProps): JSX.Element {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  const loadOutput = async () => {
    setLoading(true)
    try {
      const vaultPath = await window.api.getVaultPath?.()
      if (!vaultPath) {
        setContent('')
        setLoading(false)
        return
      }
      const resp = await window.api.readFile(`${vaultPath}/_output/README.md`)
      setContent(resp ?? '')
    } catch {
      // Most common case: _output/README.md doesn't exist yet
      // Treat as empty state, not error
      setContent('')
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadOutput()
  }, [])

  return (
    <FloatingPanel
      title="产出"
      icon={<FileOutput size={15} />}
      onClose={onClose}
      width={420}
      height={520}
      bottomOffset={80}
      // 2026-07-07 (backport from team d3e9433): 刷新按钮挪到 title bar 关闭按钮左边
      headerActions={
        <button
          onClick={() => void loadOutput()}
          disabled={loading}
          className={'floating-panel-action-btn' + (loading ? ' spinning' : '')}
          title={loading ? '加载中...' : '刷新产出'}
          aria-label="刷新产出"
        >
          <RefreshCw size={13} />
        </button>
      }
    >
      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: 'var(--color-text-tertiary)',
            fontSize: 13
          }}
        >
          加载中...
        </div>
      ) : !content ? (
        <div
          style={{
            textAlign: 'center',
            padding: 32,
            color: 'var(--color-text-tertiary)',
            fontSize: 13
          }}
        >
          暂无输出内容
          <div
            style={{
              fontSize: 11,
              marginTop: 6,
              color: 'var(--color-text-tertiary)',
              lineHeight: 1.6
            }}
          >
            <div>Agent 运行后，导出的文档自动放在</div>
            <code
              style={{
                fontFamily: 'monospace',
                background: 'var(--color-surface-hover)',
                padding: 'var(--space-1) var(--space-1)',
                borderRadius: 3
              }}
            >
              _output/README.md
            </code>
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-3) var(--space-4)',
            fontSize: 13,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            color: 'var(--color-text-primary)'
          }}
        >
          {content}
        </div>
      )}
    </FloatingPanel>
  )
})
