// @vitest-environment jsdom
/**
 * useVaultState.multitab.test.ts (backport from team 0640bba + 097dc46)
 *
 * 2026-07-07 用户在 team 仓反馈: 主编辑区点击 tab 不切换页面
 *   真因: switchTab 只 setSelectedFile 不读文件 + handleSelectFile "已在 tab" 提前 return
 *   → content 永远显示上一个 tab 的内容
 *
 * 2026-07-07 用户需求: FileTree 点击 → 单 tab 模式, 右键'在新标签页打开'才开 tab
 *   handleSelectFile 加 { addTab?: boolean } 参数, 默认 false (单 tab 模式)
 *
 * Free 仓差异 (vs team):
 *   - 没有 services/currentUser 模块 (free 仓无权限系统)
 *   - 没有 Permission 拦截, 直接测试 handleSelectFile 即可
 *
 * 测试目标 (6 case):
 *   1. handleSelectFile 默认 addTab=false → 单 tab 模式 (openTabs=[file])
 *   2. handleSelectFile 第二次 → 重置 openTabs (不累加)
 *   3. openTab → 强制开新 tab (addTab=true), openTabs 累加
 *   4. switchTab(0) 切回 file1 → content='file1 content'
 *   5. 单 tab 模式覆盖多 tab: openTab 开 tab1+2 → FileTree 点 tab3 → openTabs 重置为 [tab3]
 *   6. switchTab 越界 noop
 */

import { vi } from 'vitest'

// electron-log (jsdom 下避免 hang)
vi.mock('electron-log/renderer', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// useVaultSearch 整个 mock 掉 (不依赖 search 逻辑)
vi.mock('./useVaultSearch', () => ({
  useVaultSearch: () => ({
    searchQuery: '',
    searchResults: [],
    showSearchResults: false,
    setShowSearchResults: vi.fn(),
    handleSearch: vi.fn(),
    handleOpenSearch: vi.fn(),
    handleCloseSearch: vi.fn(),
  }),
}))

// Toast (不弹)
vi.mock('../components/Toast', () => ({
  showToast: vi.fn(),
}))

// window.api (核心 mock: 读文件 + 写文件)
// 必须在 import useVaultState 之前设置, 因为 useVaultState.ts 在模块顶层引用 window.api
const readFileMock = vi.fn(async (path: string) => {
  if (path.endsWith('file1.md')) return 'file1 content'
  if (path.endsWith('file2.md')) return 'file2 content'
  if (path.endsWith('file3.md')) return 'file3 content'
  throw new Error(`mock: unknown file ${path}`)
})

const mockApi = {
  readFile: readFileMock,
  saveFile: vi.fn(async () => {}),
  renderFile: vi.fn(),
  openVault: vi.fn(),
  vault: { openPath: vi.fn(), checkPathPermission: vi.fn(async () => null) },
  file: { openExternal: vi.fn() },
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// 动态 import (在 window.api 设置后)
const { useVaultState } = await import('./useVaultState')

describe('useVaultState - multi-tab (backport from team 0640bba)', () => {
  beforeEach(() => {
    readFileMock.mockClear()
  })

  it('handleSelectFile 默认 addTab=false (FileTree 点击) → 单 tab 模式', async () => {
    const { result } = renderHook(() => useVaultState())

    await act(async () => {
      await result.current.handleSelectFile('file1.md')
    })

    expect(result.current.openTabs).toEqual(['file1.md'])
    expect(result.current.activeTabIndex).toBe(0)
    expect(result.current.selectedFile).toBe('file1.md')
    expect(result.current.content).toBe('file1 content')
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it('handleSelectFile 第二次 → 重置 openTabs (单 tab 模式, 不累加)', async () => {
    const { result } = renderHook(() => useVaultState())

    await act(async () => {
      await result.current.handleSelectFile('file1.md')
    })
    await act(async () => {
      await result.current.handleSelectFile('file2.md')
    })

    expect(result.current.openTabs).toEqual(['file2.md'])
    expect(result.current.activeTabIndex).toBe(0)
    expect(result.current.selectedFile).toBe('file2.md')
    expect(result.current.content).toBe('file2 content')
    expect(readFileMock).toHaveBeenCalledTimes(2)
  })

  it('openTab → 强制开新 tab (addTab=true), openTabs 累加', async () => {
    const { result } = renderHook(() => useVaultState())

    await act(async () => {
      result.current.openTab('file1.md')
    })
    await act(async () => {
      result.current.openTab('file2.md')
    })

    expect(result.current.openTabs).toEqual(['file1.md', 'file2.md'])
    expect(result.current.activeTabIndex).toBe(1)
    expect(result.current.selectedFile).toBe('file2.md')
    expect(result.current.content).toBe('file2 content')
    expect(readFileMock).toHaveBeenCalledTimes(2)
  })

  it('switchTab(0) 切回 file1 → content 是 file1 content (核心修复点)', async () => {
    const { result } = renderHook(() => useVaultState())

    await act(async () => {
      result.current.openTab('file1.md')
    })
    await act(async () => {
      result.current.openTab('file2.md')
    })
    expect(result.current.content).toBe('file2 content')

    await act(async () => {
      result.current.switchTab(0)
    })

    expect(result.current.activeTabIndex).toBe(0)
    expect(result.current.selectedFile).toBe('file1.md')
    expect(readFileMock).toHaveBeenCalledWith('file1.md')
    expect(result.current.content).toBe('file1 content')
  })

  it('单 tab 模式覆盖多 tab: openTab 开 tab1+2 → FileTree 点 tab3 → openTabs 重置为 [tab3]', async () => {
    const { result } = renderHook(() => useVaultState())

    await act(async () => {
      result.current.openTab('file1.md')
    })
    await act(async () => {
      result.current.openTab('file2.md')
    })
    expect(result.current.openTabs).toEqual(['file1.md', 'file2.md'])

    await act(async () => {
      await result.current.handleSelectFile('file3.md')
    })

    expect(result.current.openTabs).toEqual(['file3.md'])
    expect(result.current.activeTabIndex).toBe(0)
    expect(result.current.selectedFile).toBe('file3.md')
    expect(result.current.content).toBe('file3 content')
  })

  it('switchTab 越界 index → noop', async () => {
    const { result } = renderHook(() => useVaultState())

    await act(async () => {
      result.current.openTab('file1.md')
    })
    const before = { tabs: result.current.openTabs, active: result.current.activeTabIndex }

    await act(async () => {
      result.current.switchTab(99)
    })
    expect(result.current.openTabs).toEqual(before.tabs)
    expect(result.current.activeTabIndex).toBe(before.active)

    await act(async () => {
      result.current.switchTab(-1)
    })
    expect(result.current.activeTabIndex).toBe(before.active)
  })
})