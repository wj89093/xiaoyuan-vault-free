import { memo, useState, useEffect, useRef, useCallback, type JSX } from 'react'
import { Search, FileText } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

// 拆分 FTS5 snippet (含 <mark>关键词</mark>) 为 React 组件
// 安全: 不使用 dangerouslySetInnerHTML, React 自动 escape 文本段,
// <mark> 段仅包撁 mark 标签(是受信任的 SQLite 输出), 不用 escape
function renderSnippet(snippet: string): JSX.Element {
  const parts = snippet.split(/(<mark>.*?<\/mark>)/)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('<mark>') && part.endsWith('</mark>')) {
          return (
            <mark
              key={i}
              style={{ background: 'var(--color-yellow-light, #fff3a0)', color: 'inherit', padding: 0 }}
            >
              {part.slice(6, -7)}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

interface SearchPanelProps {
  onClose: () => void
  onSelectFile: (path: string) => void
}

interface SearchResult {
  path: string
  name: string
  title?: string
  /** FTS5 snippet: 含 <mark>关键词</mark> 的正文片段 (前后 16 tokens) */
  snippet?: string
}

export const SearchPanel = memo(function SearchPanel({ onClose, onSelectFile }: SearchPanelProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [resultsVisible, setResultsVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // v1.5: 防抖 — 每个按键不再立即 IPC, 等 200ms 静止才发
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryReqIdRef = useRef(0) // 取消过期的 promise
  const doSearch = useCallback((q: string) => {
    setQuery(q)
    setSelectedIndex(-1)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!q.trim()) {
      setResultsVisible(false)
      setTimeout(() => setResults([]), 200)
      return
    }
    const reqId = ++queryReqIdRef.current
    searchTimerRef.current = setTimeout(async () => {
      if (reqId !== queryReqIdRef.current) return // 用户又按键了, 过期
      setLoading(true)
      try {
        const files = await window.api.searchFiles(q)
        if (reqId !== queryReqIdRef.current) return // 结果回来时又过期了
        setResults((files as SearchResult[]) ?? [])
        setResultsVisible(true)
      } catch {
        if (reqId !== queryReqIdRef.current) return
        setResults([])
      } finally {
        if (reqId === queryReqIdRef.current) setLoading(false)
      }
    }, 200)
  }, [])
  // 卸载时清 timer
  useEffect(() => () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
  }, [])

  const openSelected = useCallback(
    (index: number) => {
      const item = results[index]
      if (item) {
        onSelectFile(item.path)
        onClose()
      }
    },
    [results, onSelectFile, onClose]
  )

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0) openSelected(selectedIndex)
      else doSearch(query)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLElement>('[role="option"]')
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const showResults = query.trim().length > 0
  const hasResults = results.length > 0

  return (
    <FloatingPanel
      title="搜索"
      icon={<Search size={15} />}
      onClose={onClose}
      width={420}
      height={500}
      bottomOffset={80}
    >
      <div style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid #e5e5ea' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--color-surface-hover, #f0f0f5)',
            borderRadius: 8,
            padding: 'var(--space-2) var(--space-2)',
            gap: 'var(--space-2)'
          }}
        >
          <Search
            size={14}
            style={{ color: 'var(--color-text-tertiary, #8e8e93)', flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => doSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索文件..."
            aria-label="搜索文件"
            aria-controls="search-results-list"
            aria-activedescendant={selectedIndex >= 0 ? `search-item-${selectedIndex}` : undefined}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: 13,
              color: 'var(--color-text-primary, #1d1d1f)'
            }}
          />
          {query && (
            <button
              onClick={() => doSearch('')}
              aria-label="清除搜索"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary, #8e8e93)',
                cursor: 'pointer',
                fontSize: 14,
                padding: 0,
                lineHeight: 1
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          transition: 'opacity 200ms ease',
          opacity: resultsVisible ? 1 : 0
        }}
        ref={listRef}
        id="search-results-list"
        role="listbox"
      >
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: 24,
              color: 'var(--color-text-tertiary, #a1a1a6)',
              fontSize: 13
            }}
          >
            搜索中…
          </div>
        ) : showResults && !hasResults ? (
          <div
            style={{
              textAlign: 'center',
              padding: 24,
              color: 'var(--color-text-tertiary, #a1a1a6)',
              fontSize: 13
            }}
          >
            无结果
          </div>
        ) : !showResults ? (
          <div
            style={{
              textAlign: 'center',
              padding: 24,
              color: 'var(--color-text-tertiary, #a1a1a6)',
              fontSize: 13
            }}
          >
            暂无搜索历史
          </div>
        ) : (
          <div style={{ padding: 4 }}>
            {/* Result count */}
            <div
              style={{
                padding: 'var(--space-1) var(--space-3) var(--space-2)',
                fontSize: 11,
                color: 'var(--color-text-tertiary, #a1a1a6)'
              }}
              role="status"
              aria-live="polite"
            >
              {results.length} 个结果
            </div>
            {results.map((r, i) => (
              <div
                key={r.path}
                id={`search-item-${i}`}
                role="option"
                aria-selected={selectedIndex === i}
                aria-disabled={results.length === 0}
                tabIndex={-1}
                onClick={() => {
                  setSelectedIndex(i)
                  openSelected(i)
                }}
                onMouseEnter={(e) => {
                  setSelectedIndex(i)
                  if (selectedIndex !== i)
                    e.currentTarget.style.background = 'var(--color-surface-hover, #f0f0f5)'
                }}
                onMouseLeave={(e) => {
                  if (selectedIndex !== i) e.currentTarget.style.background = 'transparent'
                }}
                data-selected={selectedIndex === i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: ',var(--space-2)',padding: 'var(--space-2) var(--space-3)',
                  cursor: 'pointer',
                  borderRadius: 6,
                  margin: 'var(--space-2) var(--space-1)',
                  transition: 'background 0.1s',
                  background:
                    selectedIndex === i ? 'var(--color-surface-hover, #f0f0f5)' : 'transparent',
                  outline: selectedIndex === i ? '2px solid var(--accent, #007aff)' : 'none',
                  outlineOffset: -2
                }}
              >
                <FileText
                  size={14}
                  style={{ color: 'var(--color-text-tertiary, #8e8e93)', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {r.title ?? r.name}
                  </div>
                  {r.snippet ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-text-tertiary, #a1a1a6)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 2
                      }}
                      title={r.snippet.replace(/<\/?mark>/g, '')}
                    >
                      {renderSnippet(r.snippet)}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--color-text-tertiary, #a1a1a6)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 2
                      }}
                    >
                      {r.path}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FloatingPanel>
  )
})
