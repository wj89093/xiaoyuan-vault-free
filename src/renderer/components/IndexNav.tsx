import { useEffect, useState, type JSX } from 'react'
import { ChevronRight, List } from 'lucide-react'

interface IndexNavProps {
  vaultPath: string | null
  onSelectFile: (path: string) => void
  selectedFile?: string | null // P2-1: current location indicator
}

interface IndexEntry {
  title: string
  path: string
  summary: string
}

function parseIndex(content: string): IndexEntry[] {
  const entries: IndexEntry[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    // Match link patterns: [[title]] or [title](path)
    const linkMatch = line.match(/\[\[([^\]]+)\]\]/) ?? line.match(/\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch) {
      const title = linkMatch[1]
      const path = linkMatch[2] ?? linkMatch[1]
      // Get summary: text after the link
      const afterLink = line.slice(line.indexOf(linkMatch[0]) + linkMatch[0].length)
      const summary = afterLink
        .replace(/^[\s\-–—|:：]+/, '')
        .trim()
        .slice(0, 60)
      entries.push({ title, path: path.endsWith('.md') ? path : path + '.md', summary })
    }
  }
  return entries
}

export function IndexNav({
  vaultPath,
  onSelectFile,
  selectedFile
}: IndexNavProps): JSX.Element | null {
  const [entries, setEntries] = useState<IndexEntry[]>([])
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (!vaultPath) return
    void (async () => {
      try {
        const content = await window.api.readFile?.(vaultPath + '/index.md')
        if (content) setEntries(parseIndex(content))
      } catch {
        /* index.md may not exist */
      }
    })()
  }, [vaultPath])

  // Refresh when import completes
  useEffect(() => {
    const unsub = window.api.onImportCompleted?.(() => {
      void (async () => {
        try {
          const content = await window.api.readFile?.(vaultPath + '/index.md')
          if (content) setEntries(parseIndex(content))
        } catch {
          /* index.md may not exist */
        }
      })()
    })
    return () => {
      unsub?.()
    }
  }, [vaultPath])

  if (entries.length === 0) return null

  // P2-2: build breadcrumb trail from vaultPath + selectedFile
  const _breadcrumb = (() => {
    if (!selectedFile || !vaultPath) return null
    const rel = selectedFile.replace(vaultPath + '/', '').replace(/\.md$/, '')
    if (!rel) return null
    const parts = rel.split('/').filter(Boolean)
    return (
      <div className="sidebar-index-breadcrumb" aria-label="当前位置">
        {parts.map((part, i) => (
          <span key={i} className="sidebar-index-breadcrumb-part">
            <ChevronRight size={8} style={{ opacity: 0.5 }} />
            <span>{part}</span>
          </span>
        ))}
      </div>
    )
  })()

  return (
    <div className="sidebar-index">
      <button className="sidebar-index-header" onClick={() => setExpanded((v) => !v)}>
        <span className="sidebar-index-title">
          <List size={12} />
          目录
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 150ms',
            opacity: 0.5
          }}
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      {expanded && (
        <div className="sidebar-index-list">
          {entries.slice(0, 12).map((entry, i) => (
            <button
              key={i}
              className={`sidebar-index-item${selectedFile?.endsWith(entry.path) || selectedFile?.replace(/\.md$/, '').endsWith(entry.path.replace(/\.md$/, '')) ? ' sidebar-index-item-active' : ''}`}
              onClick={() => onSelectFile(entry.path)}
              aria-current={selectedFile?.endsWith(entry.path) ? 'page' : undefined}
              title={entry.summary || entry.title}
            >
              <ChevronRight size={10} className="sidebar-index-arrow" />
              <span className="sidebar-index-name">{entry.title}</span>
              {entry.summary && <span className="sidebar-index-summary">{entry.summary}</span>}
            </button>
          ))}
          {entries.length > 12 && (
            <button
              className="sidebar-index-item sidebar-index-more"
              onClick={() => onSelectFile(vaultPath + '/index.md')}
            >
              查看全部 {entries.length} 条…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
