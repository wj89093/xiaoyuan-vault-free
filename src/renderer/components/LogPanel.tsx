/* eslint-disable react-hooks/set-state-in-effect -- log panel: initial load + polling pattern, expected */
import { useState, useEffect, useRef, useMemo } from 'react'
import { FileText, RefreshCw } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface LogPanelProps {
  onClose: () => void
  onSelectFile?: (path: string) => void
}

function renderLogMd(raw: string): string {
  const lines = raw.split('\n')
  const out: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push('<hr style="border:none;border-top:1px solid var(--color-border);margin:8px 0" />')
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)/)
    if (h3) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(
        `<h3 style="font-size:12px;font-weight:700;margin:10px 0 4px;color:var(--color-text-primary)">${processLine(h3[1])}</h3>`
      )
      continue
    }
    const h2 = line.match(/^## (.+)/)
    if (h2) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(
        `<h2 style="font-size:13px;font-weight:700;margin:12px 0 4px;color:var(--color-accent,#3db872);border-bottom:1px solid var(--color-border);padding-bottom:2px">${processLine(h2[1])}</h2>`
      )
      continue
    }
    const h1 = line.match(/^# (.+)/)
    if (h1) {
      if (inList) {
        out.push('</ul>')
        inList = false
      }
      out.push(
        `<h1 style="font-size:15px;font-weight:700;margin:16px 0 6px;color:var(--color-text-primary)">${processLine(h1[1])}</h1>`
      )
      continue
    }

    // List items — parse directory from "→ dir/" pattern
    const li = line.match(/^(\s*)[-*] (.+)/)
    if (li) {
      if (!inList) {
        out.push('<ul style="margin:2px 0;padding-left:16px">')
        inList = true
      }
      const dir = extractDir(line)
      out.push(`<li style="line-height:1.6">${processLine(li[2], dir)}</li>`)
      continue
    } else if (inList && line.trim()) {
      // Continuation of list item
      const dir = extractDir(line)
      out.push(`<div style="padding-left:16px;line-height:1.6">${processLine(line, dir)}</div>`)
      continue
    } else if (inList) {
      out.push('</ul>')
      inList = false
    }

    // Empty line
    if (!line.trim()) {
      out.push('<div style="height:4px"></div>')
      continue
    }

    // Regular paragraph
    const dir = extractDir(line)
    out.push(`<div style="line-height:1.6">${processLine(line, dir)}</div>`)
  }

  if (inList) out.push('</ul>')
  return out.join('\n')
}

/** Extract directory from "→ dir/" pattern in log lines */
function extractDir(line: string): string {
  const m = line.match(/→\s*(\S+\/)/)
  return m ? m[1] : ''
}

function processLine(line: string, dir?: string): string {
  const html = line
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // **bold**
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600">$1</strong>')
    // [[wikilink]]
    .replace(/\[\[([^\]]+)\]\]/g, (_m, pageName: string) => {
      const escaped = pageName.replace(/"/g, '&quot;')
      const dirJson = dir ? dir.replace(/"/g, '&quot;') : ''
      return `<a href="#" onclick="event.preventDefault();this.dispatchEvent(new CustomEvent('log-nav',{bubbles:true,detail:{page:'${escaped}',dir:'${dirJson}'}}))" style="color:var(--color-accent,#3db872);text-decoration:none;border-bottom:1px dashed var(--color-accent,#3db872)" title="打开 ${escaped}">${escaped}</a>`
    })

  return html
}

export function LogPanel({ onClose, onSelectFile }: LogPanelProps): JSX.Element {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [lastRefresh, setLastRefresh] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef('')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadLog = async (isInitial = false) => {
    setLoadError(false)
    try {
      const vaultPath = await (window.api as any).getVaultPath?.()
      if (!vaultPath) {
        setContent('')
        if (isInitial) setLoading(false)
        return
      }
      const newContent = (await (window.api as any).readFile(`${vaultPath}/log.md`)) ?? ''
      if (newContent !== contentRef.current) {
        contentRef.current = newContent
        setContent(newContent)
      }
      const now = new Date()
      setLastRefresh(
        now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    } catch {
      setLoadError(true)
    }
    if (isInitial) setLoading(false)
  }

  // Initial load — loadLog reads vault once on mount, not a subscription
  useEffect(() => {
    void loadLog(true)
  }, [])

  // Auto-poll every 2s + bash:chunk triggers refresh + import:completed
  useEffect(() => {
    pollTimerRef.current = setInterval(() => {
      void loadLog()
    }, 2000)

    const unsubChunk = (window.api as any).agent?.onBashChunk?.(() => {
      void loadLog()
    })
    const unsubDone = (window.api as any).agent?.onBashDone?.(() => {
      void loadLog()
    })
    const unsubImport = window.api.onImportCompleted?.(() => {
      void loadLog()
    })

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      unsubChunk?.()
      unsubDone?.()
      unsubImport?.()
    }
  }, [])

  const html = useMemo(() => {
    if (!content) return ''
    return renderLogMd(content)
  }, [content])

  // Listen for log-nav custom events (wikilink clicks)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { page: string; dir?: string } | undefined
      if (!detail?.page) return
      // Construct path: _wiki/{dir}/{page}.md from log line context
      const dirPath = detail.dir
        ? `_wiki/${detail.dir}${detail.page}.md`
        : `_wiki/${detail.page}.md`
      if (onSelectFile) onSelectFile(dirPath)
    }
    el.addEventListener('log-nav', handler)
    return () => el.removeEventListener('log-nav', handler)
  }, [onSelectFile])

  return (
    <FloatingPanel
      title="日志"
      icon={<FileText size={15} />}
      onClose={onClose}
      width={500}
      height={580}
      bottomOffset={80}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          gap: 8,
          borderBottom: '1px solid var(--color-border)'
        }}
      >
        <button
          onClick={() => void loadLog()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
            color: 'var(--color-text-primary)'
          }}
        >
          <RefreshCw size={11} /> 刷新
        </button>
        {lastRefresh && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary, #8e8e93)' }}>
            {lastRefresh}
          </span>
        )}
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
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-red)', fontSize: 13 }}>
          加载失败，请重试
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
          暂无日志记录
          <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'monospace' }}>vault/log.md</div>
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            fontFamily: 'var(--font-sans), -apple-system, sans-serif',
            fontSize: 12,
            lineHeight: 1.7,
            color: 'var(--color-text-primary)'
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </FloatingPanel>
  )
}
