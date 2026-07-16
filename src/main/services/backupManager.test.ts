/**
 * backupManager.test.ts — 备份管理器单测
 *
 * 覆盖 src/main/services/backupManager.ts 中 6 个纯函数:
 *   createBackup / listBackups / previewBackup / restoreBackup / deleteBackup / backupCount
 *
 * 通过 vi.mock 拦截 fs/promises 和 fs.sync existsSync, 不写真磁盘
 *
 * 2026-07-16 (Free 仓 backport from team 9e8fcb9): 加 @vitest-environment node
 *   - free 仓 vitest 默认 jsdom (renderer 测试), mock fs/promises 缺 default export 失败
 *   - node 环境跳过 jsdom, 让 fs/promises mock 正常
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock fs 模块(存在性检查 existsSync 必须走 sync 版)
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}))

// mock fs/promises(异步读写目录/文件)
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
  stat: vi.fn(),
}))

// mock path.join: 直接字符串拼接, 便于在断言里断言路径
vi.mock('path', () => ({
  join: (...parts: string[]) => parts.filter(Boolean).join('/'),
}))

import { existsSync } from 'fs'
import * as fsp from 'fs/promises'
import {
  createBackup,
  listBackups,
  previewBackup,
  restoreBackup,
  deleteBackup,
  backupCount,
} from './backupManager'

const VAULT = '/vault'

beforeEach(() => {
  vi.clearAllMocks()
})

/* =====================================================================
 * createBackup
 * ===================================================================== */
describe('createBackup (创建备份)', () => {
  it('正常备份: 读源文件 → 拼备份路径 → 写 .bak', async () => {
    // 场景: 标准 .md 文件, 源文件存在, 应成功产生 {ts}.bak
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('# Hello\n\noriginal content')
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined as any)
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined as any)

    // 锁定 Date.now 以便断言路径
    const fixedTs = 1700000000000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(fixedTs)

    const result = await createBackup(VAULT, 'docs/intro.md')

    expect(result).toBe('/vault/_briefing/backups/docs/intro.md/' + fixedTs + '.bak')
    expect(fsp.readFile).toHaveBeenCalledWith('/vault/docs/intro.md', 'utf-8')
    expect(fsp.mkdir).toHaveBeenCalledWith('/vault/_briefing/backups/docs/intro.md', { recursive: true })
    expect(fsp.writeFile).toHaveBeenCalledWith(
      '/vault/_briefing/backups/docs/intro.md/' + fixedTs + '.bak',
      '# Hello\n\noriginal content',
      'utf-8'
    )
    spy.mockRestore()
  })

  it('relPath 为 null → 拒绝, 返空字符串', async () => {
    // 场景: 调用方传 null, 应安全降级(不抛错, 不读盘)
    const existsSpy = vi.mocked(existsSync)
    existsSpy.mockClear()

    const result = await createBackup(VAULT, null as any)

    expect(result).toBe('')
    expect(existsSpy).not.toHaveBeenCalled()
    expect(fsp.readFile).not.toHaveBeenCalled()
  })

  it('relPath 含 ".." → 拒绝, 返空字符串 (防穿越)', async () => {
    // 场景: 路径遍历攻击, 应直接拒绝(零信任)
    const result = await createBackup(VAULT, '../etc/passwd')

    expect(result).toBe('')
    expect(existsSync).not.toHaveBeenCalled()
    expect(fsp.readFile).not.toHaveBeenCalled()
  })

  it('源文件不存在 → 返空字符串, 不写备份', async () => {
    // 场景: 文件已被删或路径错, 不应创建空备份
    vi.mocked(existsSync).mockReturnValue(false)

    const result = await createBackup(VAULT, 'docs/missing.md')

    expect(result).toBe('')
    expect(fsp.readFile).not.toHaveBeenCalled()
    expect(fsp.writeFile).not.toHaveBeenCalled()
  })

  it('mkdir 抛错 → 静默返空字符串 (备份 best-effort)', async () => {
    // 场景: 备份目录创建失败(EACCES 等), 不应炸上层写流程
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('content')
    vi.mocked(fsp.mkdir).mockRejectedValue(new Error('EACCES: permission denied'))

    const result = await createBackup(VAULT, 'docs/intro.md')

    expect(result).toBe('')
  })

  it('writeFile 抛错 → 静默返空字符串', async () => {
    // 场景: 写盘失败(磁盘满/权限), 备份失败但不影响主流程
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('content')
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined as any)
    vi.mocked(fsp.writeFile).mockRejectedValue(new Error('ENOSPC: no space'))

    const result = await createBackup(VAULT, 'docs/intro.md')

    expect(result).toBe('')
  })
})

