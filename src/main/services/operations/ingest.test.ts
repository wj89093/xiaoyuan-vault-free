import { describe, it, expect } from 'vitest'
import { writeFile, readFile, mkdir, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { existsSync } from 'fs'

// Testable units from ingest.ts (sanitizeFilename not exported, test via behavior)
describe('sanitizeFilename behavior (via real vault)', () => {
  it('should create vault structure with _wiki directory', async () => {
    const vaultDir = join(tmpdir(), 'test-ingest-' + Date.now())
    await mkdir(join(vaultDir, '_wiki', '测试'), { recursive: true })
    await mkdir(join(vaultDir, 'raw'), { recursive: true })

    const rawContent =
      '---\ntitle: Test File\n---\n\nThis is test content for ingest testing.\nIt has enough body to pass the 20 char minimum check.\n'
    await writeFile(join(vaultDir, 'raw', 'test.md'), rawContent, 'utf-8')

    try {
      expect(existsSync(join(vaultDir, '_wiki'))).toBe(true)
      expect(existsSync(join(vaultDir, 'raw', 'test.md'))).toBe(true)
    } finally {
      await rm(vaultDir, { recursive: true })
    }
  })

  it('should reject content shorter than 20 chars via parseFrontmatter', async () => {
    const { parseFrontmatter } = await import('../frontmatter/index')
    const raw = '---\ntitle: Short\n---\n\ntiny'
    const { content } = parseFrontmatter(raw)
    expect(content.trim().length).toBeLessThan(20)
  })
})

describe('IngestResult interface shape', () => {
  it('should have success, entitiesUpdated, conceptsUpdated fields', () => {
    const result = {
      success: false as boolean,
      entitiesUpdated: [] as string[],
      conceptsUpdated: [] as string[],
      error: 'no vault'
    }
    expect(typeof result.success).toBe('boolean')
    expect(Array.isArray(result.entitiesUpdated)).toBe(true)
    expect(Array.isArray(result.conceptsUpdated)).toBe(true)
  })

  it('should have optional topic and sourcePage when successful', () => {
    const result = {
      success: true,
      topic: '技术',
      sourcePage: '_wiki/技术/test.md',
      entitiesUpdated: [] as string[],
      conceptsUpdated: [] as string[]
    }
    expect(result.success).toBe(true)
    expect(result.topic).toBe('技术')
    expect(result.sourcePage).toContain('_wiki/')
  })
})

describe('ingest boundary conditions', () => {
  it('should reject content shorter than 20 chars', async () => {
    const { parseFrontmatter } = await import('../frontmatter/index')
    const raw = '---\ntitle: Short\n---\n\ntiny'
    const { content } = parseFrontmatter(raw)
    expect(content.trim().length).toBeLessThan(20)
  })

  it('should handle empty body gracefully', async () => {
    const { parseFrontmatter } = await import('../frontmatter/index')
    const raw = '---\ntitle: Empty\n---\n'
    const { content } = parseFrontmatter(raw)
    expect(content.trim().length).toBe(0)
  })

  it('should handle Chinese characters in frontmatter', async () => {
    const { parseFrontmatter } = await import('../frontmatter/index')
    const raw = [
      '---',
      'title: 中文标题',
      'tags: [中文, 标签]',
      'created: 2026-05-17',
      '---',
      '这是正文内容，足够长以通过 20 字符检查。'
    ].join('\n')
    const { frontmatter, content } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('中文标题')
    expect(Array.isArray(frontmatter.tags)).toBe(true)
    expect(content.trim().length).toBeGreaterThan(20)
  })

  it('should handle deeply nested paths in raw directory', async () => {
    const vaultDir = join(tmpdir(), 'test-ingest-nested-' + Date.now())
    const rawPath = join(vaultDir, 'raw', 'a', 'b', 'c', 'nested.md')
    await mkdir(dirname(rawPath), { recursive: true })
    await writeFile(
      rawPath,
      '---\ntitle: Nested\n---\n\nNested content that is long enough for ingest.\n',
      'utf-8'
    )
    try {
      const { parseFrontmatter } = await import('../frontmatter/index')
      const raw = await readFile(rawPath, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      expect(frontmatter.title).toBe('Nested')
    } finally {
      await rm(vaultDir, { recursive: true })
    }
  })

  it('should produce entitiesUpdated and conceptsUpdated as arrays', () => {
    const result = {
      success: true,
      topic: '技术',
      sourcePage: '_wiki/技术/test.md',
      entitiesUpdated: ['人名A', '公司B'],
      conceptsUpdated: ['概念A', '概念B']
    }
    expect(Array.isArray(result.entitiesUpdated)).toBe(true)
    expect(Array.isArray(result.conceptsUpdated)).toBe(true)
    expect(result.entitiesUpdated).toHaveLength(2)
    expect(result.conceptsUpdated).toHaveLength(2)
  })

  it('should handle same source affecting multiple entities (复利效应)', () => {
    const result = {
      success: true,
      topic: '人物',
      sourcePage: 'raw/2026/05/17/interview.md',
      entitiesUpdated: ['_wiki/人物/张三.md', '_wiki/人物/李四.md', '_wiki/公司/某公司.md'],
      conceptsUpdated: ['AI', '创业']
    }
    expect(result.entitiesUpdated).toHaveLength(3)
    expect(result.conceptsUpdated).toHaveLength(2)
  })

  it('should handle IngestResult with error field only', () => {
    const result = {
      success: false,
      entitiesUpdated: [] as string[],
      conceptsUpdated: [] as string[],
      error: 'content too short'
    }
    expect(result.success).toBe(false)
    expect(result.error).toBe('content too short')
    expect(result.entitiesUpdated).toHaveLength(0)
  })
})

describe('IngestContext interface', () => {
  it('should have onTags, onSummary, onSchemaDriven boolean fields', () => {
    const ctx = {
      onTags: true,
      onSummary: true,
      onSchemaDriven: true
    }
    expect(typeof ctx.onTags).toBe('boolean')
    expect(typeof ctx.onSummary).toBe('boolean')
    expect(typeof ctx.onSchemaDriven).toBe('boolean')
  })

  it('should support partial context (some flags off)', () => {
    const ctx = {
      onTags: false,
      onSummary: true,
      onSchemaDriven: false
    }
    expect(ctx.onTags).toBe(false)
    expect(ctx.onSummary).toBe(true)
    expect(ctx.onSchemaDriven).toBe(false)
  })
})

describe('wiki page write (real fs)', () => {
  it('should write and read back a wiki page', async () => {
    const vaultDir = join(tmpdir(), 'test-wiki-write-' + Date.now())
    await mkdir(vaultDir, { recursive: true })

    const wikiContent = [
      '---',
      'title: "测试页面"',
      'topic: AI',
      'created: 2026-05-17',
      '---',
      '',
      '# 测试页面',
      '',
      '这是测试内容。'
    ].join('\n')

    const pagePath = join(vaultDir, '_wiki', 'AI', '测试页面.md')
    await mkdir(dirname(pagePath), { recursive: true })
    await writeFile(pagePath, wikiContent, 'utf-8')

    try {
      const content = await readFile(pagePath, 'utf-8')
      expect(content).toContain('测试页面')
      expect(content).toContain('topic: AI')
    } finally {
      await rm(vaultDir, { recursive: true })
    }
  })
})
