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
      const vaultPath = await (window.api as any).getVaultPath?.()
      if (!vaultPath) {
        setContent('')
        setLoading(false)
        return
      }
      const resp = await (window.api as any).readFile(`${vaultPath}/_output/README.md`)
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
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-3)',
          gap: 'var(--space-2',borderBottom: '1px solid var(--color-border)'
        }}
      >
        <button
          onClick={() => void loadOutput()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1',fontSize: 11,
            padding: 'var(--space-1) var(--space-3)',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
            color: 'var(--color-text-primary)'
          }}
        >
          <RefreshCw size={11} /> 刷新
        </button>
        <span
          style={{ fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)', marginLeft: 'auto' }}
        >
          {content ? content.split('\n').length + ' 行' : ''}
        </span>
      </div>

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
