/**
 * schemasIndex.test.ts — _state/schemas/INDEX.json
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mockGetVaultPath = vi.fn<() => string>(() => '')
vi.mock('../database/database', () => ({
  getVaultPath: () => mockGetVaultPath()
}))

const mockListFolderSchemas = vi.fn<() => Promise<any[]>>()
vi.mock('../schema/schemaStorage', () => ({
  listFolderSchemas: () => mockListFolderSchemas()
}))

const { buildSchemasIndex, writeSchemasIndex } = await import('./schemasIndex')

describe('v1.9 schemas/INDEX.json (AI-readable schema catalog)', () => {
  let tmpVault: string

  beforeEach(() => {
    tmpVault = mkdtempSync(join(tmpdir(), 'vault-schemas-'))
    mkdirSync(join(tmpVault, '_state', 'schemas'), { recursive: true })
    mockGetVaultPath.mockReturnValue(tmpVault)
  })

  afterEach(() => {
    rmSync(tmpVault, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  describe('buildSchemasIndex (pure function)', () => {
    it('空 schema 列表 → total=0', () => {
      const idx = buildSchemasIndex([])
      expect(idx.total).toBe(0)
      expect(idx.confirmed).toBe(0)
      expect(idx.pending).toBe(0)
      expect(idx.entries).toEqual([])
    })

    it('多个 schema → 计数 + 排序正确', () => {
      const idx = buildSchemasIndex([
        {
          folder: '合同',
          version: '1.0',
          confirmed: true,
          description: '合同领域',
          fields: [
            { key: '甲方', label: '甲方', type: 'text', description: '', extractHint: '' },
            { key: '金额', label: '金额', type: 'number', description: '', extractHint: '' }
          ],
          createdAt: 1000,
          confirmedAt: 1100,
          updatedAt: 2000
        },
        {
          folder: 'AI',
          version: '1.0',
          confirmed: false,
          description: 'AI 领域',
          fields: [
            { key: 'tags', label: 'Tags', type: 'multi-select', description: '', extractHint: '' }
          ],
          createdAt: 500,
          updatedAt: 3000
        }
      ])
      expect(idx.total).toBe(2)
      expect(idx.confirmed).toBe(1)
      expect(idx.pending).toBe(1)
      // 排序: updatedAt 降序 → AI(3000) 在前
      expect(idx.entries[0].folder).toBe('AI')
      expect(idx.entries[1].folder).toBe('合同')
      // fieldNames 只列 key
      expect(idx.entries[0].fieldNames).toEqual(['tags'])
      expect(idx.entries[1].fieldNames).toEqual(['甲方', '金额'])
    })

    it('source 路径包含 folder 名 (sanitized)', () => {
      const idx = buildSchemasIndex([
        {
          folder: '6-概念',
          version: '1.0',
          confirmed: true,
          description: '',
          fields: [],
          createdAt: 0
        }
      ])
      expect(idx.entries[0].source).toBe('.xiaoyuan/schemas/6-概念.json')
    })
  })

  describe('writeSchemasIndex', () => {
    it('vault 未打开时静默不写', async () => {
      mockGetVaultPath.mockReturnValue('')
      await expect(writeSchemasIndex()).resolves.toBeUndefined()
    })

    it('正常 schema 列表 → 写 _state/schemas/INDEX.json', async () => {
      mockListFolderSchemas.mockResolvedValue([
        {
          folder: '合同',
          version: '1.0',
          confirmed: true,
          description: '合同领域',
          fields: [
            { key: '金额', label: '金额', type: 'number', description: '', extractHint: '' }
          ],
          createdAt: 1000
        }
      ])
      await writeSchemasIndex()
      const raw = readFileSync(join(tmpVault, '_state', 'schemas', 'INDEX.json'), 'utf-8')
      const json = JSON.parse(raw)
      expect(json.total).toBe(1)
      expect(json.confirmed).toBe(1)
      expect(json.entries[0].folder).toBe('合同')
      expect(json.entries[0].fieldNames).toEqual(['金额'])
      expect(json.sourceFormat).toBe('.xiaoyuan/schemas/<folder>.json')
      expect(json.updatedAt).toMatch(/T.*Z$/)
    })

    it('空 schema 列表 → 写 total=0 的 INDEX', async () => {
      mockListFolderSchemas.mockResolvedValue([])
      await writeSchemasIndex()
      const raw = readFileSync(join(tmpVault, '_state', 'schemas', 'INDEX.json'), 'utf-8')
      const json = JSON.parse(raw)
      expect(json.total).toBe(0)
      expect(json.entries).toEqual([])
    })
  })
})
