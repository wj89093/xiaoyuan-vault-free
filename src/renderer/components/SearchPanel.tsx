import { useState, useEffect, useRef, useCallback, type JSX } from 'react'
import { Search, FileText } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface SearchPanelProps {
  onClose: () => void
  onSelectFile: (path: string) => void
}

interface SearchResult {
  path: string
  name: string
  title?: string
}

export function SearchPanel({ onClose, onSelectFile }: SearchPanelProps): JSX.Element {
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

  const doSearch = async (q: string) => {
    setQuery(q)
    setSelectedIndex(-1)
    if (!q.trim()) {
      setResultsVisible(false)
      setTimeout(() => {
        setResults([])
      }, 200)
      return
    }
    setLoading(true)
    try {
      const files = await window.api.searchFiles(q)
      setResults((files as SearchResult[]) ?? [])
      setResultsVisible(true)
    } catch {
      setResults([])
    }
    setLoading(false)
  }

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
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e5ea' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--color-surface-hover, #f0f0f5)',
            borderRadius: 8,
            padding: '6px 10px',
            gap: 6
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
                padding: '4px 12px 2px',
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
                key={i}
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
                  gap: 8,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  margin: '2px 4px',
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
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-tertiary, #a1a1a6)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {r.path}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}
