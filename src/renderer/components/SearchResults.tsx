import { FileText } from 'lucide-react'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { FileInfo } from '../types'

interface SearchResultsProps {
  results: FileInfo[]
  query: string
  onSelect: (path: string) => void
  onClose: () => void
}

export function SearchResults({ results, query, onSelect, onClose }: SearchResultsProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll<HTMLElement>('[data-result-item]')
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const openSelected = useCallback((index: number) => {
    const item = results[index]
    if (item) {
      onSelect(item.path)
      onClose()
    }
  }, [results, onSelect, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0) openSelected(selectedIndex)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const highlight = (text: string, q: string) => {
    if (!q.trim()) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  if (!query.trim()) return <div />

  return (
    <div className="search-results" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="search-results-header">
        <span
          className="search-results-count"
          role="status"
          aria-live="polite"
        >
          {results.length > 0 ? (
            <span className="search-results-badge">{results.length}</span>
          ) : null}
          {results.length === 0 ? '无结果' : `${results.length} 个结果`}
        </span>
        <button className="btn btn-icon" onClick={onClose} title="关闭" aria-label="关闭搜索结果">
          <span style={{ fontSize: 16, lineHeight: 1 }}>×</span>
        </button>
      </div>
      <div className="search-results-list" ref={listRef} role="listbox" aria-label="搜索结果">
        {results.length === 0 ? (
          <div className="search-results-empty">
            <p>未找到 &quot;{query}&quot;</p>
            <p className="search-results-empty-hint">试试其他关键词，或检查拼写</p>
          </div>
        ) : (
          results.map((file, i) => (
            <div
              key={file.path}
              data-result-item={i}
              role="option"
              aria-selected={selectedIndex === i}
              tabIndex={-1}
              className={`search-results-item${selectedIndex === i ? ' selected' : ''}`}
              onClick={() => { setSelectedIndex(i); openSelected(i) }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{ animationDelay: `${Math.min(i * 20, 200)}ms` }}
            >
              <FileText size={14} className="search-results-icon" />
              <div className="search-results-info">
                <span className="search-results-name">{highlight(file.name, query)}</span>
                <span className="search-results-path">{highlight(file.path, query)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
