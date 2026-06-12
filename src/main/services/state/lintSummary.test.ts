/**
 * lintSummary.test.ts — _state/lint/SUMMARY.json
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockGetVaultPath = vi.fn<() => string>(() => '')
vi.mock('../database/database', () => ({
  getVaultPath: () => mockGetVaultPath()
}))

const mockGetLintReports = vi.fn<() => Promise<any[]>>()
vi.mock('../lint/lintReports', () => ({
  getLintReports: () => mockGetLintReports()
}))

const { buildLintSummary, writeLintSummary } = await import('./lintSummary')

describe('v1.9 lint/SUMMARY.json (AI-readable lint health)', () => {
  let tmpVault: string

  beforeEach(() => {
    tmpVault = mkdtempSync(join(tmpdir(), 'vault-lintsum-'))
    mkdirSync(join(tmpVault, '_state', 'lint'), { recursive: true })
    mockGetVaultPath.mockReturnValue(tmpVault)
  })

  afterEach(() => {
    rmSync(tmpVault, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  describe('buildLintSummary (pure function)', () => {
    it('空 reports → 全 0, lastRunAt=null', () => {
      const s = buildLintSummary([])
      expect(s.totalFiles).toBe(0)
      expect(s.lastRunAt).toBeNull()
      expect(s.issues.deadLinks).toBe(0)
      expect(s.issues.orphanPages).toBe(0)
      expect(s.pendingFixes).toBe(0)
      expect(s.fixSuggestionsByType).toEqual({})
      expect(s.recentRuns).toEqual([])
    })

    it('正常 report → 计数 + pendingFixes + byType 正确', () => {
      const s = buildLintSummary([
        {
          timestamp: 1718000000000,
          totalFiles: 100,
          orphanPages: [{ path: 'a.md', title: 'A' }],
          stalePages: [
            { path: 'b.md', title: 'B', daysSinceUpdate: 120 },
            { path: 'c.md', title: 'C', daysSinceUpdate: 200 }
          ],
          deadLinks: [
            { fromPath: 'd.md', fromTitle: 'D', deadTarget: 'missing' },
            { fromPath: 'e.md', fromTitle: 'E', deadTarget: 'also-missing' },
            { fromPath: 'f.md', fromTitle: 'F', deadTarget: 'third' }
          ],
          missingFields: [{ path: 'g.md', title: 'G', missing: ['type'] }],
          contradictions: [],
          summary: '',
          wikiHealth: 'fair',
          conceptGaps: [{ mentionedAs: 'X', foundIn: [], severity: 'high' }],
          suggestedLinks: [
            { fromPath: 'h.md', fromTitle: 'H', toTitle: 'I', reason: '', severity: 'medium' }
          ],
          fixSuggestions: [
            { issueType: 'deadLink', action: 'fix', suggestion: '' },
            { issueType: 'deadLink', action: 'fix', suggestion: '' },
            { issueType: 'deadLink', action: 'ignore', suggestion: '' },
            { issueType: 'missingField', action: 'fix', suggestion: '' }
          ],
          savedAt: 1718000000000
        }
      ])
      expect(s.totalFiles).toBe(100)
      expect(s.lastRunAt).toBe(1718000000000)
      expect(s.issues.orphanPages).toBe(1)
      expect(s.issues.stalePages).toBe(2)
      expect(s.issues.deadLinks).toBe(3)
      expect(s.issues.missingFields).toBe(1)
      expect(s.issues.contradictions).toBe(0)
      expect(s.issues.conceptGaps).toBe(1)
      expect(s.issues.suggestedLinks).toBe(1)
      // pendingFixes: 3 个 action='fix' (2 deadLink + 1 missingField)
      expect(s.pendingFixes).toBe(3)
      // byType: deadLink=3 (含 ignore), missingField=1
      expect(s.fixSuggestionsByType).toEqual({ deadLink: 3, missingField: 1 })
      expect(s.recentRuns).toEqual([new Date(1718000000000).toISOString()])
    })

    it('多个 reports → recentRuns 最多 5 个 (新→旧)', () => {
      // reports 按时间升序 (saveLintReport 内部 prepend 后存, 但 buildLintSummary 接收任意顺序)
      // 最新在最后, 我们用 reverse 模拟 newest-first
      const reports = Array.from({ length: 8 }, (_, i) => ({
        timestamp: 1718000000000 + i * 1000,
        totalFiles: 10,
        orphanPages: [],
        stalePages: [],
        deadLinks: [],
        missingFields: [],
        contradictions: [],
        summary: '',
        wikiHealth: '',
        conceptGaps: [],
        suggestedLinks: [],
        fixSuggestions: [],
        savedAt: 0
      })).reverse()
      const s = buildLintSummary(reports)
      expect(s.recentRuns).toHaveLength(5)
      // 最新在前 (reports[0] = timestamp 1718000007000)
      expect(s.recentRuns[0]).toBe(new Date(1718000000000 + 7 * 1000).toISOString())
    })
  })

  describe('writeLintSummary', () => {
    it('vault 未打开时静默不写', async () => {
      mockGetVaultPath.mockReturnValue('')
      await expect(writeLintSummary()).resolves.toBeUndefined()
    })

    it('空 reports → 写 totalFiles=0 的 SUMMARY', async () => {
      mockGetLintReports.mockResolvedValue([])
      await writeLintSummary()
      const raw = readFileSync(join(tmpVault, '_state', 'lint', 'SUMMARY.json'), 'utf-8')
      const json = JSON.parse(raw)
      expect(json.totalFiles).toBe(0)
      expect(json.lastRunAt).toBeNull()
      expect(json.updatedAt).toMatch(/T.*Z$/)
    })

    it('正常 reports → 写 _state/lint/SUMMARY.json', async () => {
      mockGetLintReports.mockResolvedValue([
        {
          timestamp: 1718000000000,
          totalFiles: 50,
          orphanPages: [],
          stalePages: [],
          deadLinks: [{ fromPath: 'a.md', fromTitle: 'A', deadTarget: 'missing' }],
          missingFields: [],
          contradictions: [],
          summary: '',
          wikiHealth: '',
          conceptGaps: [],
          suggestedLinks: [],
          fixSuggestions: [{ issueType: 'deadLink', action: 'fix', suggestion: '' }],
          savedAt: 0
        }
      ])
      await writeLintSummary()
      const raw = readFileSync(join(tmpVault, '_state', 'lint', 'SUMMARY.json'), 'utf-8')
      const json = JSON.parse(raw)
      expect(json.totalFiles).toBe(50)
      expect(json.issues.deadLinks).toBe(1)
      expect(json.pendingFixes).toBe(1)
      expect(json.fixSuggestionsByType).toEqual({ deadLink: 1 })
    })
  })
})
