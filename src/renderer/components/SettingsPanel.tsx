import { useState, useEffect } from 'react'
import {
  LogIn,
  LogOut,
  User,
  Settings,
  Loader2,
  Sun,
  Moon,
  Monitor,
  Plug,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Save,
  Power,
  Wifi
} from 'lucide-react'
import { FloatingPanel } from './FloatingPanel'

interface SettingsPanelProps {
  onClose: () => void
  _vaultPath: string | null
  _onSelectFile: (path: string) => void
}

export function SettingsPanel({
  onClose,
  _vaultPath,
  _onSelectFile
}: SettingsPanelProps): JSX.Element {
  const [email, setEmail] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginHint, setLoginHint] = useState<string>('')
  const [debugEmail, setDebugEmail] = useState('')
  const [debugCode, setDebugCode] = useState('')
  const [loginOpen, setLoginOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [themeLoading, setThemeLoading] = useState(false)

  // ── Skill 插件全功能状态 ──
  const [skillContent, setSkillContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [skillTemplates, setSkillTemplates] = useState<
    Array<{ name: string; description: string; filename: string }>
  >([])
  const [userSkills, setUserSkills] = useState<Array<{ name: string; path: string }>>([])
  const [currentSkillName, setCurrentSkillName] = useState<string>('') // '' = 新建/未选
  const [skillStatus, setSkillStatus] = useState<{ msg: string; kind: 'info' | 'ok' | 'err' }>({
    msg: '',
    kind: 'info'
  })
  const [endpointUrl, setEndpointUrl] = useState('http://127.0.0.1:18789')
  const [endpointProtocol, setEndpointProtocol] = useState<'http' | 'ws' | 'skill'>('http')
  const [endpointNote, setEndpointNote] = useState('')
  const [endpointTestStatus, setEndpointTestStatus] = useState<{
    msg: string
    kind: 'info' | 'ok' | 'err'
  }>({ msg: '', kind: 'info' })
  const [endpointTesting, setEndpointTesting] = useState(false)
  const [endpointEnabled, setEndpointEnabled] = useState(true)

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
      persist(t)
        .then(() => doApply())
        .catch(() => doApply())
    } else {
      doApply()
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const [e, t] = await Promise.all([window.api.authGetEmail?.(), window.api.authGetToken?.()])
        setEmail(e)
        setToken(t)
      } catch {
        /* ignore */
      }
      // Load saved theme
      try {
        const savedTheme = await window.api.settingsGetTheme?.()
        if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
          setTheme(savedTheme)
        }
      } catch {
        /* ignore */
      }
    })()

    const unsub = (window.api as any).onAuthTokenReceived?.(
      (data: { token: string; email: string }) => {
        setToken(data.token)
        setEmail(data.email)
        setLoginHint('登录成功')
        setTimeout(() => setLoginHint(''), 3000)
      }
    )

    // Load Skill data
    void refreshSkillData()

    return () => {
      unsub?.()
    }
  }, [])

  async function refreshSkillData(): Promise<void> {
    try {
      const [templates, users, endpoint] = await Promise.all([
        window.api.skillListTemplates?.() ?? [],
        window.api.skillList?.() ?? [],
        window.api.skillGetEndpoint?.()
      ])
      setSkillTemplates(templates)
      setUserSkills(users)
      if (endpoint) {
        setEndpointUrl(endpoint.url)
        setEndpointProtocol(endpoint.protocol)
        setEndpointNote(endpoint.note ?? '')
      }
    } catch (e) {
      console.error('[Settings] refreshSkillData failed:', e)
    }
  }

  // 打开 Skill.md 模态:加载默认内容 (已废弃 - 现在直接在设置面板里编辑)
  // const openSkillModal = async () => {
  //   const content = await window.api.skillLoadDefault?.() || ''
  //   setSkillContent(content)
  //   setSkillModalOpen(true)
  //   setCopied(false)
  // }

  // const copySkill = async () => {
  //   try {
  //     await navigator.clipboard.writeText(skillContent)
  //     setCopied(true)
  //     setTimeout(() => setCopied(false), 1500)
  //   } catch { /* ignore */ }
  // }

  const handleLogin = async () => {
    setLoading(true)
    try {
      await window.api.authOpenLogin?.()
    } catch (err) {
      setLoginHint('打开发登录页失败:' + (err instanceof Error ? err.message : String(err)))
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
      setLoginHint('登录失败:' + (err instanceof Error ? err.message : String(err)))
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    if (!confirm('确认退出登录?')) return
    await window.api.authClear?.()
    setToken(null)
    setEmail(null)
  }

  // 自动保存由 updatePlugin 负责(800ms debounce)

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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  padding: '4px 8px'
                }}
              >
                <Sun size={13} /> 浅色
              </button>
              <button
                className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => applyTheme('dark')}
                disabled={themeLoading}
                title="深色模式"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  padding: '4px 8px'
                }}
              >
                <Moon size={13} /> 深色
              </button>
              <button
                className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => applyTheme('system')}
                disabled={themeLoading}
                title="跟随系统"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  padding: '4px 8px'
                }}
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
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    void handleLogout()
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                >
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    padding: '4px 12px'
                  }}
                >
                  <LogIn size={13} /> 登录
                </button>
              </div>
              {loginOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: 14,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    zIndex: 100,
                    minWidth: 260
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>邮箱登录</div>
                  <input
                    type="email"
                    placeholder="邮箱地址"
                    value={debugEmail}
                    onChange={(e) => setDebugEmail(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text)',
                      fontSize: 12,
                      marginBottom: 8
                    }}
                  />
                  <input
                    type="text"
                    placeholder="验证码 (调试: 123456)"
                    value={debugCode}
                    onChange={(e) => setDebugCode(e.target.value)}
                    maxLength={6}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleDebugLogin()
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text)',
                      fontSize: 12,
                      marginBottom: 10
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      void handleDebugLogin()
                    }}
                    disabled={loading}
                    style={{ width: '100%', fontSize: 13 }}
                  >
                    {loading ? <Loader2 size={13} className="animate-spin" /> : '登录'}
                  </button>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center'
                    }}
                  >
                    <span
                      style={{
                        cursor: 'pointer',
                        color: 'var(--color-accent)',
                        textDecoration: 'underline'
                      }}
                      onClick={() => {
                        void handleLogin()
                      }}
                    >
                      浏览器登录
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          {loginHint && (
            <div
              role="status"
              aria-live="polite"
              style={{
                color: 'var(--color-accent)',
                fontSize: 12,
                marginTop: 4,
                textAlign: 'center'
              }}
            >
              {loginHint}
            </div>
          )}
        </div>

        {/* ── Skill.md 插件(开源版核心入口) ── */}
        <div className="settings-section">
          <div className="settings-section-title">
            <Plug size={14} />
            Skill.md
            <button
              className="btn btn-ghost"
              onClick={() => setEndpointEnabled(!endpointEnabled)}
              title={endpointEnabled ? '已启用' : '已停用'}
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                padding: '2px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Power size={11} /> {endpointEnabled ? '已启用' : '已停用'}
            </button>
          </div>

          {/* ── Endpoint 配置 ── */}
          <div
            className="settings-row"
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
          >
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              你的 Agent 服务的访问地址。OpenClaw 默认{' '}
              <code
                style={{
                  background: 'var(--color-bg-secondary)',
                  padding: '1px 4px',
                  borderRadius: 3
                }}
              >
                http://127.0.0.1:18789
              </code>
              。
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="http://127.0.0.1:18789"
                disabled={!endpointEnabled}
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)'
                }}
              />
              <select
                value={endpointProtocol}
                onChange={(e) => setEndpointProtocol(e.target.value as 'http' | 'ws' | 'skill')}
                disabled={!endpointEnabled}
                title="协议（当前仅 HTTP 可用）"
                style={{
                  fontSize: 12,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)'
                }}
              >
                <option value="http">HTTP</option>
                <option value="ws" disabled>
                  WebSocket (TODO)
                </option>
                <option value="skill" disabled>
                  Skill 协议 (TODO)
                </option>
              </select>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  setEndpointTesting(true)
                  setEndpointTestStatus({ msg: '测试中...', kind: 'info' })
                  try {
                    const ok = await window.api.skillSetEndpoint?.({
                      url: endpointUrl,
                      protocol: endpointProtocol,
                      note: endpointNote
                    })
                    if (ok) {
                      setEndpointTestStatus({ msg: '已保存 · 可在 Agent 端检查连通性', kind: 'ok' })
                    } else {
                      setEndpointTestStatus({ msg: '保存失败', kind: 'err' })
                    }
                  } catch (e) {
                    setEndpointTestStatus({
                      msg: '错误:' + (e instanceof Error ? e.message : String(e)),
                      kind: 'err'
                    })
                  }
                  setEndpointTesting(false)
                }}
                disabled={!endpointEnabled || endpointTesting || endpointSaving}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="保存 endpoint 配置"
              >
                <Save size={12} /> 保存
              </button>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  // URL 校验：防止路径拼接导致意外主机 / 协议
                  let parsed: URL
                  try {
                    parsed = new URL(endpointUrl)
                  } catch {
                    setEndpointTestStatus({ msg: 'URL 格式不合法', kind: 'err' })
                    return
                  }
                  if (
                    parsed.protocol !== 'http:' &&
                    parsed.protocol !== 'https:' &&
                    parsed.protocol !== 'ws:' &&
                    parsed.protocol !== 'wss:'
                  ) {
                    setEndpointTestStatus({ msg: '协议必须是 http(s) 或 ws(s)', kind: 'err' })
                    return
                  }
                  if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
                    setEndpointTestStatus({
                      msg: 'WebSocket 协议尚未实现，请先用 http://',
                      kind: 'err'
                    })
                    return
                  }
                  const isLocal =
                    parsed.hostname === 'localhost' ||
                    parsed.hostname === '127.0.0.1' ||
                    parsed.hostname === '::1'
                  if (!isLocal && !confirm(`连接到外部 host "${parsed.hostname}"?`)) return

                  setEndpointTesting(true)
                  setEndpointTestStatus({ msg: '连接中...', kind: 'info' })
                  try {
                    const resp = await fetch(parsed.origin + '/agent/run', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ system: 'ping', user_message: 'ping' }),
                      signal: AbortSignal.timeout(5000)
                    })
                    if (resp.ok || resp.status === 400 || resp.status === 422) {
                      setEndpointTestStatus({ msg: `可连通 · HTTP ${resp.status}`, kind: 'ok' })
                    } else {
                      setEndpointTestStatus({ msg: `HTTP ${resp.status}`, kind: 'err' })
                    }
                  } catch (e) {
                    setEndpointTestStatus({
                      msg: '连接失败：' + (e instanceof Error ? e.message : String(e)),
                      kind: 'err'
                    })
                  }
                  setEndpointTesting(false)
                }}
                disabled={!endpointEnabled || endpointTesting}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="测试连接"
              >
                <Wifi size={12} /> 测试
              </button>
            </div>
            {endpointTestStatus.msg && (
              <div
                style={{
                  fontSize: 11,
                  color:
                    endpointTestStatus.kind === 'ok'
                      ? 'var(--color-accent)'
                      : endpointTestStatus.kind === 'err'
                        ? 'var(--color-error, #c44)'
                        : 'var(--color-text-tertiary)'
                }}
              >
                {endpointTestStatus.msg}
              </div>
            )}
          </div>

          {/* ── Skill 列表 ── */}
          <div
            className="settings-row"
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginTop: 4 }}
          >
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              选一个 Skill 发给 Agent:预设 8 个常用场景,或点 + 新建自己的。
            </div>

            {/* 预设模板 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {skillTemplates.map((t) => (
                <button
                  key={t.name}
                  className={`btn ${currentSkillName === t.name ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={async () => {
                    try {
                      const content = (await window.api.skillLoadTemplate?.(t.name)) ?? ''
                      setSkillContent(content)
                      setCurrentSkillName(t.name)
                      setSkillStatus({ msg: `已加载预设:${t.name}`, kind: 'ok' })
                    } catch (e) {
                      setSkillStatus({
                        msg: '加载失败:' + (e instanceof Error ? e.message : String(e)),
                        kind: 'err'
                      })
                    }
                  }}
                  disabled={!endpointEnabled}
                  title={t.description}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* 用户自定义列表 */}
            {userSkills.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  marginTop: 4,
                  padding: '6px 8px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 6
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'uppercase'
                  }}
                >
                  我的 Skill
                </div>
                {userSkills.map((s) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, fontSize: 12 }}>{s.name}.md</span>
                    <button
                      className="btn btn-ghost"
                      onClick={async () => {
                        const content = (await window.api.skillRead?.(s.name)) ?? ''
                        setSkillContent(content)
                        setCurrentSkillName(s.name)
                        setSkillStatus({ msg: `已加载:${s.name}`, kind: 'ok' })
                      }}
                      disabled={!endpointEnabled}
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      title="编辑"
                    >
                      编辑
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={async () => {
                        if (!confirm(`删除 Skill "${s.name}"?`)) return
                        await window.api.skillDelete?.(s.name)
                        await refreshSkillData()
                        if (currentSkillName === s.name) {
                          setCurrentSkillName('')
                          setSkillContent('')
                        }
                        setSkillStatus({ msg: `已删除:${s.name}`, kind: 'ok' })
                      }}
                      disabled={!endpointEnabled}
                      style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        color: 'var(--color-error, #c44)'
                      }}
                      title="删除"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 编辑区 ── */}
          {endpointEnabled && (
            <div
              className="settings-row"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, marginTop: 4 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  value={currentSkillName}
                  onChange={(e) => setCurrentSkillName(e.target.value)}
                  placeholder="skill-name (字母/数字/-/_)"
                  style={{
                    flex: 1,
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-text)'
                  }}
                />
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    if (!currentSkillName) {
                      setSkillStatus({ msg: '请输入 Skill 名称', kind: 'err' })
                      return
                    }
                    if (!/^[a-zA-Z0-9_-]+$/.test(currentSkillName)) {
                      setSkillStatus({ msg: '名称只能含字母、数字、-、_', kind: 'err' })
                      return
                    }
                    try {
                      const ok = await window.api.skillSave?.(currentSkillName, skillContent)
                      if (ok) {
                        await refreshSkillData()
                        setSkillStatus({ msg: `已保存:${currentSkillName}`, kind: 'ok' })
                      } else {
                        setSkillStatus({ msg: '保存失败', kind: 'err' })
                      }
                    } catch (e) {
                      setSkillStatus({
                        msg: '错误:' + (e instanceof Error ? e.message : String(e)),
                        kind: 'err'
                      })
                    }
                  }}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="保存"
                >
                  <Save size={11} /> 保存
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(skillContent)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                      setSkillStatus({ msg: '已复制全文', kind: 'ok' })
                    } catch {
                      setSkillStatus({ msg: '复制失败', kind: 'err' })
                    }
                  }}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="复制全文到剪贴板"
                >
                  {copied ? (
                    <>
                      <Check size={11} /> 已复制
                    </>
                  ) : (
                    <>
                      <Copy size={11} /> 复制
                    </>
                  )}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    const content = (await window.api.skillLoadDefault?.()) ?? ''
                    setSkillContent(content)
                    setCurrentSkillName('default')
                    setSkillStatus({ msg: '已加载默认模板', kind: 'ok' })
                  }}
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                  title="重置为默认模板"
                >
                  <RefreshCw size={11} /> 默认
                </button>
              </div>
              <textarea
                value={skillContent}
                onChange={(e) => setSkillContent(e.target.value)}
                placeholder="点上方预设按钮加载,或点默认按钮重置为出厂模板,或直接编辑你的 Skill.md..."
                style={{
                  minHeight: 200,
                  maxHeight: 400,
                  resize: 'vertical',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                  color: 'var(--color-text)',
                  whiteSpace: 'pre'
                }}
              />
              {skillStatus.msg && (
                <div
                  style={{
                    fontSize: 11,
                    color:
                      skillStatus.kind === 'ok'
                        ? 'var(--color-accent)'
                        : skillStatus.kind === 'err'
                          ? 'var(--color-error, #c44)'
                          : 'var(--color-text-tertiary)'
                  }}
                >
                  {skillStatus.msg}
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            复制后粘贴到你的 Agent(OpenClaw / Claude Code / 任何兼容服务)作为系统提示词。
          </div>
        </div>
      </div>
    </FloatingPanel>
  )
}
