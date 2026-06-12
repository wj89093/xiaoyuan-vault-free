/* ============================================================
   CSS 变量管理器（单例）
   基于 mdeditor CSSVariableManager 设计（2026-05-22）

   核心原则：
   - 批量写入：减少 DOM reflow
   - 防抖16ms：避免频繁更新
   - 缓存检查：跳过无需更新的设置
   - 自动变体：从 primary 自动生成透明版本

   使用方式：
   import { cssVariableManager } from './cssVariableManager'
   cssVariableManager.applyTheme('dark')
   ============================================================ */

type Theme = 'light' | 'dark'

// 防抖函数（16ms ≈ 1帧，避免频繁 reflow）
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn(...args)
      timer = null
    }, ms)
  }) as T
}

class CSSVariableManagerClass {
  private root: HTMLElement | null = null
  private debouncedSet: ((vars: Record<string, string>) => void) | null = null

  // 缓存：避免重复设置
  private cache: {
    theme: Theme | null
    lastVars: Record<string, string>
  } = {
    theme: null,
    lastVars: {}
  }

  constructor() {
    if (typeof document !== 'undefined') {
      this.root = document.documentElement
      // 防抖16ms：适合60fps屏幕
      this.debouncedSet = debounce(this.setVariables.bind(this) as (...args: unknown[]) => void, 16)
    }
  }

  // ============================================================
  // 核心：批量设置 CSS 变量
  // ============================================================

  /**
   * 批量写入 CSS 变量（同步）
   */
  private setVariables(variables: Record<string, string>) {
    if (!this.root) return
    const root = this.root
    for (const [name, value] of Object.entries(variables)) {
      if (value !== undefined && value !== null) {
        root.style.setProperty(name, value)
      }
    }
    this.cache.lastVars = { ...this.cache.lastVars, ...variables }
  }

  /**
   * 防抖写入（用于高频率调用场景）
   */
  private setVariablesDebounced(variables: Record<string, string>) {
    if (this.debouncedSet) {
      this.debouncedSet(variables)
    }
  }

  // ============================================================
  // 主题应用
  // ============================================================

  /**
   * 应用完整主题（light / dark）
   * 在 App.tsx 入口或 initTheme() 时调用一次即可
   */
  applyTheme(theme: Theme) {
    if (!this.root) return

    // 缓存命中检查
    if (this.cache.theme === theme) return

    this.cache.theme = theme

    // light/dark 主题变量已在 variables.css 中通过 [data-theme="dark"] 定义
    // 这里只需要确保 data-theme 属性正确即可
    // 如果有额外的动态变量需要设置，可以在这里扩展

    this.setVariables({})
  }

  /**
   * 强制刷新主题（清除缓存后重新应用）
   */
  forceRefresh() {
    this.cache.theme = null
    const theme = (document.documentElement.dataset.theme as Theme) || 'light'
    this.applyTheme(theme)
  }

  // ============================================================
  // 动态变量设置（用于运行时修改）
  // ============================================================

  /**
   * 设置单个 CSS 变量
   */
  set(name: string, value: string) {
    this.setVariables({ [name]: value })
  }

  /**
   * 批量设置（防抖）
   */
  setMany(variables: Record<string, string>) {
    this.setVariablesDebounced(variables)
  }

  /**
   * 移除 CSS 变量
   */
  remove(name: string) {
    if (!this.root) return
    this.root.style.removeProperty(name)
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 从 primary 色自动生成透明变体
   * 用法：autoAlpha('--color-primary', '#1a56a8')
   */
  autoAlpha(primaryVar: string, hexColor: string): Record<string, string> {
    const rgb = hexToRgb(hexColor)
    if (!rgb) return {}

    const prefix = primaryVar.replace('--', '--')
    return {
      [`${prefix}-rgb`]: `${rgb.r}, ${rgb.g}, ${rgb.b}`,
      [`${prefix}-10`]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`,
      [`${prefix}-15`]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
      [`${prefix}-20`]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`,
      [`${prefix}-25`]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`,
      [`${prefix}-40`]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.40)`,
      [`${prefix}-60`]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.60)`
    }
  }

  /**
   * 读取当前变量值
   */
  get(name: string): string {
    if (!this.root) return ''
    return getComputedStyle(this.root).getPropertyValue(name).trim()
  }
}

// 单例导出
export const cssVariableManager = new CSSVariableManagerClass()

// ============================================================
// 辅助函数
// ============================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string') return null
  const clean = hex.replace('#', '')
  const shorthand = /^([a-f\d])([a-f\d])([a-f\d])$/i
  const full = clean.replace(shorthand, (m, r, g, b) => r + r + g + g + b + b)
  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(full)
  if (!match) return null
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  }
}