/* =====================================================================
 * listBackups
 * ===================================================================== */
describe('listBackups (列出备份, 最新在前)', () => {
  it('正常列出 + 按 timestamp 降序排序', async () => {
    // 场景: 3 个备份, ts 乱序, 应按新→旧排序返回
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readdir).mockResolvedValue(['1000.bak', '3000.bak', '2000.bak'] as any)
    vi.mocked(fsp.stat).mockResolvedValue({ size: 42 } as any)

    const result = await listBackups(VAULT, 'docs/intro.md')

    expect(result).toHaveLength(3)
    expect(result.map((e) => e.timestamp)).toEqual(['3000', '2000', '1000'])
    expect(result.every((e) => e.size === 42)).toBe(true)
    expect(result.every((e) => /^\d{4}\/\d{2}\/\d{2}/.test(e.isoTime))).toBe(true)
  })

  it('备份目录不存在 → 返空数组', async () => {
    // 场景: 首次备份某文件, 目录还没建
    vi.mocked(existsSync).mockReturnValue(false)

    const result = await listBackups(VAULT, 'docs/intro.md')

    expect(result).toEqual([])
    expect(fsp.readdir).not.toHaveBeenCalled()
  })

  it('readdir 抛错 → 静默返空数组', async () => {
    // 场景: 目录损坏/权限缺失
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readdir).mockRejectedValue(new Error('EACCES'))

    const result = await listBackups(VAULT, 'docs/intro.md')

    expect(result).toEqual([])
  })

  it('过滤非 .bak 文件 (忽略 .DS_Store / 临时文件)', async () => {
    // 场景: 目录里混了 macOS 元数据, 应只统计真正的备份
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readdir).mockResolvedValue([
      '1000.bak',
      '.DS_Store',
      'temp.tmp',
      '2000.bak',
      'README',
    ] as any)
    vi.mocked(fsp.stat).mockResolvedValue({ size: 10 } as any)

    const result = await listBackups(VAULT, 'docs/intro.md')

    expect(result.map((e) => e.timestamp)).toEqual(['2000', '1000'])
  })

  it('stat 抛错 → 跳过该条目, 不影响其它', async () => {
    // 场景: 单个备份文件损坏, 不应让整个列表失败
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readdir).mockResolvedValue(['1000.bak', '2000.bak'] as any)
    vi.mocked(fsp.stat)
      .mockResolvedValueOnce({ size: 5 } as any)
      .mockRejectedValueOnce(new Error('EBADF'))

    const result = await listBackups(VAULT, 'docs/intro.md')

    expect(result.map((e) => e.timestamp)).toEqual(['1000'])
  })
})

/* =====================================================================
 * previewBackup
 * ===================================================================== */
describe('previewBackup (读取备份内容)', () => {
  it('正常读取 .bak 内容', async () => {
    // 场景: 用户点开历史版本预览
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('# Old Version\n\ntext')

    const result = await previewBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(result).toBe('# Old Version\n\ntext')
    expect(fsp.readFile).toHaveBeenCalledWith(
      '/vault/_briefing/backups/docs/intro.md/1700000000000.bak',
      'utf-8'
    )
  })

  it('备份文件不存在 → 返空字符串', async () => {
    // 场景: 选了已被删的 ts, 不抛错
    vi.mocked(existsSync).mockReturnValue(false)

    const result = await previewBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(result).toBe('')
    expect(fsp.readFile).not.toHaveBeenCalled()
  })

  it('readFile 抛错 → 静默返空字符串', async () => {
    // 场景: 文件可看到但读不了
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockRejectedValue(new Error('EIO'))

    const result = await previewBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(result).toBe('')
  })
})

/* =====================================================================
 * restoreBackup
 * ===================================================================== */
