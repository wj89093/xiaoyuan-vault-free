/**
 * useReaderSettings — v1.5 reader UX: 字体/行距调节
 *
 * 用户是读者, 不同文档/场景需要不同阅读参数。
 * 用 CSS variables 注入, 不改 CodeMirror 状态。
 *
 * 持久化: localStorage (简单, 不需要 IPC/SQLite)
 */
import { useState, useEffect } from 'react'

export interface ReaderSettings {
  /** 字体大小 14-24px, 默认 16 */
  fontSize: number
  /** 行距 1.4-2.2, 默认 1.7 */
  lineHeight: number
}

const STORAGE_KEY = 'xiaoyuan-v1.5-reader-settings'

const DEFAULTS: ReaderSettings = {
  fontSize: 16,
  lineHeight: 1.7,
}

function load(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return {
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : DEFAULTS.fontSize,
        lineHeight: typeof parsed.lineHeight === 'number' ? parsed.lineHeight : DEFAULTS.lineHeight,
      }
    }
  } catch {
    /* corrupt or missing */
  }
  return { ...DEFAULTS }
}

function save(settings: ReaderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* quota exceeded, ignore */
  }
}

/**
 * 管理阅读设置 + 注入 CSS variables
 *
 * 返回 settings + setter, 供 UI 组件调用。
 * CSS variables 注入到 :root, 所有组件自动生效。
 */
export function useReaderSettings() {
  const [settings, setSettings] = useState<ReaderSettings>(load)

  // 注入 CSS variables
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--reader-font-size', `${settings.fontSize}px`)
    root.style.setProperty('--reader-line-height', String(settings.lineHeight))
    save(settings)
  }, [settings])

  const setFontSize = (size: number): void => {
    setSettings((prev) => ({ ...prev, fontSize: Math.min(24, Math.max(14, size)) }))
  }

  const setLineHeight = (height: number): void => {
    setSettings((prev) => ({ ...prev, lineHeight: Math.min(2.2, Math.max(1.4, Math.round(height * 10) / 10)) }))
  }

  const resetDefaults = (): void => {
    setSettings({ ...DEFAULTS })
  }

  return { settings, setFontSize, setLineHeight, resetDefaults }
}
