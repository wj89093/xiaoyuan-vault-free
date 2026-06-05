/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, memo, type JSX } from 'react'
import { Shield, RefreshCw, Activity } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface LintPanelProps {
  onClose: () => void
  vaultPath: string | null
}

interface ParsedLintReport {
  date: string
  health: string
  stats: {
    totalWikiFiles: number
    orphanPages: number
    deadLinks: number
    stalePages: number
    contradictions: number
  }
  orphanPages: string[]
  deadLinks: Array<{ from: string; target: string }>
  stalePages: string[]
}

export const LintPanel = memo(function LintPanel({ onClose, vaultPath }: LintPanelProps): JSX.Element {
  const [report, setReport] = useState<ParsedLintReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [runningCheck, setRunningCheck] = useState(false)
  const [healthCheckError, setHealthCheckError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [lastChecked, setLastChecked] = useState<string>('')
  const [refreshing, setRefreshing] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})

  async function runHealthCheck() {
    if (!vaultPath) return
    setHealthCheckError(false)
    setRunningCheck(true)
    try {
      const result = await (window.api as any).maintenance.run()
      if (result) {
        await loadLintReport()
      }
    } catch {
      setHealthCheckError(true)
    } finally {
      setRunningCheck(false)
    }
  }

  async function loadLintReport() {
    if (!vaultPath) return
    setLoadError(false)
    setLoading(true)
    try {
      const wikiDir = vaultPath.endsWith('/') ? vaultPath + '_wiki' : vaultPath + '/_wiki'
      const exists = await window.api.fileExists?.(wikiDir)
      if (!exists) {
        setReport(null)
        setLoading(false)
        return
      }

      const lintReports = await (window.api as any).getLintReports?.()
      if (lintReports && lintReports.length > 0) {
        const r = lintReports[0] as any
        setReport({
          date: r.date ?? '',
          health: r.health ?? '未知',
          stats: {
            totalWikiFiles: r.totalWikiFiles ?? r.totalFiles ?? 0,
            orphanPages: r.orphanPages?.length ?? 0,
            deadLinks: r.deadLinks?.length ?? 0,
            stalePages: r.stalePages?.length ?? 0,
            contradictions: r.contradictions?.length ?? 0
          },
          orphanPages: r.orphanPages ?? [],
          deadLinks: r.deadLinks ?? [],
          stalePages: r.stalePages ?? []
        })
      } else {
        setReport(null)
      }
      const now = new Date()
      setLastChecked(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLintReport()
    }, 0)
    return () => clearTimeout(timer)
  }, [vaultPath])

  const totalIssues = report
    ? report.stats.orphanPages + report.stats.deadLinks + report.stats.stalePages
    : 0

  return (
    <FloatingPanel
      title="代码检查"
      icon={<Shield size={15} />}
      onClose={onClose}
      width={480}
      height={580}
      bottomOffset={80}
    >
      {/* Sub-header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-3)',
          gap: 'var(--space-2)',borderBottom: '1px solid var(--color-border)'
        }}
      >
        <button
          onClick={() => {
            void runHealthCheck()
          }}
          disabled={runningCheck}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',fontSize: 11,
            padding: 'var(--space-1) var(--space-2)',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: runningCheck ? 'var(--color-surface-hover)' : 'var(--color-surface)',
            cursor: runningCheck ? 'not-allowed' : 'pointer',
            color: runningCheck ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            transition: 'var(--transition-base)'
          }}
        >
          <Activity size={11} /> {runningCheck ? '检查中...' : '健康检查'}
        </button>
        <button
          onClick={() => {
            setRefreshing(true)
            void loadLintReport().finally(() => setRefreshing(false))
          }}
          disabled={refreshing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',fontSize: 11,
            padding: 'var(--space-1) var(--space-2)',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: refreshing ? 'var(--color-surface-hover)' : 'var(--color-surface)',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            color: refreshing ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            transition: 'var(--transition-base)'
          }}
        >
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />{' '}
          {refreshing ? '刷新中...' : '刷新'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {report ? `${report.stats.totalWikiFiles} 个 wiki 页面` : '点击「健康检查」分析知识库'}
        </span>
        {lastChecked && (
          <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
            上次 {lastChecked}
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: totalIssues > 0 ? 'var(--color-red)' : 'var(--color-green)',
            marginLeft: 'auto'
          }}
        >
          {runningCheck
            ? '检查中...'
            : loading
              ? '加载中...'
              : report
                ? totalIssues > 0
                  ? `${totalIssues} 个问题`
                  : '状态良好'
                : '暂无报告'}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading || runningCheck ? (
          <div
            style={{
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
              textAlign: 'center',
              padding: 32
            }}
          >
            {runningCheck ? '检查中...' : '加载中...'}
          </div>
        ) : healthCheckError ? (
          <div
            style={{ color: 'var(--color-red)', fontSize: 13, textAlign: 'center', padding: 32 }}
          >
            检查失败，请重试
          </div>
        ) : loadError ? (
          <div
            style={{ color: 'var(--color-red)', fontSize: 13, textAlign: 'center', padding: 32 }}
          >
            加载失败，请重试
          </div>
        ) : !report ? (
          <div
            style={{
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
              textAlign: 'center',
              padding: 32
            }}
          >
            暂无 Lint 报告，请通过 Agent 运行「triggerLint」生成报告
          </div>
        ) : totalIssues === 0 ? (
          <div
            style={{ textAlign: 'center', padding: 32, color: 'var(--color-green)', fontSize: 13 }}
          >
            ✓ 知识库状态良好
          </div>
        ) : (
          <>
            {/* Dead Links */}
            {report.stats.deadLinks > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-orange)',
                    padding: 'var(--space-2) var(--space-3) var(--space-2)',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={!!expandedCats['deadLinks']}
                  data-lint-category="deadLinks"
                  onClick={() => setExpandedCats((c) => ({ ...c, deadLinks: !c['deadLinks'] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      setExpandedCats((c) => ({ ...c, deadLinks: !c['deadLinks'] }))
                  }}
                >
                  死链 {report.stats.deadLinks} 个
                </div>
                {report.deadLinks.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: 12
                    }}
                  >
                    <div
                      style={{
                        color: 'var(--color-text-primary)',
                        fontWeight: 500,
                        marginBottom: 2
                      }}
                    >
                      {d.from} → <span style={{ color: 'var(--color-red)' }}>{d.target}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Orphan Pages */}
            {report.stats.orphanPages > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-text-tertiary)',
                    padding: 'var(--space-2) var(--space-3) var(--space-2)',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={!!expandedCats['orphanPages']}
                  data-lint-category="orphanPages"
                  onClick={() => setExpandedCats((c) => ({ ...c, orphanPages: !c['orphanPages'] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      setExpandedCats((c) => ({ ...c, orphanPages: !c['orphanPages'] }))
                  }}
                >
                  孤儿页面 {report.stats.orphanPages} 个
                </div>
                {report.orphanPages.map((o, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: 12
                    }}
                  >
                    <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{o}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Stale Pages */}
            {report.stats.stalePages > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--color-gray)',
                    padding: 'var(--space-2) var(--space-3) var(--space-2)',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  tabIndex={0}
                  role="button"
                  aria-expanded={!!expandedCats['stalePages']}
                  data-lint-category="stalePages"
                  onClick={() => setExpandedCats((c) => ({ ...c, stalePages: !c['stalePages'] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      setExpandedCats((c) => ({ ...c, stalePages: !c['stalePages'] }))
                  }}
                >
                  过期页面 {report.stats.stalePages} 个
                </div>
                {report.stalePages.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: 12
                    }}
                  >
                    <div style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{s}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </FloatingPanel>
  )
})
