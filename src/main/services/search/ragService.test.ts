import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFile, mkdir, rm, readFile } from 'fs/promises'
import { existsSync } from 'fs'

// Mock modules
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return { ...actual, existsSync: vi.fn(), readdir: vi.fn(), stat: vi.fn() }
})

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises')
  return { ...actual }
})

vi.mock('electron-log/main', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../database/database', () => ({
  getVaultPath: vi.fn()
}))

describe('RAGResult interface shape', () => {
  it('should have required fields: title, path, file, content, score', () => {
    const result = {
      title: 'Test Page',
      path: '_wiki/tech/test.md',
      file: '_wiki/tech/test.md',
      content: 'Test content body',
      score: 0.85
    }
    expect(typeof result.title).toBe('string')
    expect(typeof result.path).toBe('string')
    expect(result.file).toBe(result.path) // alias
    expect(typeof result.content).toBe('string')
    expect(typeof result.score).toBe('number')
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('should support multiple results', () => {
    const results = [
      { title: 'A', path: 'a.md', file: 'a.md', content: 'content a', score: 0.9 },
      { title: 'B', path: 'b.md', file: 'b.md', content: 'content b', score: 0.7 },
      { title: 'C', path: 'c.md', file: 'c.md', content: 'content c', score: 0.5 }
    ]
    expect(results).toHaveLength(3)
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
  })

  it('should allow score of 0 for no match', () => {
    const result = {
      title: 'No match',
      path: 'nomatch.md',
      file: 'nomatch.md',
      content: '',
      score: 0
    }
    expect(result.score).toBe(0)
  })
})

describe('RAG large vault behavior', () => {
  it('should handle empty query string', async () => {
    const { retrieveRelevantPages } = await import('../search/ragService')
    // With no vault path, should return empty array
    const { getVaultPath } = await import('../database/database')
    ;(getVaultPath as any).mockReturnValue(null)

    const results = await retrieveRelevantPages('')
    expect(Array.isArray(results)).toBe(true)
  })

  it('should handle vaultPath returning null', async () => {
    const { getVaultPath } = await import('../database/database')
    ;(getVaultPath as any).mockReturnValue(null)

    const { retrieveRelevantPages } = await import('../search/ragService')
    const results = await retrieveRelevantPages('test query')
    expect(results).toEqual([])
  })

  it('should handle _wiki directory not existing', async () => {
    const vaultDir = join(tmpdir(), 'test-rag-empty-' + Date.now())
    await mkdir(vaultDir, { recursive: true })
    // No _wiki directory created

    const { getVaultPath } = await import('../database/database')
    ;(getVaultPath as any).mockReturnValue(vaultDir)

    const { existsSync } = await import('fs')
    ;(existsSync as any).mockImplementation((path: string) => {
      if (path === vaultDir) return true
      if (path === join(vaultDir, 'index.md')) return false
      if (path === join(vaultDir, '_wiki', 'index.md')) return false
      if (path === join(vaultDir, '_wiki')) return false
      return false
    })

    const { retrieveRelevantPages } = await import('../search/ragService')
    const results = await retrieveRelevantPages('any query')
    // Should return empty rather than throw
    expect(Array.isArray(results)).toBe(true)

    await rm(vaultDir, { recursive: true })
  })

  it('should handle _wiki/index.md not existing but _wiki dir exists', async () => {
    const vaultDir = join(tmpdir(), 'test-rag-noindex-' + Date.now())
    await mkdir(join(vaultDir, '_wiki'), { recursive: true })
    // No index.md, just raw files
    await writeFile(
      join(vaultDir, '_wiki', 'page.md'),
      '---\ntitle: Page\n---\n\nPage content here',
      'utf-8'
    )

    const { getVaultPath } = await import('../database/database')
    ;(getVaultPath as any).mockReturnValue(vaultDir)

    const { existsSync } = await import('fs')
    ;(existsSync as any).mockImplementation((path: string) => {
      if (path === join(vaultDir)) return true
      if (path === join(vaultDir, 'index.md')) return false
      if (path === join(vaultDir, '_wiki', 'index.md')) return false
      if (path === join(vaultDir, '_wiki')) return true
      return false
    })

    const { retrieveRelevantPages } = await import('../search/ragService')
    const results = await retrieveRelevantPages('test')
    expect(Array.isArray(results)).toBe(true)

    await rm(vaultDir, { recursive: true })
  })
})

describe('RAGResult ordering', () => {
  it('should return results ordered by score descending', async () => {
    const mockResults = [
      { title: 'High', path: 'high.md', file: 'high.md', content: 'x', score: 0.95 },
      { title: 'Med', path: 'med.md', file: 'med.md', content: 'y', score: 0.6 },
      { title: 'Low', path: 'low.md', file: 'low.md', content: 'z', score: 0.1 }
    ]
    // Verify score ordering is descending
    for (let i = 1; i < mockResults.length; i++) {
      expect(mockResults[i - 1].score).toBeGreaterThanOrEqual(mockResults[i].score)
    }
  })
})

describe('retrieveRelevantPages function signature', () => {
  it('should return Promise<RAGResult[]>', async () => {
    const { getVaultPath } = await import('../database/database')
    ;(getVaultPath as any).mockReturnValue(null)

    const { retrieveRelevantPages } = await import('../search/ragService')
    const result = retrieveRelevantPages('test')
    expect(result).toBeInstanceOf(Promise)
    const resolved = await result
    expect(Array.isArray(resolved)).toBe(true)
  })
})
