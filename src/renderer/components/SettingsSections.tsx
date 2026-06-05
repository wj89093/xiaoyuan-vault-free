/**
 * SettingsSections — 把 SettingsPanel 拆成独立子组件
 *
 * P1-2026-06-02 (backport from Pro 仓): 拆 15 useState → 3 个子组件
 * - ThemeSection: 2 useState (theme, themeLoading)
 * - AuthSection: 7 useState (email, token, loading, loginHint, debugEmail, debugCode, loginOpen)
 * - SkillSection: 6 useState (skillContent, copied, userSkills, currentSkillName, skillStatus, refreshTrigger)
 *
 * Free 仓特殊:不含 EndpointSection(Pro 专用),SkillSection 不依赖 endpointEnabled。
 *
 * 关键设计:每个子组件独立 useState + useEffect,父 SettingsPanel 只管顶层 wrapper。
 * 减少 re-render 半径,避免 15 useState 单体组件。
 */
import { useState, useEffect, memo, type JSX } from 'react'
import { Sun, Moon, Monitor, Plug, Copy, Check, FileText } from 'lucide-react'

// ─── ThemeSection ─────────────────────────────────────────────────────

export const ThemeSection = memo(function ThemeSection(): JSX.Element {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [themeLoading, setThemeLoading] = useState(false)

  const applyTheme = (t: 'light' | 'dark' | 'system') => {
    setThemeLoading(true)
    const doApply = () => {
      if (t === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
      } else {
        document.documentElement.setAttribute('data-theme', t)
      }
      setTheme(t)
      setThemeLoading(false)
    }
    const persist = window.api?.settingsSetTheme
    if (persist) {
      persist(t).then(() => doApply()).catch(() => doApply())
    } else {
      doApply()
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const savedTheme = await window.api.settingsGetTheme?.()
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setTheme(savedTheme)
        }
      } catch { /* ignore */ }
    })()
  }, [])

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Monitor size={14} />
        外观
      </div>
      <div className="settings-row">
        <div className="settings-row-label">
          <span>主题模式</span>
          <span className="settings-row-desc">
            {theme === 'light' ? '浅色模式' : theme === 'dark' ? '深色模式' : '跟随系统'}
          </span>
        </div>
        <div className="theme-toggle-group" style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <button
            className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => applyTheme('light')}
            disabled={themeLoading}
            title="浅色模式"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)',fontSize: 12, padding: 'var(--space-1) var(--space-2)' }}
          >
            <Sun size={13} /> 浅色
          </button>
          <button
            className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => applyTheme('dark')}
            disabled={themeLoading}
            title="深色模式"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)',fontSize: 12, padding: 'var(--space-1) var(--space-2)' }}
          >
            <Moon size={13} /> 深色
          </button>
          <button
            className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => applyTheme('system')}
            disabled={themeLoading}
            title="跟随系统"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)',fontSize: 12, padding: 'var(--space-1) var(--space-2)' }}
          >
            <Monitor size={13} /> 自动
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── SkillSection ─────────────────────────────────────────────────────
//
// Free 仓: 简化版 — 复制 + 打开 Skill.md

export const SkillSection = memo(function SkillSection({ vaultPath, onOpenFile }: { vaultPath?: string | null; onOpenFile?: (path: string) => void }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      const content = (await window.api.skillLoadDefault?.()) || ''
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleOpen = async () => {
    if (!vaultPath || !onOpenFile) return
    try {
      const files: Array<{ path: string; isDirectory?: boolean }> = (await window.api.listFiles?.()) ?? []
      const target = files.find((f) => !f.isDirectory && (f.path === 'AGENTS.md' || f.path === 'Skill.md'))
      if (target) {
        onOpenFile(vaultPath + '/' + target.path)
      } else {
        // vault 里没有，从 templates 复制过来
        const content = (await window.api.skillLoadDefault?.()) || ''
        if (content) {
          await window.api.writeFile?.(vaultPath + '/AGENTS.md', content)
          onOpenFile(vaultPath + '/AGENTS.md')
        }
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Plug size={14} />
        Skill.md
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
        Agent 工作流规范，复制给你的 AI 助手使用。
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button className="btn btn-primary" onClick={() => void handleCopy()} style={{ flex: 1, fontSize: 12 }}>
          {copied ? <><Check size={14} /> 已复制</> : <><Copy size={14} /> 复制</>}
        </button>
        <button className="btn btn-ghost" onClick={handleOpen} style={{ flex: 1, fontSize: 12 }}>
          <FileText size={14} /> 打开
        </button>
      </div>
    </div>
  )
})

