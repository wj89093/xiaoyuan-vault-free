// @vitest-environment node

/**
 * maintain.test.ts — 知识库健康检查 (runMaintenance) 单元测试
 *
 * 2026-XX-XX 新增: 覆盖 maintain.ts (298L) 测试空白
 *
 * 覆盖范围:
 *   1. emptyReport — 空报告结构
 *   2. flattenFiles — 文件树递归展平
 *   3. runMaintenance — vault 未打开 (early return)
 *   4. runMaintenance — 正常流程 (orphan / stale / deadLinks / missingFields / conceptGaps / suggestedLinks)
 *   5. runMaintenance — 矛盾检测 (callAI mock)
 *   6. 边界 — 空文件列表 / 单文件 / 全字段
 *
 * 所有外部依赖 (DB / CRUD / frontmatter / AI / fs / log) 通过 vi.mock 隔离
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── 依赖 mock ──────────────────────────────────────────────────────

// electron-log
vi.mock('electron-log/main', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// fs/promises — readFile 用于 runMaintenance 主体
vi.mock('fs/promises', () => ({
  readFile: vi.fn(async (_path: string) => ''),
}))

// fs (sync) — readFileSync 用于 detectContradictions
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => ''),
}))

// 数据库 (vault 路径)
vi.mock('../database/database', () => ({
  getVaultPath: vi.fn(() => '/tmp/test-vault'),
}))

// 文件树列表
vi.mock('../operations/crud', () => ({
  listVaultFiles: vi.fn(async () => []),
}))

// frontmatter & wiki links
vi.mock('../frontmatter/index', () => ({
  parseFrontmatter: vi.fn(() => ({ frontmatter: {}, content: '' })),
  extractWikiLinks: vi.fn(() => []),
}))

// AI 调用
vi.mock('../ai/aiService', () => ({
  callAI: vi.fn(async () => '{"contradiction": null}'),
}))

// ─── Imports (必须在 mock 之后) ─────────────────────────────────────

import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { getVaultPath } from '../database/database'
import { listVaultFiles } from '../operations/crud'
import { parseFrontmatter, extractWikiLinks } from '../frontmatter/index'
import { callAI } from '../ai/aiService'
import {
  runMaintenance,
  type MaintainReport,
} from './maintain'
import type { FileRecord } from '../database/database'

// ─── Helpers ────────────────────────────────────────────────────────

function makeFile(
  name: string,
  opts: Partial<FileRecord> & { folder?: string; title?: string } = {}
): FileRecord {
  const folder = opts.folder ?? ''
  const path = folder ? `${folder}/${name}` : name
  return {
    path,
    name,
    isDirectory: false,
    modified: Date.now(),
    title: opts.title ?? name.replace('.md', ''),
    ...opts,
  } as FileRecord
}

function resetAllMocks(): void {
  vi.mocked(getVaultPath).mockReset()
  vi.mocked(listVaultFiles).mockReset()
  vi.mocked(parseFrontmatter).mockReset()
  vi.mocked(extractWikiLinks).mockReset()
  vi.mocked(callAI).mockReset()
  vi.mocked(readFile).mockReset()
  vi.mocked(readFileSync).mockReset()

  // 默认恢复
  vi.mocked(getVaultPath).mockReturnValue('/tmp/test-vault')
  vi.mocked(listVaultFiles).mockResolvedValue([])
  vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: {}, content: '' } as any)
  vi.mocked(extractWikiLinks).mockReturnValue([])
  vi.mocked(callAI).mockResolvedValue('{"contradiction": null}')
  vi.mocked(readFile).mockResolvedValue('')
  vi.mocked(readFileSync).mockReturnValue('')
}

// 配置单文件 frontmatter / links
function configFile(file: FileRecord, fm: Record<string, any>, links: string[] = []): void {
  vi.mocked(parseFrontmatter).mockImplementation((raw: string) => {
    // 根据当前 raw 决定返回 — 简单起见, 总是返回该 fm
    return { frontmatter: fm, content: raw } as any
  })
  vi.mocked(extractWikiLinks).mockReturnValue(links)
  vi.mocked(readFile).mockResolvedValue(`---\n---\nbody for ${file.name}`)
  vi.mocked(readFileSync).mockReturnValue(`---\n---\nbody for ${file.name}`)
}

beforeEach(() => {
  resetAllMocks()
})

// ─── 1. emptyReport (通过 vault 边界间接验证) ──────────────────────

describe('emptyReport (indirect)', () => {
  it('返回结构完整的空报告 (vault 未打开)', async () => {
    vi.mocked(getVaultPath).mockReturnValue('')
    const r = await runMaintenance()
    expect(r).toMatchObject({
      totalFiles: 0,
      orphanPages: [],
      stalePages: [],
      deadLinks: [],
      missingFields: [],
      contradictions: [],
      conceptGaps: [],
      suggestedLinks: [],
      summary: '未打开知识库',
      wikiHealth: '未知',
    })
    expect(typeof r.timestamp).toBe('number')
  })

  it('timestamp 是合法毫秒数', async () => {
    vi.mocked(getVaultPath).mockReturnValue('')
    const r = await runMaintenance()
    expect(r.timestamp).toBeGreaterThan(0)
    // 2020 之后
    expect(r.timestamp).toBeGreaterThan(1_577_836_800_000)
  })
})

// ─── 2. flattenFiles (通过嵌套 listVaultFiles 间接验证) ─────────────

describe('flattenFiles (indirect)', () => {
  it('空数组 → 不处理任何 md 文件', async () => {
    vi.mocked(listVaultFiles).mockResolvedValue([])
    const r = await runMaintenance()
    expect(r.totalFiles).toBe(0)
  })

  it('顶层直接放文件 → 全部计入 totalFiles', async () => {
    const f1 = makeFile('a.md', { folder: '/vault', title: 'a' })
    const f2 = makeFile('b.md', { folder: '/vault', title: 'b' })
    vi.mocked(listVaultFiles).mockResolvedValue([f1, f2])
    vi.mocked(readFile).mockImplementation(async (p: any) => String(p))
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'x', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    expect(r.totalFiles).toBe(2)
  })

  it('二层嵌套 (目录含文件) → 嵌套内的 md 也被算入', async () => {
    const f1 = makeFile('top.md', { folder: '/vault', title: 'top' })
    const f2 = makeFile('inside.md', { folder: '/vault/sub', title: 'inside' })
    const dir: FileRecord = {
      path: '/vault/sub',
      name: 'sub',
      isDirectory: true,
      modified: 0,
      children: [f2],
    }
    vi.mocked(listVaultFiles).mockResolvedValue([f1, dir])
    vi.mocked(readFile).mockImplementation(async (p: any) => String(p))
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'x', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    // flattenFiles 把目录和里面的 md 都展平, filter 保留 md
    expect(r.totalFiles).toBe(2)
  })

  it('深层嵌套 (三层以上) → 最深的 md 仍被算入', async () => {
    const f1 = makeFile('top.md', { folder: '/vault', title: 'top' })
    const deep: FileRecord = makeFile('deep.md', { folder: '/vault/a/b/c', title: 'deep' })
    const c: FileRecord = {
      path: '/vault/a/b/c', name: 'c', isDirectory: true, modified: 0,
      children: [deep],
    }
    const b: FileRecord = {
      path: '/vault/a/b', name: 'b', isDirectory: true, modified: 0,
      children: [c],
    }
    const a: FileRecord = {
      path: '/vault/a', name: 'a', isDirectory: true, modified: 0,
      children: [b],
    }
    vi.mocked(listVaultFiles).mockResolvedValue([f1, a])
    vi.mocked(readFile).mockImplementation(async (p: any) => String(p))
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'x', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    expect(r.totalFiles).toBe(2)
  })

  it('非 md 文件被过滤', async () => {
    const md = makeFile('note.md', { folder: '/vault', title: 'note' })
    const txt: FileRecord = {
      path: '/vault/notes.txt', name: 'notes.txt', isDirectory: false, modified: 0,
    }
    vi.mocked(listVaultFiles).mockResolvedValue([md, txt])
    vi.mocked(readFile).mockImplementation(async (p: any) => String(p))
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'note', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    expect(r.totalFiles).toBe(1)
  })
})

// ─── 3. runMaintenance — vault 未打开 ────────────────────────────────

describe('runMaintenance — vault 边界', () => {
  it('getVaultPath 返回空字符串 → 返回 emptyReport', async () => {
    vi.mocked(getVaultPath).mockReturnValue('')
    const r = await runMaintenance()
    expect(r.totalFiles).toBe(0)
    expect(r.summary).toBe('未打开知识库')
    expect(r.orphanPages).toEqual([])
    // 不应该去扫描文件
    expect(listVaultFiles).not.toHaveBeenCalled()
  })

  it('空文件列表 → totalFiles=0, summary 走「一切正常」分支', async () => {
    vi.mocked(listVaultFiles).mockResolvedValue([])
    const r = await runMaintenance()
    expect(r.totalFiles).toBe(0)
    expect(r.summary).toBe('一切正常 ✅')
    expect(r.orphanPages).toEqual([])
    expect(r.stalePages).toEqual([])
    expect(r.deadLinks).toEqual([])
    expect(r.missingFields).toEqual([])
  })
})

// ─── 4. runMaintenance — 正常流程 ──────────────────────────────────

describe('runMaintenance — 正常流程', () => {
  it('单文件无 frontmatter → missingFields 命中 title/type/status', async () => {
    const file = makeFile('only.md')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    configFile(file, {})

    const r = await runMaintenance()
    expect(r.totalFiles).toBe(1)
    expect(r.missingFields).toHaveLength(1)
    expect(r.missingFields[0].missing).toEqual(expect.arrayContaining(['title', 'type', 'status']))
  })

  it('2 个文件互相链接 → 没有 orphan, 没有 deadLinks', async () => {
    const fa = makeFile('A.md', { folder: '/vault/_wiki', title: 'A' })
    const fb = makeFile('B.md', { folder: '/vault/_wiki', title: 'B' })

    // A 链接 B, B 链接 A
    const fmStore: Record<string, Record<string, any>> = {
      '/vault/_wiki/A.md': { title: 'A', type: 'concept', status: 'active' },
      '/vault/_wiki/B.md': { title: 'B', type: 'concept', status: 'active' },
    }
    const linkStore: Record<string, string[]> = {
      '/vault/_wiki/A.md': ['B'],
      '/vault/_wiki/B.md': ['A'],
    }

    vi.mocked(listVaultFiles).mockResolvedValue([fa, fb])
    // readFile 返回 path 字符串, 后面用 raw 路由 fm/links
    vi.mocked(readFile).mockImplementation(async (p: any) => String(p))
    vi.mocked(parseFrontmatter).mockImplementation((raw: string) => ({
      frontmatter: fmStore[raw] ?? {},
      content: '',
    } as any))
    vi.mocked(extractWikiLinks).mockImplementation((raw: string) => linkStore[raw] ?? [])

    const r = await runMaintenance()
    expect(r.totalFiles).toBe(2)
    expect(r.orphanPages).toEqual([])
    expect(r.deadLinks).toEqual([])
    expect(r.missingFields).toEqual([])
  })

  it('死链接 — 页面 A 链接到不存在的 [[Ghost]]', async () => {
    const fa = makeFile('A.md', { folder: '/vault', title: 'A' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa])
    vi.mocked(readFile).mockResolvedValue('A.md body')
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { title: 'A', type: 'concept', status: 'active' }, content: '' } as any)
    vi.mocked(extractWikiLinks).mockReturnValue(['Ghost'])

    const r = await runMaintenance()
    expect(r.deadLinks).toHaveLength(1)
    expect(r.deadLinks[0].deadTarget).toBe('Ghost')
    expect(r.deadLinks[0].fromTitle).toBe('A')
  })

  it('孤儿页面 — 单文件时不该被判 orphan (mdFiles.length > 1 才判)', async () => {
    const fa = makeFile('solo.md')
    vi.mocked(listVaultFiles).mockResolvedValue([fa])
    vi.mocked(readFile).mockResolvedValue('body')
    vi.mocked(parseFrontmatter).mockReturnValue({ frontmatter: { title: 'solo', type: 'concept', status: 'active' }, content: '' } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    // 单文件时不判 orphan
    expect(r.orphanPages).toEqual([])
  })

  it('孤儿页面 — 多文件时, 没被链接的进入 orphanPages', async () => {
    const fa = makeFile('A.md', { folder: '/vault', title: 'A' })
    const fb = makeFile('B.md', { folder: '/vault', title: 'B' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa, fb])

    // A 链接到 B; B 不链接 A
    let lastPath = ''
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      lastPath = String(p)
      return String(p)
    })
    const fmStore: Record<string, Record<string, any>> = {
      '/vault/A.md': { title: 'A', type: 'concept', status: 'active' },
      '/vault/B.md': { title: 'B', type: 'concept', status: 'active' },
    }
    const linkStore: Record<string, string[]> = {
      '/vault/A.md': ['B'],
      '/vault/B.md': [],
    }
    vi.mocked(parseFrontmatter).mockImplementation((raw: string) => ({ frontmatter: fmStore[raw] ?? {}, content: '' } as any))
    vi.mocked(extractWikiLinks).mockImplementation((raw: string) => linkStore[raw] ?? [])

    const r = await runMaintenance()
    // A 链接了 B, 但 B 没有被任何页面链接 → B 不算 orphan
    // A 本身没被 B 链接 → A 算 orphan
    expect(r.orphanPages.length).toBeGreaterThan(0)
    const orphanTitles = r.orphanPages.map(p => p.title)
    expect(orphanTitles).toContain('A')
    expect(orphanTitles).not.toContain('B')
  })

  it('过期页面 — updated 超过 STALE_DAYS(90) 天', async () => {
    const file = makeFile('old.md')
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString()
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('body')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'old', type: 'concept', status: 'active', updated: oldDate },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    expect(r.stalePages).toHaveLength(1)
    expect(r.stalePages[0].daysSinceUpdate).toBeGreaterThan(90)
  })

  it('概念缺口 — 链接目标没有对应页面', async () => {
    const fa = makeFile('note.md', { folder: '/vault', title: 'note' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa])
    vi.mocked(readFile).mockResolvedValue('note body')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'note', type: 'concept', status: 'active' },
      content: '',
    } as any)
    // 链接到不存在的 Miss 和 Miss
    vi.mocked(extractWikiLinks).mockReturnValue(['Missing', 'Missing'])

    const r = await runMaintenance()
    const gap = r.conceptGaps.find(g => g.mentionedAs === 'Missing')
    expect(gap).toBeDefined()
    expect(gap!.severity).toBe('medium') // 2 次提及 → medium
  })

  it('概念缺口 — 3 次以上提及 → high', async () => {
    const fa = makeFile('note.md', { folder: '/vault', title: 'note' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa])
    vi.mocked(readFile).mockResolvedValue('note body')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'note', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue(['Hot', 'Hot', 'Hot', 'Hot'])

    const r = await runMaintenance()
    const gap = r.conceptGaps.find(g => g.mentionedAs === 'Hot')
    expect(gap).toBeDefined()
    expect(gap!.severity).toBe('high')
  })

  it('建议链接 — 同文件夹两个文件互相没链接 → low', async () => {
    const fa = makeFile('A.md', { folder: '/vault/_wiki', title: 'A' })
    const fb = makeFile('B.md', { folder: '/vault/_wiki', title: 'B' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa, fb])

    let lastPath = ''
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      lastPath = String(p)
      return String(p)
    })
    const fmStore: Record<string, Record<string, any>> = {
      '/vault/_wiki/A.md': { title: 'A', type: 'concept', status: 'active' },
      '/vault/_wiki/B.md': { title: 'B', type: 'concept', status: 'active' },
    }
    vi.mocked(parseFrontmatter).mockImplementation((raw: string) => ({ frontmatter: fmStore[raw] ?? {}, content: '' } as any))
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    // _wiki 文件夹 → medium severity
    const sug = r.suggestedLinks.find(s => s.toTitle === 'B' || s.toTitle === 'A')
    expect(sug).toBeDefined()
  })

  it('建议链接 — 文件数 < 2 的文件夹不产生建议', async () => {
    const fa = makeFile('lonely.md', { folder: '/vault/solo', title: 'lonely' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa])
    vi.mocked(readFile).mockResolvedValue('body')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'lonely', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    expect(r.suggestedLinks).toEqual([])
  })

  it('summary 拼接 — 多个问题同时出现', async () => {
    const fa = makeFile('orphan-no-fm.md', { folder: '/vault', title: 'orphan-no-fm' })
    const fb = makeFile('linker.md', { folder: '/vault', title: 'linker' })
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString()

    vi.mocked(listVaultFiles).mockResolvedValue([fa, fb])
    let lastPath = ''
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      lastPath = String(p)
      return String(p)
    })
    const fmStore: Record<string, Record<string, any>> = {
      '/vault/orphan-no-fm.md': {}, // 缺字段
      '/vault/linker.md': { title: 'linker', type: 'concept', status: 'active', updated: oldDate }, // 过期
    }
    const linkStore: Record<string, string[]> = {
      '/vault/orphan-no-fm.md': ['MissingLink'],
      '/vault/linker.md': [],
    }
    vi.mocked(parseFrontmatter).mockImplementation((raw: string) => ({ frontmatter: fmStore[raw] ?? {}, content: '' } as any))
    vi.mocked(extractWikiLinks).mockImplementation((raw: string) => linkStore[raw] ?? [])

    const r = await runMaintenance()
    expect(r.summary).toContain('个孤儿页面')
    expect(r.summary).toContain('个死链接')
    expect(r.summary).toContain('个过期页面')
    expect(r.summary).toContain('个缺字段')
  })

  it('全字段正常 → summary 是「一切正常 ✅」', async () => {
    const fa = makeFile('goodA.md', { folder: '/vault/_wiki', title: 'goodA' })
    const fb = makeFile('goodB.md', { folder: '/vault/_wiki', title: 'goodB' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa, fb])

    let lastPath = ''
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      lastPath = String(p)
      return String(p)
    })
    const fmStore: Record<string, Record<string, any>> = {
      '/vault/_wiki/goodA.md': { title: 'goodA', type: 'concept', status: 'active', updated: new Date().toISOString() },
      '/vault/_wiki/goodB.md': { title: 'goodB', type: 'concept', status: 'active', updated: new Date().toISOString() },
    }
    const linkStore: Record<string, string[]> = {
      '/vault/_wiki/goodA.md': ['goodB'],
      '/vault/_wiki/goodB.md': ['goodA'],
    }
    vi.mocked(parseFrontmatter).mockImplementation((raw: string) => ({ frontmatter: fmStore[raw] ?? {}, content: '' } as any))
    vi.mocked(extractWikiLinks).mockImplementation((raw: string) => linkStore[raw] ?? [])

    const r = await runMaintenance()
    expect(r.summary).toBe('一切正常 ✅')
    expect(r.wikiHealth).toBe('✅ 健康')
  })
})

// ─── 5. runMaintenance — 矛盾检测 ──────────────────────────────────

describe('runMaintenance — 矛盾检测', () => {
  function makeCandidate(name: string, summary: string, body: string): FileRecord {
    return makeFile(name, { folder: '/vault', title: name.replace('.md', '') })
  }

  it('callAI 返回 null contradiction → contradictions 为空, wikiHealth 健康', async () => {
    const file = makeCandidate('pageA.md', '我是 summary', '## 时间线\n- 旧记录 1')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('## 时间线\n- 旧记录 1')
    vi.mocked(readFileSync).mockReturnValue('---\nsummary: 我是 summary\nupdated: 2026-01-01\n---\n## 时间线\n- 旧记录 1')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'pageA', type: 'concept', status: 'active', summary: '我是 summary', updated: '2026-01-01' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])
    vi.mocked(callAI).mockResolvedValue('{"contradiction": null}')

    const r = await runMaintenance()
    expect(r.contradictions).toEqual([])
    expect(r.wikiHealth).toBe('✅ 健康')
  })

  it('callAI 返回 contradiction → 进入 contradictions 列表', async () => {
    const file = makeCandidate('pageA.md', '新摘要', '## 时间线\n- 旧记录 1')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('## 时间线\n- 旧记录 1')
    vi.mocked(readFileSync).mockReturnValue('---\nsummary: 新摘要\nupdated: 2026-01-01\n---\n## 时间线\n- 旧记录 1')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'pageA', type: 'concept', status: 'active', summary: '新摘要', updated: '2026-01-01' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      contradiction: {
        oldValue: '旧的事实',
        newValue: '新的事实',
        source: '来源片段',
      }
    }))

    const r = await runMaintenance()
    expect(r.contradictions).toHaveLength(1)
    expect(r.contradictions[0]).toMatchObject({
      pageTitle: 'pageA',
      oldValue: '旧的事实',
      newValue: '新的事实',
      source: '来源片段',
      severity: 'medium',
    })
    expect(r.wikiHealth).toContain('个矛盾待处理')
    expect(r.summary).toContain('个矛盾')
  })

  it('没有时间线段 → checkPageContradictions 返回 null', async () => {
    const file = makeCandidate('noTimeline.md', 'summary', '无时间线内容')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('无时间线内容')
    vi.mocked(readFileSync).mockReturnValue('---\nsummary: summary\nupdated: 2026-01-01\n---\n无时间线内容')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'noTimeline', type: 'concept', status: 'active', summary: 'summary', updated: '2026-01-01' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    // 没有时间线 → 不会调 callAI
    expect(callAI).not.toHaveBeenCalled()
    expect(r.contradictions).toEqual([])
  })

  it('没有 summary / updated → 不作为矛盾候选', async () => {
    const file = makeCandidate('noSum.md', '', '## 时间线\n- 旧记录')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('## 时间线\n- 旧记录')
    vi.mocked(readFileSync).mockReturnValue('---\n---\n## 时间线\n- 旧记录')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'noSum' }, // 无 summary 无 updated
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    expect(callAI).not.toHaveBeenCalled()
    expect(r.contradictions).toEqual([])
  })

  it('callAI 抛错 → 不会让整个 runMaintenance 崩', async () => {
    const file = makeCandidate('willFail.md', 'summary', '## 时间线\n- 旧记录')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('## 时间线\n- 旧记录')
    vi.mocked(readFileSync).mockReturnValue('---\nsummary: summary\nupdated: 2026-01-01\n---\n## 时间线\n- 旧记录')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'willFail', type: 'concept', status: 'active', summary: 'summary', updated: '2026-01-01' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])
    vi.mocked(callAI).mockRejectedValue(new Error('AI 服务挂了'))

    const r = await runMaintenance()
    // 主流程不被破坏
    expect(r.totalFiles).toBe(1)
    expect(r.contradictions).toEqual([])
  })

  it('callAI 返回非 JSON 字符串 → contradictions 为空', async () => {
    const file = makeCandidate('bad.md', 'summary', '## 时间线\n- 旧记录')
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('## 时间线\n- 旧记录')
    vi.mocked(readFileSync).mockReturnValue('---\nsummary: summary\nupdated: 2026-01-01\n---\n## 时间线\n- 旧记录')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'bad', type: 'concept', status: 'active', summary: 'summary', updated: '2026-01-01' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])
    vi.mocked(callAI).mockResolvedValue('抱歉, 我不能提供这个信息')

    const r = await runMaintenance()
    expect(r.contradictions).toEqual([])
  })
})

// ─── 6. 边界 / 集成 ────────────────────────────────────────────────

describe('runMaintenance — 边界', () => {
  it('readFile 抛错 → 跳过单个文件, 不让整个流程崩', async () => {
    const fa = makeFile('good.md', { folder: '/vault/_wiki', title: 'good' })
    const fb = makeFile('bad.md', { folder: '/vault/_wiki', title: 'bad' })
    vi.mocked(listVaultFiles).mockResolvedValue([fa, fb])

    // 第一次 readFile 抛错, 第二次正常
    let calls = 0
    vi.mocked(readFile).mockImplementation(async (p: any) => {
      calls++
      if (calls === 1) throw new Error('EACCES')
      return String(p)
    })
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'good', type: 'concept', status: 'active' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    // 两个文件都参与了 flatten, 但 readFile 第一次失败被 catch 跳过
    expect(r.totalFiles).toBe(2)
    // 不会抛错给调用方
    expect(r.summary).toBeDefined()
  })

  it('frontmatter.updated 是非法字符串 → 不会让流程崩', async () => {
    const file = makeFile('weird.md', { folder: '/vault', title: 'weird' })
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('body')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'weird', type: 'concept', status: 'active', updated: 'not-a-date' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])

    const r = await runMaintenance()
    // NaN 不会进入 stalePages
    expect(r.stalePages).toEqual([])
  })

  it('wikiHealth 在有矛盾时显示告警', async () => {
    const file = makeFile('has.md', { folder: '/vault', title: 'has' })
    vi.mocked(listVaultFiles).mockResolvedValue([file])
    vi.mocked(readFile).mockResolvedValue('## 时间线\n- 旧记录')
    vi.mocked(readFileSync).mockReturnValue('---\nsummary: s\nupdated: 2026-01-01\n---\n## 时间线\n- 旧记录')
    vi.mocked(parseFrontmatter).mockReturnValue({
      frontmatter: { title: 'has', type: 'concept', status: 'active', summary: 's', updated: '2026-01-01' },
      content: '',
    } as any)
    vi.mocked(extractWikiLinks).mockReturnValue([])
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      contradiction: { oldValue: 'a', newValue: 'b', source: 'c' }
    }))

    const r = await runMaintenance()
    expect(r.wikiHealth).toMatch(/矛盾待处理/)
  })
})
