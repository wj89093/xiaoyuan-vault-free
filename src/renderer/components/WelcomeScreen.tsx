import { useState, useEffect, type JSX } from 'react'
import {
  Library,
  FolderPlus,
  FolderOpen,
  Sparkles,
  FileText,
  Upload,
  Check,
  Clock,
  Trash2,
  Layers,
  Bot,
  ArrowDownToLine,
  Copy,
  Download
} from 'lucide-react'

export interface VaultItem {
  path: string
  name: string
  lastOpened: number
}

interface WelcomeScreenProps {
  onOpenVault: () => void
  onNewVault: () => void
  showOnboarding?: boolean
  onCompleteOnboarding?: () => void
  recentVaults?: string[]
  onOpenRecent?: (path: string) => void
  /** 通过晓园创建的知识库列表 */
  vaults?: VaultItem[]
  onOpenVaultItem?: (path: string) => void
  onDeleteVault?: (path: string) => void
}

export function WelcomeScreen({
  onOpenVault: _onOpenVault,
  onNewVault,
  showOnboarding,
  onCompleteOnboarding,
  recentVaults: _recentVaults,
  onOpenRecent: _onOpenRecent,
  vaults = [],
  onOpenVaultItem,
  onDeleteVault
}: WelcomeScreenProps): JSX.Element {
  const [mounted, setMounted] = useState(false)
  const [skillCopied, setSkillCopied] = useState(false)
  const lastVault = vaults[0]
  // P2-3: document count per vault
  const [docCounts, setDocCounts] = useState<Record<string, number>>({})

  // v1.5: 拆 2 个 useEffect — mount 动画 vs 异步取数据 各司其职
  // Effect 1: mount 动画 (mount 时设 mounted=true, 仅跑一次)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 16)
    return () => clearTimeout(t)
  }, [])

  // Effect 2: 拉每个 vault 的 doc 数 (vaults 变时跑)
  useEffect(() => {
    if (vaults.length === 0) return
    let cancelled = false
    void (async () => {
      const counts: Record<string, number> = {}
      for (const vault of vaults) {
        try {
          const files = await window.api.listFiles?.()
          if (cancelled) return
          if (files) {
            const count = files.filter((f: { path: string }) =>
              f.path.startsWith(vault.path + '/')
            ).length
            counts[vault.path] = count
          }
        } catch {
          if (cancelled) return
          counts[vault.path] = 0
        }
      }
      if (!cancelled) setDocCounts(counts)
    })()
    return () => { cancelled = true }
  }, [vaults])

  if (showOnboarding) {
    const handleCopySkill = async () => {
      try {
        const content = (await window.api.skillLoadDefault?.()) || ''
        await navigator.clipboard.writeText(content)
        setSkillCopied(true)
        setTimeout(() => setSkillCopied(false), 2000)
      } catch {
        // fallback
      }
    }

    const handleDownloadSkill = async () => {
      try {
        const content = (await window.api.skillLoadDefault?.()) || ''
        const blob = new Blob([content], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'xiaoyuan-vault-skill.md'
        a.click()
        URL.revokeObjectURL(url)
      } catch {
        // ignore
      }
    }

    return (
      <div
        className="welcome-screen"
        style={{
          opacity: mounted ? 1 : 0,
          transition: 'opacity 300ms ease'
        }}
      >
        <div className="onboarding-card">
          <div className="onboarding-header">
            <Sparkles size={36} strokeWidth={1.5} />
            <h2>知识库已就绪！</h2>
            <p className="onboarding-subtitle">
              复制 Skill.md 发给你的 Agent，让 AI 帮你管理这个知识库
            </p>
          </div>

          {/* Interactive guide steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '8px 0 20px' }}>
            {[
              {
                icon: <Layers size={18} strokeWidth={1.5} color="var(--color-primary)" />,
                title: '三层架构',
                desc: '来源(原始文件) → 知识(AI整理) → 规范(协作约定)',
                tag: '已就绪',
                color: 'var(--color-green)'
              },
              {
                icon: <Bot size={18} strokeWidth={1.5} color="var(--color-purple)" />,
                title: '接入你的 AI',
                desc: '支持 OpenClaw / Claude Code / Ollama / 自建 LLM — 拷一份 Skill.md 给它当系统提示词',
                tag: '下一步',
                color: 'var(--color-blue)'
              },
              {
                icon: <ArrowDownToLine size={18} strokeWidth={1.5} color="var(--color-accent)" />,
                title: '导入第一批文件',
                desc: '把文件拖到窗口 · 粘贴链接 · 或从系统选择文件夹 — AI 会自动整理',
                tag: '之后',
                color: 'var(--color-purple)'
              }
            ].map((step, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'var(--color-surface-hover)',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {step.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{step.title}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: step.color + '18',
                        color: step.color,
                        fontWeight: 600
                      }}
                    >
                      {step.tag}
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}
                  >
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Skill.md 复制 / 下载 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleCopySkill}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {skillCopied ? (
                <>
                  <Check size={18} /> 已复制
                </>
              ) : (
                <>
                  <Copy size={18} /> 复制 Skill.md
                </>
              )}
            </button>
            <button
              className="btn btn-ghost btn-lg"
              onClick={handleDownloadSkill}
              title="下载到本地"
            >
              <Download size={18} />
            </button>
          </div>
          <button
            onClick={onCompleteOnboarding}
            style={{
              width: '100%',
              padding: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-tertiary)',
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            稍后再说，直接进入
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="welcome-screen"
      style={{
        opacity: mounted ? 1 : 0,
        transition: 'opacity 300ms ease'
      }}
    >
      <Library className="welcome-icon" size={48} strokeWidth={1.5} />

      <div className="welcome-hero">
        <h1 className="welcome-title">晓园 Vault</h1>
        <p className="welcome-tagline">
          AI 原生知识库 —— 策展来源，AI 整理。Wiki 持续增长，不会过时。
        </p>
      </div>

      <div className="welcome-features">
        <div className="welcome-feature">
          <Upload size={16} />
          <span>拖入文件 · 粘贴链接</span>
        </div>
        <div className="welcome-feature">
          <Sparkles size={16} />
          <span>AI 自动分类 · 标签 · 摘要</span>
        </div>
        <div className="welcome-feature">
          <FileText size={16} />
          <span>双层页面 · 知识可追溯</span>
        </div>
      </div>

      <div className="welcome-actions">
        <button
          className="btn btn-primary btn-lg"
          onClick={() => {
            void onNewVault()
          }}
        >
          <FolderPlus size={18} />
          创建新知识库
        </button>
      </div>

      {/* 最近使用 */}
      {lastVault && (
        <div className="welcome-recent" style={{ marginTop: 16 }}>
          <div className="welcome-recent-title">最近使用</div>
          <div role="list">
            <div role="listitem">
              <button
                className="welcome-recent-item"
                onClick={() => onOpenVaultItem?.(lastVault.path)}
              >
                <Clock size={14} />
                <span style={{ fontWeight: 600 }}>{lastVault.name}</span>
                <span className="welcome-recent-path">{lastVault.path}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 知识库列表 */}
      {vaults.length > 0 && (
        <div className="welcome-recent" style={{ marginTop: 12 }}>
          <div className="welcome-recent-title" aria-live="polite">
            知识库列表
          </div>
          <div role="list" aria-live="polite">
            {vaults.map((vault, index) => {
              const ago = vault.lastOpened
                ? (() => {
                    const diff = Date.now() - vault.lastOpened
                    if (diff < 60000) return '刚刚'
                    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
                    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
                    return `${Math.floor(diff / 86400000)} 天前`
                  })()
                : null
              const docCount = docCounts[vault.path]
              return (
                <div
                  key={vault.path}
                  role="listitem"
                  className={`welcome-recent-item ${vault.path === lastVault?.path ? 'is-active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                    transition: `opacity 300ms ease ${index * 60}ms, transform 300ms ease ${index * 60}ms`
                  }}
                >
                  <span className="welcome-recent-index">{index + 1}</span>
                  <FolderOpen size={14} style={{ flexShrink: 0 }} />
                  <button
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '4px 8px',
                      borderRadius: 6,
                      overflow: 'hidden'
                    }}
                    onClick={() => onOpenVaultItem?.(vault.path)}
                    title={vault.path}
                  >
                    <span style={{ fontWeight: vault.path === lastVault?.path ? 600 : 400 }}>
                      {vault.name}
                    </span>
                    <span className="welcome-recent-path">{vault.path}</span>
                  </button>
                  {/* P2-2: last-opened timestamp */}
                  {ago && <span className="welcome-recent-time">{ago}</span>}
                  {/* P2-3: document count estimate */}
                  {docCount !== undefined && docCount > 0 && (
                    <span className="welcome-recent-count">{docCount} 篇</span>
                  )}
                  <button
                    className="welcome-recent-delete"
                    onClick={() => onDeleteVault?.(vault.path)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onDeleteVault?.(vault.path)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-red)',
                      padding: 4,
                      flexShrink: 0
                    }}
                    title="从列表移除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {vaults.length === 0 && (
        <div
          style={{
            marginTop: 20,
            color: 'var(--color-text-tertiary)',
            fontSize: 12,
            textAlign: 'center'
          }}
        >
          还没有知识库，创建一个开始使用
        </div>
      )}
    </div>
  )
}
