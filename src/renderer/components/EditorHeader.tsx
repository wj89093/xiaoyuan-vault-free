import { ChevronRight, Check, Clock } from 'lucide-react'
import { useEffect } from 'react'

interface EditorHeaderProps {
  selectedFile: string | null
  isDirty: boolean
  isSaving?: boolean
  onSave: () => void
  onShowHistory?: () => void // 打开历史版本面板
}

/**
 * EditorHeader — 面包屑导航
 *
 * 显示完整路径：_wiki / _topics / 文件.md
 * 参考 mdeditor 的路径切片设计 + Apple HIG 面包屑规范
 */
export function EditorHeader({
  selectedFile,
  isDirty,
  isSaving = false,
  onSave,
  onShowHistory
}: EditorHeaderProps): JSX.Element {
  // ⌘S / Ctrl+S keyboard shortcut — promised in title tooltip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSave])

  // 从完整路径提取各部分
  const parts = selectedFile?.split('/').filter(Boolean) ?? []

  // 文件名 = 最后一部分
  const fileName = parts.pop() ?? '无文件'

  const saveTitle = isSaving ? '保存中…' : isDirty ? '保存 (⌘S)' : '已保存'
  const showSaveButton = isDirty || isSaving

  // 只有文件名时，不显示面包屑
  if (parts.length === 0) {
    return (
      <div className="editor-header">
        <span className="editor-header-name">{fileName || '无文件'}</span>
        {onShowHistory && (
          <button
            className="editor-header-history"
            onClick={onShowHistory}
            title="查看历史版本"
            aria-label="查看历史版本"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-secondary)'
            }}
          >
            <Clock size={14} />
          </button>
        )}
        {showSaveButton && (
          <button
            className={`editor-header-save${isSaving ? ' saving' : ''}`}
            onClick={isSaving || !isDirty ? undefined : onSave}
            title={saveTitle}
            aria-label={saveTitle}
            disabled={isSaving || !isDirty}
          >
            {isSaving ? (
              <span className="editor-header-save-spinner" aria-hidden="true" />
            ) : isDirty ? (
              <span className="editor-header-dirty-dot" role="img" aria-label="有未保存更改" />
            ) : (
              <Check size={12} aria-hidden="true" />
            )}
          </button>
        )}
        {!showSaveButton && isDirty === false && selectedFile && (
          <button className="editor-header-save saved" title="已保存" aria-label="已保存" disabled>
            <Check size={12} aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="editor-header">
      {/* 面包屑路径 */}
      <nav className="editor-header-breadcrumb" aria-label="文件路径">
        {parts.map((part, index) => (
          <span key={index} className="editor-header-crumb-group">
            <button
              className="editor-header-crumb"
              aria-label={`导航到 ${part}`}
              aria-current={index === parts.length - 1 ? 'page' : undefined}
              onClick={undefined}
            >
              {part}
            </button>
            <ChevronRight size={12} className="editor-header-separator" aria-hidden="true" />
          </span>
        ))}
      </nav>

      {/* 文件名 */}
      <span className="editor-header-name">{fileName}</span>

      {/* 历史版本按钮 */}
      {onShowHistory && (
        <button
          className="editor-header-history"
          onClick={onShowHistory}
          title="查看历史版本"
          aria-label="查看历史版本"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-secondary)'
          }}
        >
          <Clock size={14} />
        </button>
      )}

      {/* 保存指示器 */}
      {showSaveButton && (
        <button
          className={`editor-header-save${isSaving ? ' saving' : ''}`}
          onClick={isSaving || !isDirty ? undefined : onSave}
          title={saveTitle}
          aria-label={saveTitle}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? (
            <span className="editor-header-save-spinner" aria-hidden="true" />
          ) : isDirty ? (
            <span className="editor-header-dirty-dot" role="img" aria-label="有未保存更改" />
          ) : (
            <Check size={12} aria-hidden="true" />
          )}
        </button>
      )}
      {!showSaveButton && selectedFile && (
        <button className="editor-header-save saved" title="已保存" aria-label="已保存" disabled>
          <Check size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