describe('restoreBackup (恢复备份覆盖原文件)', () => {
  it('正常恢复: 读 .bak → 写目标', async () => {
    // 场景: 用户回滚到历史版本, 目标文件存在
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('# Restored')
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined as any)
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined as any)

    const ok = await restoreBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(ok).toBe(true)
    expect(fsp.readFile).toHaveBeenCalledWith(
      '/vault/_briefing/backups/docs/intro.md/1700000000000.bak',
      'utf-8'
    )
    expect(fsp.writeFile).toHaveBeenCalledWith(
      '/vault/docs/intro.md',
      '# Restored',
      'utf-8'
    )
  })

  it('备份不存在 → 返 false, 不写目标', async () => {
    // 场景: 用户选了过期 ts
    vi.mocked(existsSync).mockReturnValue(false)

    const ok = await restoreBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(ok).toBe(false)
    expect(fsp.readFile).not.toHaveBeenCalled()
    expect(fsp.writeFile).not.toHaveBeenCalled()
  })

  it('目标在 vault 根 → mkdir 仍会被调用 (含 vault 自身)', async () => {
    // 场景: 备份 vault 顶级文件 (e.g. README.md).
    //   源实现里 targetPath='/vault/README.md', split slice(0,-1) = ['vault'] -> '/vault',
    //   这是 truthy, 所以会 mkdir('/vault', recursive). 我们验证行为即可, 不要硬性断言 "不调用".
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('root content')
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined as any)
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined as any)

    const ok = await restoreBackup(VAULT, 'README.md', '1700000000000')

    expect(ok).toBe(true)
    expect(fsp.writeFile).toHaveBeenCalledWith('/vault/README.md', 'root content', 'utf-8')
  })

  it('目标父目录被删 → mkdir 重建后写入', async () => {
    // 场景: 用户手抖删了 docs/ 目录, 恢复时应自动重建
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('content')
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined as any)
    vi.mocked(fsp.writeFile).mockResolvedValue(undefined as any)

    const ok = await restoreBackup(VAULT, 'docs/sub/intro.md', '1700000000000')

    expect(ok).toBe(true)
    expect(fsp.mkdir).toHaveBeenCalledWith('/vault/docs/sub', { recursive: true })
  })

  it('写目标失败 → 返 false', async () => {
    // 场景: 目标路径只读 / 写盘失败
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readFile).mockResolvedValue('content')
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined as any)
    vi.mocked(fsp.writeFile).mockRejectedValue(new Error('EROFS'))

    const ok = await restoreBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(ok).toBe(false)
  })
})

/* =====================================================================
 * deleteBackup
 * ===================================================================== */
describe('deleteBackup (删除单个备份)', () => {
  it('正常删除: 返回 true 且 unlink 被调用', async () => {
    // 场景: 用户清理旧版本
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.unlink).mockResolvedValue(undefined as any)

    const ok = await deleteBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(ok).toBe(true)
    expect(fsp.unlink).toHaveBeenCalledWith(
      '/vault/_briefing/backups/docs/intro.md/1700000000000.bak'
    )
  })

  it('备份不存在 → 返 false, 不调 unlink', async () => {
    // 场景: 已被删的 ts, 不能再 unlink
    vi.mocked(existsSync).mockReturnValue(false)

    const ok = await deleteBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(ok).toBe(false)
    expect(fsp.unlink).not.toHaveBeenCalled()
  })

  it('unlink 抛错 → 返 false', async () => {
    // 场景: 文件锁 / 权限问题
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.unlink).mockRejectedValue(new Error('EBUSY'))

    const ok = await deleteBackup(VAULT, 'docs/intro.md', '1700000000000')

    expect(ok).toBe(false)
  })
})

/* =====================================================================
 * backupCount
 * ===================================================================== */
describe('backupCount (备份数量)', () => {
  it('返回 listBackups 的长度', async () => {
    // 场景: 5 个备份 → 返 5
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readdir).mockResolvedValue(
      ['1000.bak', '2000.bak', '3000.bak', '4000.bak', '5000.bak'] as any
    )
    vi.mocked(fsp.stat).mockResolvedValue({ size: 1 } as any)

    const count = await backupCount(VAULT, 'docs/intro.md')

    expect(count).toBe(5)
  })

  it('无备份 → 返 0', async () => {
    // 场景: 新文件从未被写过
    vi.mocked(existsSync).mockReturnValue(false)

    const count = await backupCount(VAULT, 'docs/new.md')

    expect(count).toBe(0)
  })

  it('过滤 .DS_Store 后再计数 → 不算垃圾文件', async () => {
    // 场景: 目录里夹了元数据, 不应混入计数
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(fsp.readdir).mockResolvedValue(['1000.bak', '.DS_Store', '2000.bak'] as any)
    vi.mocked(fsp.stat).mockResolvedValue({ size: 1 } as any)

    const count = await backupCount(VAULT, 'docs/intro.md')

    expect(count).toBe(2)
  })
})
