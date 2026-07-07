import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.addEventListener / removeEventListener (used by electron-log/renderer)
// 2026-07-07 (Free 仓清理): 删 chatLoad/chatSessions/chatCreate/chatSave/chatDelete/chatAsk mock
//   - chat 相关 API 已从 preload + window.d.ts 全部删除
Object.defineProperty(global, 'window', {
  value: {
    api: {
      importFiles: vi.fn(),
      fetchUrl: vi.fn(),
      saveUrlContent: vi.fn(),
      createFolder: vi.fn(),
      createFile: vi.fn(),
      saveFile: vi.fn(),
      saveAutoAISettings: vi.fn()
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  },
  writable: true
})

// Mock scrollIntoView
Object.defineProperty(global.Element.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true
})

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-1234'
  }
})

// Mock axios — real axios v1.x crashes in Node 25 jsdom because:
// axios v1.x detects ESM via `new URL(url).href` and URL is undefined in jsdom
// Import chain: providers.ts → import axios from 'axios' → crash during module init
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: '', status: 200 })
  },
  get: vi.fn().mockResolvedValue({ data: '', status: 200 })
}))

// Mock urlFetch/providers (after axios is mocked, these can be properly resolved)
vi.mock('../urlFetch/providers', () => ({
  fetchViaJina: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchDirectHTML: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchWechat: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchYouTube: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchTwitter: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchGitHub: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchReddit: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchBilibili: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  fetchZhihu: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' })
}))

vi.mock('../urlFetch', () => ({
  fetchURL: vi.fn().mockResolvedValue({ ok: false, error: 'mocked' }),
  saveURLToVault: vi.fn().mockResolvedValue('/mock/path')
}))

// Mock clipboard (imported by agent/tools.ts)
vi.mock('../clipboard/clipboard', () => ({
  bubbleState: { get: vi.fn(), set: vi.fn() },
  respawnBubble: vi.fn()
}))

// Mock mainWindowRef (imported by agent/tools.ts)
vi.mock('../../mainWindowRef', () => ({
  getMainWindowRef: vi.fn().mockReturnValue(null)
}))
