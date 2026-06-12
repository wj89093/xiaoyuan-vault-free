/**
 * stateMap.test.ts — _state/STATE_MAP.json 写入测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Mock database BEFORE importing stateMap
const mockGetVaultPath = vi.fn<() => string>(() => '')
vi.mock('../database/database', () => ({
  getVaultPath: () => mockGetVaultPath()
}))

const { getStateMapEntries, writeStateMap } = await import('./stateMap')

describe('v1.9 STATE_MAP.json (AI-visible vault state map)', () => {
  let tmpVault: string

  beforeEach(() => {
    tmpVault = mkdtempSync(join(tmpdir(), 'vault-statemap-'))
    // 模拟 vault 内部有 _state/ + .xiaoyuan/ 各放一个文件
    mkdirSync(join(tmpVault, '_state'), { recursive: true })
    mkdirSync(join(tmpVault, '.xiaoyuan'), { recursive: true })
    writeFileSync(
      join(tmpVault, '_state', 'VAULT_STATE.json'),
      '{"updatedAt":"2026-06-12T00:00:00Z"}',
      'utf-8'
    )
    writeFileSync(join(tmpVault, '.xiaoyuan', 'graph.json'), '{"nodes":[],"edges":[]}', 'utf-8')
    mockGetVaultPath.mockReturnValue(tmpVault)
  })

  afterEach(() => {
    rmSync(tmpVault, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('getStateMapEntries: 列出所有已知 state 文件 + categories', () => {
    const { files, categories } = getStateMapEntries()
    expect(files.length).toBeGreaterThanOrEqual(10)
    expect(files.find((f) => f.name === 'VAULT_STATE')).toBeTruthy()
    expect(files.find((f) => f.name === 'FS_CACHE')).toBeTruthy()
    expect(files.find((f) => f.name === 'GRAPH')).toBeTruthy()
    // 分类: AI 入门应包含 VAULT_STATE + FS_CACHE
    const aiEntry = categories['AI 入门 (先读这两个)']
    expect(aiEntry).toContain('VAULT_STATE')
    expect(aiEntry).toContain('FS_CACHE')
  })

  it('writeStateMap: 写 _state/STATE_MAP.json, exists=true 的文件有 size + updatedAt', async () => {
    await writeStateMap()
    const mapPath = join(tmpVault, '_state', 'STATE_MAP.json')
    const raw = readFileSync(mapPath, 'utf-8')
    const map = JSON.parse(raw)
    expect(map.vault.path).toBe(tmpVault)
    expect(map.stateDir).toBe('_state/')
    expect(Array.isArray(map.files)).toBe(true)

    const vaultState = map.files.find((f: any) => f.name === 'VAULT_STATE')
    expect(vaultState.exists).toBe(true)
    expect(vaultState.sizeBytes).toBeGreaterThan(0)
    expect(vaultState.updatedAt).toMatch(/T.*Z$/)

    const graph = map.files.find((f: any) => f.name === 'GRAPH')
    expect(graph.exists).toBe(true)
    expect(graph.sizeBytes).toBeGreaterThan(0)

    // 不存在的文件 (e.g. SCHEMAS) exists=false
    const schemas = map.files.find((f: any) => f.name === 'SCHEMAS')
    expect(schemas.exists).toBe(false)
    expect(schemas.sizeBytes).toBeUndefined()
  })

  it('writeStateMap: vault 未打开时静默不写 (no throw)', async () => {
    mockGetVaultPath.mockReturnValue('')
    await expect(writeStateMap()).resolves.toBeUndefined()
  })

  it('writeStateMap: JSON 形态完整, 包含 updatedAt + categories', async () => {
    await writeStateMap()
    const raw = readFileSync(join(tmpVault, '_state', 'STATE_MAP.json'), 'utf-8')
    const map = JSON.parse(raw)
    expect(map.updatedAt).toMatch(/T.*Z$/)
    expect(map.categories['知识图谱']).toContain('GRAPH')
    expect(map.categories['健康检查']).toContain('LINT_REPORTS')
  })
})
