 

import { useState, useEffect } from 'react'
import { LogIn, LogOut, User, Settings, Loader2, FileText, Sun, Moon, Monitor, Plug, Copy, Check, X } from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface SettingsPanelProps {
  onClose: () => void
  vaultPath: string | null
  onSelectFile: (path: string) => void
}

export function SettingsPanel({ onClose, vaultPath, onSelectFile }: SettingsPanelProps): JSX.Element {
  const [email, setEmail] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginHint, setLoginHint] = useState<string>('')
  const [debugEmail, setDebugEmail] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [themeLoading, setThemeLoading] = useState(false)
  const [isPro, setIsPro] = useState(true)  // default true to avoid hiding in initial render
  const [isProReady, setIsProReady] = useState(false)  // first buildInfo call done

  // ── Skill.md 模态状态 ──
  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [skillContent, setSkillContent] = useState('')
  const [copied, setCopied] = useState(false)

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
        const [e, t] = await Promise.all([
          window.api.authGetEmail?.(),
          window.api.authGetToken?.(),
        ])
        setEmail(e)
        setToken(t)
      } catch { /* ignore */ }
      // Load saved theme
      try {
        const savedTheme = await window.api.settingsGetTheme?.()
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setTheme(savedTheme)
        }
      } catch { /* ignore */ }
    })()

    const unsub = (window.api as any).onAuthTokenReceived?.((data: { token: string; email: string }) => {
      setToken(data.token)
      setEmail(data.email)
      setLoginHint('登录成功')
      setTimeout(() => setLoginHint(''), 3000)
    })

    // Load build info (Pro / Open-source)
    void (window.api.getBuildInfo?.() as Promise<{ isPro: boolean }> | undefined)
      ?.then(info => { setIsPro(info.isPro); setIsProReady(true) })
      .catch(() => setIsProReady(true))

    return () => { unsub?.() }
  }, [])

  // 打开 Skill.md 模态：加载默认内容
  const openSkillModal = async () => {
    try {
      const content = await window.api.skillLoadDefault?.() || ''
      setSkillContent(content)
    } catch {
      setSkillContent('')
    }
    setSkillModalOpen(true)
    setCopied(false)
  }

  const copySkill = async () => {
    try {
      await navigator.clipboard.writeText(skillContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 复制失败不提示，避免干扰 UX
    }
  }

  const handleLogin = async () => {
    setLoading(true)
    try {
      await window.api.authOpenLogin?.()
    } catch (err) {
      setLoginHint('打开发登录页失败：' + (err instanceof Error ? err.message : String(err)))
    }
    setLoading(false)
  }

  const handleDebugLogin = async () => {
    if (!debugEmail || !debugCode) {
      setLoginHint('请输入邮箱和验证码')
      return
    }
    setLoading(true)
    setLoginHint('')
    try {
      const result = await (window.api as any).authDebugLogin?.(debugEmail, debugCode)
      setToken('debug-token')
      setEmail(result?.email ?? debugEmail)
      setLoginOpen(false)
      setLoginHint('登录成功')
      setTimeout(() => setLoginHint(''), 3000)
    } catch (err) {
      setLoginHint('登录失败：' + (err instanceof Error ? err.message : String(err)))
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    if (!confirm('确认退出登录？')) return
    await window.api.authClear?.()
    setToken(null)
    setEmail(null)
  }

  // 自动保存由 updatePlugin 负责（800ms debounce）

  return (
    <FloatingPanel
      title="设置"
      icon={<Settings size={15} />}
      onClose={onClose}
      width={400}
      height={420}
      bottomOffset={80}
    >
        <div className="settings-body">
          {/* ── Appearance Section ── */}
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
              <div className="theme-toggle-group" style={{ display: 'flex', gap: 4 }}>
                <button
                  className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => applyTheme('light')}
                  disabled={themeLoading}
                  title="浅色模式"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
                >
                  <Sun size={13} /> 浅色
                </button>
                <button
                  className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => applyTheme('dark')}
                  disabled={themeLoading}
                  title="深色模式"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
                >
                  <Moon size={13} /> 深色
                </button>
                <button
                  className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => applyTheme('system')}
                  disabled={themeLoading}
                  title="跟随系统"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px' }}
                >
                  <Monitor size={13} /> 自动
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">
              <User size={14} />
              晓园账户
            </div>
            {token ? (
              <div className="settings-row">
                <div className="settings-row-label">
                  <span>已登录</span>
                  <span className="settings-row-desc" style={{ color: 'var(--color-accent)' }}>
                    {email ? email.split('@')[0] : '账户'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      await window.api.authClear?.()
                      setToken(null)
                      setEmail(null)
                      setLoginOpen(true)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                  >
                    <User size={12} /> 切换
                  </button>
                  <button className="btn btn-ghost" onClick={() => { void handleLogout() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <LogOut size={12} /> 退出
                  </button>
                </div>
              </div>
            ) : (
              <div className="settings-row" style={{ position: 'relative' }}>
                <div className="settings-row-label">
                  <span>未登录</span>
                  <span className="settings-row-desc">登录后可使用 AI 功能</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setLoginOpen(!loginOpen)}
                    style={{ fontSize: 12, padding: '4px 12px' }}
                  >
                    <User size={13} /> 注册
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => setLoginOpen(!loginOpen)}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 12px' }}
                  >
                    <LogIn size={13} /> 登录
                  </button>
                </div>
                {loginOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 8,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)', borderRadius: 10,
                    padding: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    zIndex: 100, minWidth: 260,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>邮箱登录</div>
                    <input
                      type="email" placeholder="邮箱地址"
                      value={debugEmail}
                      onChange={e => setDebugEmail(e.target.value)}
                      autoFocus
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text)', fontSize: 12, marginBottom: 8 }}
                    />
                    <input
                      type="text" placeholder="验证码 (调试: 123456)"
                      value={debugCode}
                      onChange={e => setDebugCode(e.target.value)}
                      maxLength={6}
                      onKeyDown={e => { if (e.key === 'Enter') void handleDebugLogin() }}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text)', fontSize: 12, marginBottom: 10 }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => { void handleDebugLogin() }}
                      disabled={loading}
                      style={{ width: '100%', fontSize: 13 }}
                    >
                      {loading ? <Loader2 size={13} className="animate-spin" /> : '登录'}
                    </button>
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                      <span style={{ cursor: 'pointer', color: 'var(--color-accent)', textDecoration: 'underline' }} onClick={() => { void handleLogin() }}>浏览器登录</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {loginHint && (
              <div role="status" aria-live="polite" style={{ color: 'var(--color-accent)', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                {loginHint}
              </div>
            )}
          </div>

          {/* ── Skill.md (Pro only) ── */}
          {isPro && isProReady && (
            <div className="settings-section">
              <div className="settings-section-title">
                <Plug size={14} />
                Skill.md
              </div>
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  发送给 Agent 的系统提示词。点查看后复制给你的 Agent（OpenClaw / Claude Code / 任何兼容服务）。
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={openSkillModal}
                  style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <FileText size={12} /> 查看 Skill.md
                </button>
              </div>
            </div>
          )}

          {/* ── Skill.md 模态 ── */}
          {skillModalOpen && (
            <div
              role="dialog"
              onClick={() => setSkillModalOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999,
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  width: '90%', maxWidth: 700, maxHeight: '80vh',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* 标题栏 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <FileText size={14} /> Skill.md（发给 Agent 的提示词）
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={copySkill}
                      style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {copied ? <><Check size={12} /> 已复制</> : <><Copy size={12} /> 复制</>}
                    </button>
                    <button
                      onClick={() => setSkillModalOpen(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                {/* 内容 */}
                <pre style={{
                  flex: 1, margin: 0, padding: 16,
                  overflow: 'auto',
                  fontSize: 12, fontFamily: 'monospace',
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>{skillContent || '加载中...'}</pre>
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                  提示：复制后发给你的 Agent（OpenClaw / Claude Code / 任何兼容服务）作为系统提示词。
                </div>
              </div>
            </div>
          )}
        </div>
    </FloatingPanel>
  )
}
