import { memo, type JSX } from 'react'
import { ChevronRight, Check, Clock } from 'lucide-react'

interface EditorHeaderProps {
  /** 面包屑路径段，如 ['_wiki', '合同管理', '2026-06-12-ABC科技合同.md'] */
  breadcrumb: string[]
  /** 当前文件是否已保存（true=已保存，false=有未保存修改） */
  saved: boolean
  /** 点击保存按钮回调 */
  onSave?: () => void
  /** 点击面包屑某段的回调 */
  onBreadcrumbClick?: (index: number) => void
  /** 点击历史版本回调 */
  onHistoryClick?: () => void
}

export const EditorHeader = memo(function EditorHeader({
  breadcrumb,
  saved,
  onSave,
  onBreadcrumbClick,
  onHistoryClick
}: EditorHeaderProps): JSX.Element {
  return (
    <div className="editor-header">
      <div className="editor-header-breadcrumb">
        {breadcrumb.map((segment, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {i > 0 && (
              <ChevronRight
                size={12}
                style={{ color: 'var(--text-tertiary)', opacity: 0.5, flexShrink: 0 }}
              />
            )}
            <button
              className="editor-header-crumb"
              onClick={() => onBreadcrumbClick?.(i)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 'var(--space-1) var(--space-1)',
                borderRadius: 4,
                fontSize: 'var(--text-sm)',
                color:
                  i === breadcrumb.length - 1
                    ? 'var(--text-primary)'
                    : 'var(--text-tertiary)',
                fontWeight: i === breadcrumb.length - 1 ? 500 : 400
              }}
            >
              {segment}
            </button>
          </span>
        ))}
      </div>

      <div className="editor-header-actions">
        <button
          title="查看历史版本"
          aria-label="查看历史版本"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--space-1) var(--space-1)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-secondary)'
          }}
          onClick={onHistoryClick}
        >
          <Clock size={14} />
        </button>

        <button
          title={saved ? '已保存' : '保存'}
          aria-label={saved ? '已保存' : '保存'}
          style={{
            background: saved ? 'none' : 'var(--accent)',
            border: 'none',
            cursor: saved ? 'default' : 'pointer',
            padding: 'var(--space-1) var(--space-1)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            color: saved ? 'var(--text-tertiary)' : '#fff',
            fontSize: 'var(--text-sm)'
          }}
          onClick={onSave}
          disabled={saved}
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  )
})
