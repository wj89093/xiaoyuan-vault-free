/* ============================================================
   晓园 Vault — 主题管理器
   基于 mdeditor CSSVariableManager 设计（2026-05-22）
   功能：
   - CSS变量批量写入（减少reflow）
   - 防抖16ms更新
   - 缓存检查（跳过重复设置）
   - 自动生成透明变体
   - localStorage 持久化
   ============================================================ */
import { cssVariableManager } from './cssVariableManager'

export type ColorTheme = 'light' | 'dark' | 'system'

const STORAGE_KEY_THEME = 'vault-color-theme'

// ============================================================
// 主题应用入口
// ============================================================

/**
 * 应用颜色主题
 * @param theme 'light' | 'dark'
 */
export function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  root.dataset.theme = theme
  cssVariableManager.applyTheme(theme)
  saveThemePreference(theme)
}

/**
 * 切换深色/浅色模式
 */
export function toggleDarkMode() {
  const current = getCurrentTheme()
  const next = current === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

/**
 * 获取当前主题
 */
export function getCurrentTheme(): 'light' | 'dark' {
  return (document.documentElement.dataset.theme as 'light' | 'dark') || 'light'
}

/**
 * 初始化主题（页面加载时调用）
 * 优先级：localStorage > 系统偏好
 */
export function initTheme() {
  // 1. 检查 localStorage
  const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) as 'light' | 'dark' | null
  if (savedTheme) {
    applyTheme(savedTheme)
    return
  }

  // 2. 检查系统偏好
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark')
  } else {
    applyTheme('light')
  }

  // 3. 监听系统主题变化
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY_THEME)) {
      applyTheme(e.matches ? 'dark' : 'light')
    }
  })
}

// ============================================================
// localStorage 持久化
// ============================================================

function saveThemePreference(theme: 'light' | 'dark') {
  try {
    localStorage.setItem(STORAGE_KEY_THEME, theme)
  } catch (e) {
    console.warn('[ThemeManager] Failed to save theme preference:', e)
  }
}

// ============================================================
// 便捷的 CSS 变量读取
// ============================================================

/**
 * 读取 CSS 变量值
 */
export function getCSSVariable(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * 读取 RGB 格式的 CSS 变量（如 --color-primary-rgb → "26, 86, 168"）
 */
export function getCSSVariableRGB(name: string): string {
  return getCSSVariable(name + '-rgb')
}

/**
 * 生成 rgba 字符串
 */
export function withOpacity(name: string, opacity: number): string {
  const rgb = getCSSVariableRGB(name)
  if (!rgb) return `rgba(0, 0, 0, ${opacity})`
  return `rgba(${rgb}, ${opacity})`
}

// ============================================================
// 快捷颜色（用于 JSX inline style）
// ============================================================

/**
 * 获取系统快捷色（用于 JSX hardcoded 替换）
 * 用法：color: systemColor('blue')  // → #007aff
 */
export function systemColor(name: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gray'): string {
  const map = {
    blue: 'var(--color-blue)',
    green: 'var(--color-green)',
    red: 'var(--color-red)',
    orange: 'var(--color-orange)',
    purple: 'var(--color-purple)',
    gray: 'var(--color-gray)',
  }
  return map[name] || map.gray
}

/**
 * 获取文字色（自动适配深色模式）
 */
export function textColor(level: 'primary' | 'secondary' | 'tertiary' = 'primary'): string {
  const map = {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    tertiary: 'var(--color-text-tertiary)',
  }
  return map[level]
}