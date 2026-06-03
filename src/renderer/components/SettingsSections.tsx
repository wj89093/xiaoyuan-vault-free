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
import { Sun, Moon, Monitor, User, LogIn, LogOut, Loader2, Plug, Copy, Check, Trash2, RefreshCw, Save } from 'lucide-react'

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
  )
})

// ─── SkillSection ─────────────────────────────────────────────────────
//
// Free 仓 v1.4 保留用户 Skill CRUD（写自己的 Skill.md 给 Agent 加载）。
// 默认模板 = Agents.md 全文（替代 v1.3.1 的 skill-plugin-default.md）。

export const SkillSection = memo(function SkillSection(): JSX.Element {
  const [skillContent, setSkillContent] = useState('')
  const [copied, setCopied] = useState(false)
  const [userSkills, setUserSkills] = useState<Array<{ name: string; path: string }>>([])
  const [currentSkillName, setCurrentSkillName] = useState<string>('')
  const [skillStatus, setSkillStatus] = useState<{ msg: string; kind: 'info' | 'ok' | 'err' }>({ msg: '', kind: 'info' })

  async function refreshLocal(): Promise<void> {
    try {
      const users = (await window.api.skillList?.()) ?? []
      setUserSkills(users)
    } catch (e) {
      console.error('[SkillSection] refresh failed:', e)
    }
  }

  useEffect(() => {
    void refreshLocal()
  }, [])

  return (
    <div className="settings-section">
      <div className="settings-section-title">
        <Plug size={14} />
        Skill.md
      </div>
      <div
        className="settings-row"
        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
      >
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          写自己的 Skill.md 供 Agent 加载。Agent 工作流规范见{' '}
          <code
            style={{
              background: 'var(--color-bg-secondary)',
              padding: '1px 4px',
              borderRadius: 3
            }}
          >
            src/main/templates/Agents.md
          </code>
          ，9 个场景触发器在顶部索引里。
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
                    await refreshLocal()
                    if (currentSkillName === s.name) {
                      setCurrentSkillName('')
                      setSkillContent('')
                    }
                    setSkillStatus({ msg: `已删除:${s.name}`, kind: 'ok' })
                  }}
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

        {/* 编辑区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
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
                  await refreshLocal()
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
              setSkillStatus({ msg: '已加载默认模板 (Agents.md)', kind: 'ok' })
            }}
            style={{
              fontSize: 12,
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 3
            }}
            title="重置为默认模板 (Agents.md)"
          >
            <RefreshCw size={11} /> 默认
          </button>
        </div>
        <textarea
          value={skillContent}
          onChange={(e) => setSkillContent(e.target.value)}
          placeholder="点默认按钮加载 Agents.md 全文,或直接编辑你的 Skill.md..."
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
    </div>
  )
})
