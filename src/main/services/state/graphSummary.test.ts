/**
 * graphSummary.test.ts — _state/graph/SUMMARY.json 写入 + buildGraphSummary 纯函数
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock database BEFORE importing graphSummary
const mockGetVaultPath = vi.fn<() => string>(() => '')
vi.mock('../database/database', () => ({
  getVaultPath: () => mockGetVaultPath()
}))

// Mock graphStorage.loadGraph (avoid SQLite / real graph deps in unit test)
const mockLoadGraph = vi.fn<() => Promise<any>>()
vi.mock('../graph/graphStorage', () => ({
  loadGraph: () => mockLoadGraph()
}))

const { buildGraphSummary, writeGraphSummary } = await import('./graphSummary')

describe('v1.9 graph/SUMMARY.json (AI-readable graph health)', () => {
  let tmpVault: string

  beforeEach(() => {
    tmpVault = mkdtempSync(join(tmpdir(), 'vault-graphsum-'))
    mkdirSync(join(tmpVault, '_state', 'graph'), { recursive: true })
    mockGetVaultPath.mockReturnValue(tmpVault)
  })

  afterEach(() => {
    rmSync(tmpVault, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  describe('buildGraphSummary (pure function)', () => {
    it('空 graph → 全部 0, 无 broken links', () => {
      const s = buildGraphSummary({
        nodes: [],
        edges: [],
        updated_at: 0
      })
      expect(s.totalNodes).toBe(0)
      expect(s.totalEdges).toBe(0)
      expect(s.fileNodes).toBe(0)
      expect(s.entityNodes).toBe(0)
      expect(s.orphanFiles).toBe(0)
      expect(s.brokenLinks).toBe(0)
      expect(s.topDomains).toEqual([])
    })

    it('正常 graph → 计数正确, topDomains 排序', () => {
      const s = buildGraphSummary({
        nodes: [
          { id: 'a.md', title: 'A', tags: ['合同'], edge_count: 2 },
          { id: 'b.md', title: 'B', tags: ['合同'], edge_count: 1 },
          { id: 'c.md', title: 'C', tags: ['AI'], edge_count: 0 },
          { id: 'd.md', title: 'D', tags: [], edge_count: 1 },
          { id: 'entity:1', title: '人', is_entity: true, edge_count: 5 }
        ],
        edges: [
          { source: 'a.md', target: 'b.md', relation: 'shared_tag', weight: 1 },
          { source: 'a.md', target: 'd.md', relation: 'shared_tag', weight: 1 }
        ],
        updated_at: 0
      })
      expect(s.totalNodes).toBe(5)
      expect(s.fileNodes).toBe(4)
      expect(s.entityNodes).toBe(1)
      expect(s.orphanFiles).toBe(1) // c.md has edge_count=0; d.md has edge_count=1
      expect(s.brokenLinks).toBe(0)
      // topDomains: 合同(2) > AI(1)
      expect(s.topDomains[0]).toEqual({ name: '合同', count: 2 })
      expect(s.topDomains[1]).toEqual({ name: 'ai', count: 1 })
    })

    it('broken link: edge target 不在 nodes → 计入 broken', () => {
      const s = buildGraphSummary({
        nodes: [{ id: 'a.md', title: 'A', tags: [], edge_count: 1 }],
        edges: [{ source: 'a.md', target: 'missing.md', relation: 'typed_link', weight: 1 }],
        updated_at: 0
      })
      expect(s.brokenLinks).toBe(1)
      expect(s.brokenLinkSamples).toEqual([{ source: 'a.md', target: 'missing.md' }])
    })

    it('brokenLinkSamples 截断到 20', () => {
      const edges = Array.from({ length: 30 }, (_, i) => ({
        source: 'a.md',
        target: `missing-${i}.md`,
        relation: 'typed_link' as const,
        weight: 1
      }))
      const s = buildGraphSummary({
        nodes: [{ id: 'a.md', title: 'A', tags: [], edge_count: edges.length }],
        edges,
        updated_at: 0
      })
      expect(s.brokenLinks).toBe(30)
      expect(s.brokenLinkSamples).toHaveLength(20)
    })
  })

  describe('writeGraphSummary', () => {
    it('vault 未打开时静默不写', async () => {
      mockGetVaultPath.mockReturnValue('')
      await expect(writeGraphSummary()).resolves.toBeUndefined()
    })

    it('graph 还没生成时不写 (loadGraph 返 null)', async () => {
      mockLoadGraph.mockResolvedValue(null)
      await writeGraphSummary()
      // _state/graph/SUMMARY.json 不应存在
      const fp = join(tmpVault, '_state', 'graph', 'SUMMARY.json')
      expect(() => readFileSync(fp)).toThrow()
    })

    it('正常 graph → 写 _state/graph/SUMMARY.json', async () => {
      mockLoadGraph.mockResolvedValue({
        nodes: [{ id: 'a.md', title: 'A', tags: ['合同'], edge_count: 1 }],
        edges: [{ source: 'a.md', target: 'b.md', relation: 'shared_tag', weight: 1 }],
        updated_at: 1234567890
      })
      // b.md 不在 nodes → 1 broken
      await writeGraphSummary()
      const fp = join(tmpVault, '_state', 'graph', 'SUMMARY.json')
      const raw = readFileSync(fp, 'utf-8')
      const json = JSON.parse(raw)
      expect(json.totalNodes).toBe(1)
      expect(json.totalEdges).toBe(1)
      expect(json.brokenLinks).toBe(1)
      expect(json.source).toBe('../.xiaoyuan/graph.json')
      expect(json.updatedAt).toMatch(/T.*Z$/)
    })
  })
})
