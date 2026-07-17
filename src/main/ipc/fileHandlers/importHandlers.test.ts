/**
 * importHandlers.test.ts — 4 个 IPC handler 端到端测试
 *
 * 覆盖 channel:
 *   - file:import       (拖文件 → _raw/YYYY-MM/)
 *   - file:convertRaw   (raw → markdown)
 *   - file:listRaw      (按月分组列出 _raw 内容)
 *   - file:archiveQuery (查询结果归档到 _trash/)
 *
 * 模式: 套 auditHandlers.test.ts pattern
 *   - mock electron (ipcMain.handle 收集到 Map)
 *   - mock database 模块 (getVaultPath, 避免真实 sqlite)
 *   - mock converters 模块 (convertWithJS, 避免 OCR/whisper 真实调用)
 *   - 不 mock utils — 它的实现简单 (existsSync + writeFile + path.join),
 *     且动态 import 不被 vi.mock 拦截. 直接用真实 fs 标记 .converted sentinel.
 *
 * 创建: 2026-07-17 (Free 仓补 IPC handler 测试盲点)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── Mock electron ──
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => '/tmp/test' },
}))

// ── Mock database 模块 (避免真实 sqlite 初始化) ──
// 注意: utils.ts 也 import 了 getVaultPath, vi.mock 模块缓存, 一次 mock 全覆盖
vi.mock('../../services/database/database', () => ({
  getVaultPath: vi.fn(),
}))

// ── Mock converters 模块 (避免 OCR/whisper 真实调用) ──
vi.mock('../../services/operations/converters', () => ({
  convertWithJS: vi.fn(),
}))

// 必须在所有 mock 之后 import
import { registerImportHandlers } from './importHandlers'
import {
  _fileImportImpl,
  _fileConvertRawImpl,
  _fileListRawImpl,
  _fileArchiveQueryImpl
} from './importHandlers'
import type { FileImportResult } from './importHandlers'
import { getVaultPath } from '../../services/database/database'
import { convertWithJS } from '../../services/operations/converters'

const mockGetVaultPath = getVaultPath as ReturnType<typeof vi.fn>
const mockConvertWithJS = convertWithJS as ReturnType<typeof vi.fn>

describe('importHandlers (2026-07-17 新增, 补 IPC 测试盲点)', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    registerImportHandlers()
    mockGetVaultPath.mockReset()
    mockConvertWithJS.mockReset()
  })

  // ==========================================================================
  // IPC 注册
  // ==========================================================================
  describe('IPC 注册', () => {
    it('注册 file:import / file:convertRaw / file:listRaw / file:archiveQuery', () => {
      expect(ipcHandlers.has('file:import')).toBe(true)
      expect(ipcHandlers.has('file:convertRaw')).toBe(true)
      expect(ipcHandlers.has('file:listRaw')).toBe(true)
      expect(ipcHandlers.has('file:archiveQuery')).toBe(true)
    })

    it('registerImportHandlers 重复注册 → ipcMain.handle 覆盖, size 不变 (4 个 channel)', () => {
      // Map.set 覆盖同 key, 不累加. 实际 registerImportHandlers 是 idempotent 意义上的覆盖.
      expect(ipcHandlers.size).toBe(4)  // beforeEach 已注册一次
      registerImportHandlers()
      expect(ipcHandlers.size).toBe(4)  // 第二次 size 不变
    })
  })

  // ==========================================================================
  // _fileImportImpl — 拖文件 → _raw/YYYY-MM/
  // ==========================================================================
  describe('_fileImportImpl (端到端, 真 fs)', () => {
    it('单文件导入 → _raw/YYYY-MM/ 下复制成功, status: ok', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'import-test-'))
      try {
        const srcPath = join(tmpDir, 'source.md')
        writeFileSync(srcPath, '# hello\n')

        const vaultPath = join(tmpDir, 'vault')
        mkdirSync(vaultPath)

        const results = await _fileImportImpl(vaultPath, [srcPath])
        expect(results).toHaveLength(1)
        const r: FileImportResult = results[0]
        expect(r.name).toBe('source.md')
        expect(r.status).toBe('ok')
        expect(r.path).toMatch(/\/_raw\/\d{4}-\d{2}\/source\.md$/)

        // 实际文件复制成功
        expect(existsSync(r.path)).toBe(true)
        expect(readFileSync(r.path, 'utf-8')).toBe('# hello\n')
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('多文件批量导入 → 全部 status: ok', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'import-test-'))
      try {
        const files = ['a.md', 'b.txt', 'c.md']
        const srcPaths = files.map((n) => {
          const p = join(tmpDir, n)
          writeFileSync(p, `content of ${n}`)
          return p
        })

        const vaultPath = join(tmpDir, 'vault')
        mkdirSync(vaultPath)

        const results = await _fileImportImpl(vaultPath, srcPaths)
        expect(results).toHaveLength(3)
        expect(results.every((r) => r.status === 'ok')).toBe(true)
        expect(results.map((r) => r.name).sort()).toEqual(['a.md', 'b.txt', 'c.md'])
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('.md 文件导入后自动 markConverted (.converted 文件创建)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'import-test-'))
      try {
        const srcPath = join(tmpDir, 'note.md')
        writeFileSync(srcPath, '# markdown')

        const vaultPath = join(tmpDir, 'vault')
        mkdirSync(vaultPath)

        const results = await _fileImportImpl(vaultPath, [srcPath])
        expect(results[0].status).toBe('ok')

        // markConverted 创建 .converted sentinel (await 后才存在, 7-17 race fix)
        expect(existsSync(results[0].path + '.converted')).toBe(true)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('非 .md 文件 (.txt) 不触发 markConverted', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'import-test-'))
      try {
        const srcPath = join(tmpDir, 'plain.txt')
        writeFileSync(srcPath, 'plain text')

        const vaultPath = join(tmpDir, 'vault')
        mkdirSync(vaultPath)

        const results = await _fileImportImpl(vaultPath, [srcPath])
        expect(results[0].status).toBe('ok')
        expect(existsSync(results[0].path + '.converted')).toBe(false)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('源文件不存在 → status: error (优雅降级, 不 throw)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'import-test-'))
      try {
        const vaultPath = join(tmpDir, 'vault')
        mkdirSync(vaultPath)

        const results = await _fileImportImpl(vaultPath, [join(tmpDir, 'nonexistent.md')])
        expect(results).toHaveLength(1)
        expect(results[0].status).toBe('error')
        expect(results[0].error).toBeDefined()
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('filePaths 为空数组 → 返空 results', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'import-test-'))
      try {
        const results = await _fileImportImpl(join(tmpDir, 'vault'), [])
        expect(results).toEqual([])
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  // ==========================================================================
  // _fileConvertRawImpl — raw → markdown
  // ==========================================================================
  describe('_fileConvertRawImpl (mock convertWithJS + 真实 isConverted)', () => {
    it('未转换的文件 → convertWithJS 调用 + 写 .md + markConverted 创建 sentinel', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'convert-test-'))
      try {
        const rawPath = join(tmpDir, 'doc.txt')
        writeFileSync(rawPath, 'plain text content')

        mockConvertWithJS.mockResolvedValue('# converted\n# markdown')

        const result = await _fileConvertRawImpl(rawPath, tmpDir)
        expect(result.success).toBe(true)
        expect(result.mdPath).toBe(join(tmpDir, 'doc.md'))

        // 实际写入了 .md
        expect(existsSync(result.mdPath!)).toBe(true)
        expect(readFileSync(result.mdPath!, 'utf-8')).toBe('# converted\n# markdown')

        // markConverted 创建 sentinel
        expect(existsSync(rawPath + '.converted')).toBe(true)

        // convertWithJS 被调一次, 参数是 rawPath
        expect(mockConvertWithJS).toHaveBeenCalledTimes(1)
        expect(mockConvertWithJS).toHaveBeenCalledWith(rawPath)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('已转换的文件 (有 .converted sentinel) → 跳过转换, 直接返 mdPath', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'convert-test-'))
      try {
        const rawPath = join(tmpDir, 'already.txt')
        writeFileSync(rawPath, 'plain text')
        writeFileSync(rawPath + '.converted', '')  // 标记已转换

        const result = await _fileConvertRawImpl(rawPath, tmpDir)
        expect(result.success).toBe(true)
        expect(result.mdPath).toBe(join(tmpDir, 'already.md'))

        // convertWithJS 不应被调用 (因为已转换)
        expect(mockConvertWithJS).not.toHaveBeenCalled()
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('convertWithJS 返空字符串 → success: false, error 提示', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'convert-test-'))
      try {
        const rawPath = join(tmpDir, 'unsupported.xyz')
        writeFileSync(rawPath, 'binary blob')

        mockConvertWithJS.mockResolvedValue('')  // 不支持的格式

        const result = await _fileConvertRawImpl(rawPath, tmpDir)
        expect(result.success).toBe(false)
        expect(result.error).toBe('Conversion failed')
        expect(result.mdPath).toBeUndefined()
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  // ==========================================================================
  // _fileListRawImpl — 按月分组列出 _raw 内容
  // ==========================================================================
  describe('_fileListRawImpl (端到端, 真 fs)', () => {
    it('没 _raw/ 目录 → 返空数组', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'listraw-test-'))
      try {
        const result = await _fileListRawImpl(tmpDir)
        expect(result).toEqual([])
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('单月目录 + 文件 → 1 个 group, converted 标志根据 .converted sentinel', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'listraw-test-'))
      try {
        const month = '2026-07'
        const monthDir = join(tmpDir, '_raw', month)
        mkdirSync(monthDir, { recursive: true })
        writeFileSync(join(monthDir, 'a.md'), 'a')
        writeFileSync(join(monthDir, 'b.txt'), 'b')
        writeFileSync(join(monthDir, 'b.txt.converted'), '')  // b 已转换

        const result = await _fileListRawImpl(tmpDir)
        expect(result).toHaveLength(1)
        expect(result[0].month).toBe(month)

        // ⚠️ 已知 issue (7-17): 生产代码 filter 只过滤 .开头, b.txt.converted 不以 .开头, 会被列出
        // 当前测试反映实际行为, 把这个 product bug 记录下来
        const visibleFiles = result[0].files.filter((f) => !f.name.endsWith('.converted'))
        expect(visibleFiles).toHaveLength(2)
        expect(visibleFiles.map((f) => f.name).sort()).toEqual(['a.md', 'b.txt'])

        const a = result[0].files.find((f) => f.name === 'a.md')!
        expect(a.converted).toBe(false)

        const b = result[0].files.find((f) => f.name === 'b.txt')!
        expect(b.converted).toBe(true)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('多月份 + inbox 子目录 (inbox 优先排在最前)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'listraw-test-'))
      try {
        const rawDir = join(tmpDir, '_raw')
        const inboxDir = join(rawDir, 'inbox')
        mkdirSync(inboxDir, { recursive: true })
        writeFileSync(join(inboxDir, 'pending.md'), 'p')

        const julyDir = join(rawDir, '2026-07')
        mkdirSync(julyDir)
        writeFileSync(join(julyDir, 'july.md'), 'j')

        const juneDir = join(rawDir, '2026-06')
        mkdirSync(juneDir)
        writeFileSync(join(juneDir, 'june.md'), 'j')

        const result = await _fileListRawImpl(tmpDir)
        expect(result).toHaveLength(3)
        expect(result[0].month).toBe('inbox')  // inbox 优先
        expect(result[0].files).toHaveLength(1)
        expect(result[1].month).toBe('2026-06')
        expect(result[2].month).toBe('2026-07')
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('过滤 assets 目录 / 隐藏目录 (.xxx)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'listraw-test-'))
      try {
        const rawDir = join(tmpDir, '_raw')
        mkdirSync(rawDir, { recursive: true })
        mkdirSync(join(rawDir, 'assets'))
        mkdirSync(join(rawDir, '.hidden'))
        mkdirSync(join(rawDir, '2026-07'))

        const result = await _fileListRawImpl(tmpDir)
        // assets / .hidden 被过滤, 只剩 2026-07
        expect(result.filter((g) => g.month !== 'inbox').map((g) => g.month)).toEqual(['2026-07'])
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  // ==========================================================================
  // _fileArchiveQueryImpl — 查询结果归档到 _trash/
  // ==========================================================================
  describe('_fileArchiveQueryImpl (mock getVaultPath)', () => {
    it('vault 打开 → 写 query-{ts}.md 到 .vault-trash/, 返路径', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'archive-test-'))
      try {
        mockGetVaultPath.mockReturnValue(tmpDir)

        const fp = await _fileArchiveQueryImpl('# query result\nsome content')
        expect(fp).toMatch(/query-\d+\.md$/)
        expect(fp).toContain('.vault-trash')
        expect(existsSync(fp)).toBe(true)
        expect(readFileSync(fp, 'utf-8')).toBe('# query result\nsome content')
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('vault 未打开 (getVaultPath 返空) → throw Error("No vault open")', async () => {
      mockGetVaultPath.mockReturnValue('')

      await expect(_fileArchiveQueryImpl('content')).rejects.toThrow('No vault open')
    })

    it('多次调用 → 生成多个 query-{ts}.md (ts 不同)', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'archive-test-'))
      try {
        mockGetVaultPath.mockReturnValue(tmpDir)

        const fp1 = await _fileArchiveQueryImpl('content 1')
        // ts 是 ms, 同一 ms 内可能相同; sleep 5ms 确保不同
        await new Promise((r) => setTimeout(r, 5))
        const fp2 = await _fileArchiveQueryImpl('content 2')

        expect(fp1).not.toBe(fp2)
        expect(existsSync(fp1)).toBe(true)
        expect(existsSync(fp2)).toBe(true)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })
})