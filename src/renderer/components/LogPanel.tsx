import { useState, useEffect, useRef, useMemo, memo, type JSX } from 'react'
import { FileText, RefreshCw, Shield } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'
import { AuditTab } from './AuditTab'

interface LogPanelProps {
  onClose: () => void
  onSelectFile?: (path: string) => void
  // 2026-07-09 backport: 允许从外部指定初始 tab (audit 通知点'查看'用)
  initialTab?: 'log' | 'audit'
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
        out.push('<ul style="margin:var(--space-1) 0;padding-left:var(--space-4)">')
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

export const LogPanel = memo(function LogPanel({ onClose, onSelectFile, initialTab }: LogPanelProps): JSX.Element {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // 2026-07-09 backport (from team ada72e9): 加 'audit' tab, 配合 post-commit 审计
  const [activeTab, setActiveTab] = useState<'log' | 'audit'>(initialTab ?? 'log')
  // 2026-07-09 backport: 审计 tab 要 vault 路径, loadLog 时缓存一次
  const [vaultPathInTab, setVaultPathInTab] = useState<string | null>(null)
  // 2026-07-07 (backport from team d3e9433): 删除 lastRefresh state (toolbar 删了不需要显示时间)
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef('')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadLog = async (isInitial = false) => {
    setLoadError(false)
    try {
      const vaultPath = await (window.api as any).getVaultPath?.()
      // 2026-07-09 backport: 缓存给 AuditTab 用 (避免 audit tab 启动时再拉一次)
      if (vaultPath) setVaultPathInTab(vaultPath)
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
      // 2026-07-07 (backport from team d3e9433): 删除 setLastRefresh (toolbar 删了不需要)
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
      title={activeTab === 'log' ? '日志' : '审计'}
      icon={activeTab === 'log' ? <FileText size={15} /> : <Shield size={15} />}
      onClose={onClose}
      width={500}
      height={580}
      bottomOffset={80}
      // 2026-07-07 (backport from team d3e9433): 刷新按钮挪到 title bar 关闭按钮左边
      headerActions={
        <button
          onClick={() => void loadLog()}
          disabled={loading}
          className={'floating-panel-action-btn' + (loading ? ' spinning' : '')}
          title={loading ? '加载中...' : '刷新日志'}
          aria-label="刷新日志"
        >
          <RefreshCw size={13} />
        </button>
      }
    >
      {/* 2026-07-09 backport: 双 tab 切换 (日志 / 审计) */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-hover, #f9f9fb)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setActiveTab('log')}
          style={{
            flex: 1, padding: '8px 12px', background: activeTab === 'log' ? 'var(--color-bg)' : 'transparent',
            border: 'none', borderBottom: activeTab === 'log' ? '2px solid var(--color-primary, #007aff)' : '2px solid transparent',
            color: activeTab === 'log' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12, fontWeight: activeTab === 'log' ? 600 : 400,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <FileText size={12} /> 日志
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            flex: 1, padding: '8px 12px', background: activeTab === 'audit' ? 'var(--color-bg)' : 'transparent',
            border: 'none', borderBottom: activeTab === 'audit' ? '2px solid var(--color-primary, #007aff)' : '2px solid transparent',
            color: activeTab === 'audit' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontSize: 12, fontWeight: activeTab === 'audit' ? 600 : 400,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Shield size={12} /> 审计
        </button>
      </div>

      {activeTab === 'audit' ? (
        <AuditTab vaultPath={vaultPathInTab} limit={50} onSelectFile={onSelectFile} />
      ) : loading ? (
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
            padding: 'var(--space-3) var(--space-4)',
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
})
