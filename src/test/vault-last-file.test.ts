/**
 * vault-last-file.test.ts — 覆盖 v1.5 上次打开文件记忆的两个分支
 *
 * 策略: 读 useVaultState.ts 源码, 用 regex 断言关键分支
 * (跟 urlFetch.test.ts 模式一致 — 测源码不依赖运行时)
 *
 * 覆盖:
 *   分支 1: 启动 useEffect (getLastVault) — auto-select lastFile
 *   分支 2: handleOpenVault — auto-select lastFile
 *   分支 3: 二进制文件 — 走 native preview 路径
 *   分支 4: .md 文件 — 走 readFile + setContent 路径
 *   分支 5: handleSelectFile — 写 lastFile
 *   IPC + preload + types: getLastFile / setLastFile
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const useVaultStateSource = readFileSync(
  join(process.cwd(), 'src/renderer/hooks/useVaultState.ts'),
  'utf-8'
)
const vaultHandlersSource = readFileSync(
  join(process.cwd(), 'src/main/ipc/vaultHandlers.ts'),
  'utf-8'
)
const preloadSource = readFileSync(
  join(process.cwd(), 'src/preload/index.ts'),
  'utf-8'
)
const windowDtsSource = readFileSync(
  join(process.cwd(), 'src/shared/window.d.ts'),
  'utf-8'
)

describe('v1.5 上次打开文件记忆 — IPC 暴露', () => {
  it('vaultHandlers 暴露 vault:getLastFile 和 vault:setLastFile', () => {
    expect(vaultHandlersSource).toMatch(/ipcMain\.handle\(['"]vault:getLastFile['"]/)
    expect(vaultHandlersSource).toMatch(/ipcMain\.handle\(['"]vault:setLastFile['"]/)
  })

  it('preload 暴露 vault.getLastFile / setLastFile', () => {
    expect(preloadSource).toMatch(/getLastFile:\s*\(vaultPath: string\)/)
    expect(preloadSource).toMatch(/setLastFile:\s*\(vaultPath: string,\s*filePath: string\)/)
  })

  it('window.d.ts 加了 getLastFile / setLastFile 类型', () => {
    expect(windowDtsSource).toMatch(/getLastFile\(vaultPath: string\):\s*Promise<string \| null>/)
    expect(windowDtsSource).toMatch(
      /setLastFile\(vaultPath: string,\s*filePath: string\):\s*Promise<boolean>/
    )
  })
})

describe('v1.5 上次打开文件记忆 — 启动时 auto-select (分支 1)', () => {
  it('启动 useEffect 读 getLastVault 后调 getLastFile', () => {
    // useEffect body 里同时有 getLastVault 和 getLastFile 调用
    const startEffectMatch = useVaultStateSource.match(
      /\/\/ Auto-restore last vault on startup[\s\S]{0,3000}?\}\)\(\)\.catch\(\(\) => \{\}\)/
    )
    expect(startEffectMatch).not.toBeNull()
    const block = startEffectMatch![0]
    expect(block).toMatch(/api\.getLastVault/)
    expect(block).toMatch(/api\.getLastFile/)
  })

  it('启动时存在 lastFile 且未删就 setSelectedFile', () => {
    const startEffectMatch = useVaultStateSource.match(
      /\/\/ Auto-restore last vault on startup[\s\S]{0,3000}?\}\)\(\)\.catch\(\(\) => \{\}\)/
    )
    const block = startEffectMatch![0]
    expect(block).toMatch(/setSelectedFile\(lastFile\)/)
  })

  it('启动时 .md 文件走 readFile + setContent', () => {
    const startEffectMatch = useVaultStateSource.match(
      /\/\/ Auto-restore last vault on startup[\s\S]{0,3000}?\}\)\(\)\.catch\(\(\) => \{\}\)/
    )
    const block = startEffectMatch![0]
    expect(block).toMatch(/api\.readFile\(lastFile\)/)
    expect(block).toMatch(/setContent\(c\)/)
  })

  it('启动时二进制文件走 renderFile (native preview)', () => {
    const startEffectMatch = useVaultStateSource.match(
      /\/\/ Auto-restore last vault on startup[\s\S]{0,3000}?\}\)\(\)\.catch\(\(\) => \{\}\)/
    )
    const block = startEffectMatch![0]
    expect(block).toMatch(/setIsNativePreview\(true\)/)
    expect(block).toMatch(/api\.renderFile\?\.\(lastFile\)/)
  })
})

describe('v1.5 上次打开文件记忆 — handleOpenVault auto-select (分支 2)', () => {
  it('handleOpenVault 调 getLastFile', () => {
    // 抓 handleOpenVault 完整函数体
    const openVaultMatch = useVaultStateSource.match(
      /const handleOpenVault = useCallback\(async \(\) => \{[\s\S]{0,2000}?\}, \[\]\)/
    )
    expect(openVaultMatch).not.toBeNull()
    const block = openVaultMatch![0]
    expect(block).toMatch(/api\.getLastFile/)
  })

  it('handleOpenVault 中二进制也走 native preview', () => {
    const openVaultMatch = useVaultStateSource.match(
      /const handleOpenVault = useCallback\(async \(\) => \{[\s\S]{0,2000}?\}, \[\]\)/
    )
    const block = openVaultMatch![0]
    expect(block).toMatch(/api\.renderFile\?\./)
  })
})

describe('v1.5 上次打开文件记忆 — handleSelectFile 持久化 (分支 5)', () => {
  it('handleSelectFile 末尾调 setLastFile(vaultPath, filePath)', () => {
    // 简化: 抓 handleSelectFile 整个函数体 (从 useCallback 到第一个 }, [deps])
    // 宽泛匹配: 因为 useCallback 可能有跨行注释
    const fnStart = useVaultStateSource.indexOf('const handleSelectFile = useCallback')
    expect(fnStart).toBeGreaterThan(-1)
    // 找下一个 '}, ['  (deps 数组开始)
    const depsStart = useVaultStateSource.indexOf('}, [', fnStart)
    expect(depsStart).toBeGreaterThan(fnStart)
    const block = useVaultStateSource.slice(fnStart, depsStart)
    expect(block).toMatch(/api\.setLastFile/)
    expect(block).toMatch(/vaultPath,\s*filePath/)
  })

  it('handleSelectFile deps 包含 vaultPath', () => {
    // deps 在 ESLint disable 注释后面, indexOf('}, [') 抓不到
    // 用 [selectedFile, isDirty, content, vaultPath] 字符串定位
    const fnStart = useVaultStateSource.indexOf('const handleSelectFile = useCallback')
    expect(fnStart).toBeGreaterThan(-1)
    // 找 [selectedFile, isDirty, content, vaultPath] 在 fnStart 后
    const target = '[selectedFile, isDirty, content, vaultPath]'
    const idx = useVaultStateSource.indexOf(target, fnStart)
    expect(idx).toBeGreaterThan(fnStart)
  })
})

describe('v1.5 上次打开文件记忆 — 边界处理', () => {
  it('文件被删时静默忽略 (try/catch 包裹 readFile)', () => {
    const openVaultMatch = useVaultStateSource.match(
      /const handleOpenVault = useCallback\(async \(\) => \{[\s\S]{0,2000}?\}, \[\]\)/
    )
    const block = openVaultMatch![0]
    // 确认 readFile 在 try 里
    expect(block).toMatch(/try\s*\{\s*const c = await api\.readFile/)
    // 确认 catch 存在
    expect(block).toMatch(/catch\s*\{[\s\S]{0,100}?\/\*\s*文件被删/)
  })

  it('lastFile 不存在时不调用 setSelectedFile (有 fileList.some guard)', () => {
    const startEffectMatch = useVaultStateSource.match(
      /\/\/ Auto-restore last vault on startup[\s\S]{0,3000}?\}\)\(\)\.catch\(\(\) => \{\}\)/
    )
    const block = startEffectMatch![0]
    expect(block).toMatch(/fileList\.some\(/)
    expect(block).toMatch(/!f\.isDirectory/)
  })
})
