import { memo, useState, useEffect, type JSX } from 'react'
import { FolderCog, RefreshCw } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface SchemaPanelProps {
  onClose: () => void
}

interface FolderSchema {
  folder: string
  title: string
  description: string
  body: string
  confirmed: boolean
}

export const SchemaPanel = memo(function SchemaPanel({ onClose }: SchemaPanelProps): JSX.Element {
  const [allSchemas, setAllSchemas] = useState<FolderSchema[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // P2-3: AI guard — pending AI trigger request
  const [_aiConfirm, _setAiConfirm] = useState<{
    folder: string
    action: 'create' | 'redesign'
  } | null>(null)

  const loadSchemas = async () => {
    try {
      const vaultPath = await (window.api as any).getVaultPath?.()
      if (!vaultPath) {
        setAllSchemas([])
        setLoaded(true)
        return
      }
      const schemas = await window.api.listSchemas?.(vaultPath)
      setAllSchemas((schemas ?? []) as never)
    } catch (err) {
      console.error('[SchemaPanel] loadSchemas failed:', err) /* ignore */
    }
    setLoaded(true)
  }

  useEffect(() => {
    void loadSchemas()
  }, [])

  const confirmed = allSchemas.filter((s) => s.confirmed)
  const pending = allSchemas.filter((s) => !s.confirmed)

  const toggleExpand = (folder: string) => {
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(folder)) n.delete(folder)
      else n.add(folder)
      return n
    })
  }

  // P2-1: keyboard toggle on header row
  const handleHeaderKeyDown = (e: React.KeyboardEvent, folder: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleExpand(folder)
    }
  }

  return (
    <FloatingPanel
      title="模式管理"
      icon={<FolderCog size={15} />}
      onClose={onClose}
      width={480}
      height={580}
      bottomOffset={80}
    >
      {/* Sub-header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-3)',
          gap: 'var(--space-2',borderBottom: '1px solid #e5e5ea'
        }}
      >
        <button
          onClick={() => void loadSchemas()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1',fontSize: 11,
            padding: 'var(--space-1) var(--space-2)',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
            color: 'var(--color-text-primary, #1d1d1f)'
          }}
        >
          <RefreshCw size={11} /> 刷新
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)' }}>
          {loaded ? `${allSchemas.length} 个 Schema` : ''}
        </span>
        <span
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary, #8e8e93)' }}
        >
          {loaded && confirmed.length > 0 ? `${confirmed.length} 已确认` : ''}
          {loaded && pending.length > 0 ? ` · ${pending.length} 待创建` : ''}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!loaded ? (
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
        ) : allSchemas.length === 0 ? (
          <div
            style={{
              color: 'var(--color-text-tertiary, #a1a1a6)',
              fontSize: 13,
              textAlign: 'center',
              padding: 32
            }}
          >
            暂无 Schema
            <div style={{ fontSize: 11, marginTop: 4 }}>在 _wiki/ 中创建子目录后将自动出现在此</div>
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            {allSchemas.map((schema) => (
              <div
                key={schema.folder}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  margin: 'var(--space-1) var(--space-2)',
                  overflow: 'hidden'
                }}
              >
                {/* P2-1: header row — keyboard accessible */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded.has(schema.folder)}
                  aria-label={`展开 ${schema.folder} Schema`}
                  style={{
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-surface, #f9f9fb)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                  }}
                  onClick={() => toggleExpand(schema.folder)}
                  onKeyDown={(e) => handleHeaderKeyDown(e, schema.folder)}
                >
                  <span
                    style={{
                      fontSize: 10,
                      transition: 'transform 150ms',
                      display: 'inline-block',
                      transform: expanded.has(schema.folder) ? 'rotate(90deg)' : 'none',
                      color: 'var(--color-text-tertiary, #8e8e93)'
                    }}
                  >
                    ▶
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {schema.folder}
                    </div>
                    {schema.description && (
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--color-text-tertiary, #8e8e93)',
                          marginTop: 1
                        }}
                      >
                        {schema.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2',flexShrink: 0 }}>
                    {/* Pro 专属: AI Schema 重新设计/创建 — 开源版不显示 */}
                  </div>
                </div>

                {/* Expanded body */}
                {expanded.has(schema.folder) && (
                  <div
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderTop: '1px solid #e5e5ea',
                      background: 'var(--color-surface)'
                    }}
                  >
                    {editing === schema.folder ? (
                      <>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: 200,
                            border: '1px solid var(--color-border)',
                            borderRadius: 6,
                            padding: 10,
                            fontSize: 12,
                            fontFamily: 'monospace',
                            lineHeight: 1.7,
                            resize: 'vertical',
                            outline: 'none'
                          }}
                          autoFocus
                        />
                        <div
                          style={{
                            display: 'flex',
                            gap: 'var(--space-2',marginTop: 8,
                            justifyContent: 'flex-end'
                          }}
                        >
                          <button
                            onClick={() => setEditing(null)}
                            disabled={saving}
                            style={{
                              fontSize: 11,
                              padding: 'var(--space-1) var(--space-3)',
                              borderRadius: 6,
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-surface)',
                              cursor: 'pointer'
                            }}
                          >
                            取消
                          </button>
                          <button
                            onClick={async () => {
                              setSaving(true)
                              try {
                                const vaultPath = await (window.api as any).getVaultPath?.()
                                if (!vaultPath) return
                                await window.api.saveFile(
                                  `${vaultPath}/_schema/${schema.folder}/confirmed.md`,
                                  editContent
                                )
                                setEditing(null)
                                await loadSchemas()
                              } catch (err) {
                                console.error('[SchemaPanel] save failed:', err)
                                setSaveError(err instanceof Error ? err.message : String(err))
                              } finally {
                                setSaving(false)
                              }
                            }}
                            disabled={saving}
                            style={{
                              fontSize: 11,
                              padding: 'var(--space-1) var(--space-3)',
                              borderRadius: 6,
                              border: 'none',
                              background: saving
                                ? 'var(--color-border)'
                                : 'var(--color-primary, #1a56a8)',
                              color: 'var(--color-text-inverse)',
                              cursor: 'pointer',
                              opacity: saving ? 0.6 : 1
                            }}
                          >
                            {saving ? '保存中...' : '保存'}
                          </button>
                        </div>
                        {saveError && editing === schema.folder && (
                          <div
                            role="alert"
                            style={{
                              color: 'var(--color-red, #ef4444)',
                              fontSize: 11,
                              marginTop: 6
                            }}
                          >
                            保存失败：{saveError}
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        onClick={() => {
                          setEditing(schema.folder)
                          setEditContent(schema.body || `# ${schema.folder} Schema\n\n待定义\n`)
                        }}
                        style={{
                          fontSize: 12,
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                          color: 'var(--color-text-primary, #1d1d1f)',
                          fontFamily: 'var(--font-mono), monospace',
                          maxHeight: 300,
                          overflowY: 'auto',
                          cursor: 'text',
                          padding: 4,
                          borderRadius: 4
                        }}
                        title="点击编辑"
                      >
                        {schema.body || '该领域在 _wiki/ 中有内容，但尚未定义 Schema — 点击编辑'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </FloatingPanel>
  )
})
