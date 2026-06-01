import { useState, useEffect, useMemo } from 'react'
import { StickyNote } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface IndexFloatProps {
  vaultPath: string | null
  files: { path: string }[]
  onSelectFile: (path: string) => void
  onClose: () => void
}

function renderIndexMd(md: string): string {
  // Convert [[link]] or [[title|path]] to clickable spans
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Wiki links: [[target]] or [[title|target]] — P2-1: use <a> so they're Tab-navigable
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, title) => {
    const display = title ?? target
    const path = target.trim()
    // P2-2: title attr shows full target path on hover
    return `<a class="index-wikilink" data-path="${path}" href="#" tabindex="0" title="跳转到: ${path}" role="link">${display}</a>`
  })

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold / italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

  // Horizontal rules
  html = html.replace(/^---+/gm, '<hr>')

  // Tables: markdown → HTML
  html = html.replace(/^\|(.+)\|\s*\n\|[ \-:]+\|[ \-:\|]*\n((?:\|[^\n]+\|\s*\n?)+)/gm, (_m, header, body) => {
    const headerCells = header.split('|').filter((c: string) => c.trim()).map((c: string) => '<th>' + c.trim() + '</th>').join('')
    const rows = body.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string, i: number, arr: string[]) => i > 0 && i < arr.length - 1).map((c: string) => '<td>' + c.trim() + '</td>').join('')
      return '<tr>' + cells + '</tr>'
    }).join('')
    return '<table class="index-table"><thead><tr>' + headerCells + '</tr></thead><tbody>' + rows + '</tbody></table>'
  })

  // Paragraphs: blank lines separate paragraphs
  html = html.replace(/\n\n+/g, '\n<p></p>\n')
  // Single newlines → <br> (within paragraphs)
  const parts = html.split('\n')
  const result: string[] = []
  for (const line of parts) {
    if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<li') || 
        line.startsWith('</ul') || line.startsWith('<hr') || line.startsWith('<p>')) {
      result.push(line)
    } else {
      result.push(line + '<br>')
    }
  }
  html = result.join('\n')

  return `<div class="index-rendered">${html}</div>`
}

export function IndexFloat({ vaultPath, files, onSelectFile, onClose }: IndexFloatProps): JSX.Element {
  const [content, setContent] = useState<string>('')

  useEffect(() => {
    if (!vaultPath) return
    const loadIndex = async () => {
      try {
        const md = await window.api.readFile?.(vaultPath + '/index.md')
        if (md) setContent(md)
      } catch { /* index.md may not exist */ }
    }
    void loadIndex()
    // Re-read when files change (agent writes to index.md)
    const unsub = window.api?.onImportCompleted?.(() => { void loadIndex() })
    return unsub
  }, [vaultPath])

  const html = useMemo(() => (content ? renderIndexMd(content) : ''), [content])

  // P2-1: keyboard handler for wiki links (Enter/Space on <a data-path>)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement
    if (!target.getAttribute('data-path')) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const wikiTitle = target.getAttribute('data-path')!
      const match = files.find(f => {
        const name = f.path.split('/').pop()?.replace(/\.md$/, '')
        return name === wikiTitle || f.path === wikiTitle || f.path.endsWith('/' + wikiTitle) || f.path.endsWith('/' + wikiTitle + '.md')
      })
      if (match) onSelectFile(match.path)
      else onSelectFile(wikiTitle.endsWith('.md') ? wikiTitle : `${wikiTitle}.md`)
      onClose()
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const wikiTitle = target.getAttribute('data-path')
    if (!wikiTitle) return

    // Resolve wiki link to actual file path (same logic as Editor's onWikiLinkNavigate)
    const match = files.find(f => {
      const name = f.path.split('/').pop()?.replace(/\.md$/, '')
      return name === wikiTitle || f.path === wikiTitle || f.path.endsWith('/' + wikiTitle) || f.path.endsWith('/' + wikiTitle + '.md')
    })
    if (match) {
      onSelectFile(match.path)
    } else {
      onSelectFile(wikiTitle.endsWith('.md') ? wikiTitle : `${wikiTitle}.md`)
    }
    onClose()
  }

  return (
    <FloatingPanel title="索引" icon={<StickyNote size={16} />} onClose={onClose}>
      <div className="index-panel-md" onClick={handleClick} onKeyDown={handleKeyDown}>
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="index-panel-empty">暂无目录，创建 index.md 即可在此看到索引内容</div>
        )}
      </div>
    </FloatingPanel>
  )
}
