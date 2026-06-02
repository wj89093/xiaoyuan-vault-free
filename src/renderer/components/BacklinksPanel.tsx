import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, ExternalLink, X } from 'lucide-react'

interface BacklinkFile {
  path: string
  name: string
}

interface BacklinksPanelProps {
  selectedFile: string | null
  onNavigate: (path: string) => void
  onClose: () => void
}

export function BacklinksPanel({
  selectedFile,
  onNavigate,
  onClose
}: BacklinksPanelProps): JSX.Element {
  const [backlinks, setBacklinks] = useState<BacklinkFile[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeIndexRef = useRef(activeIndex)
  const listRef = useRef<HTMLDivElement>(null)

  const currentName = selectedFile?.split('/').pop()?.replace(/\.md$/, '') ?? ''

  const loadBacklinks = useCallback(async () => {
    if (!selectedFile || !currentName) return
    setLoading(true)
    setBacklinks([])
    setActiveIndex(-1)

    try {
      const searchPattern = `[[${currentName}]]`
      void searchPattern // hint for lint
      const results = await window.api.searchFiles(searchPattern)
      const filtered = results
        .filter((f: { path: string }) => f.path !== selectedFile)
        .slice(0, 20)
        .map((f: { path: string; name: string }) => ({ path: f.path, name: f.name }))
      setBacklinks(filtered)
    } catch {
      setBacklinks([])
    } finally {
      setLoading(false)
    }
  }, [selectedFile, currentName])

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void loadBacklinks()
    })
    return () => cancelAnimationFrame(id)
  }, [loadBacklinks])

  // Sync ref so keyDown handler always reads latest value
  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (loading || backlinks.length === 0) return
    const current = activeIndexRef.current
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, backlinks.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && current >= 0) {
      e.preventDefault()
      onNavigate(backlinks[current].path)
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll<HTMLElement>('.backlinks-item')
    items[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!selectedFile) return <div className="backlinks-panel" />

  return (
    <div className="backlinks-panel">
      <div className="backlinks-header">
        <ArrowLeft size={14} />
        <span className="backlinks-title">反向链接</span>
        {!loading && <span className="backlinks-count">{backlinks.length}</span>}
        <button className="backlinks-close" onClick={onClose} aria-label="关闭" title="关闭">
          <X size={14} />
        </button>
      </div>

      <div className="backlinks-content">
        {loading ? (
          <div className="backlinks-empty" role="status" aria-live="polite">
            加载中...
          </div>
        ) : backlinks.length === 0 ? (
          <div className="backlinks-empty" role="status" aria-live="polite">
            无反向链接
            <div className="backlinks-hint">
              在其他文档中使用 <code>[[{currentName}]]</code> 引用本文档
            </div>
          </div>
        ) : (
          <div
            className="backlinks-list"
            ref={listRef}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="list"
            aria-label="反向链接列表"
          >
            {backlinks.map((file, i) => (
              <div
                key={file.path}
                className={`backlinks-item${activeIndex === i ? ' backlinks-item-active' : ''}`}
                onClick={() => onNavigate(file.path)}
                role="listitem"
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(i)}
                title={`Ctrl+点击打开: ${file.name}`}
              >
                <div className="backlinks-item-name">
                  <ExternalLink size={12} />
                  {file.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
