/**
 * parse.test.ts — frontmatter 解析/序列化/标题提取
 *
 * 2026-07-03 audit N8 后续: services 层纯函数补测
 *  - frontmatter 解析错 = 整个 markdown 文件坏, 是 renderer 数据核心
 *  - 已导出的纯函数, 无 electron 依赖
 */
import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  stringifyFrontmatter,
  applyFrontmatter,
  extractDisplayTitle
} from './parse'

describe('parseFrontmatter', () => {
  it('returns empty frontmatter when no --- block', () => {
    const r = parseFrontmatter('hello world')
    expect(r.frontmatter).toEqual({})
    expect(r.content).toBe('hello world')
  })

  it('parses simple key-value', () => {
    const r = parseFrontmatter('---\ntitle: foo\n---\n\nbody')
    expect(r.frontmatter.title).toBe('foo')
    expect(r.content).toBe('body')
  })

  it('coerces boolean, int, float', () => {
    const r = parseFrontmatter('---\npub: true\npriv: false\nn: 42\npi: 3.14\n---\n')
    expect(r.frontmatter.pub).toBe(true)
    expect(r.frontmatter.priv).toBe(false)
    expect(r.frontmatter.n).toBe(42)
    expect(r.frontmatter.pi).toBe(3.14)
  })

  it('parses inline array', () => {
    const r = parseFrontmatter('---\ntags: [a, b, c]\n---\n')
    expect(r.frontmatter.tags).toEqual(['a', 'b', 'c'])
  })

  it('parses multi-line array', () => {
    const r = parseFrontmatter('---\ntags:\n  - alpha\n  - beta\n  - gamma\n---\n')
    expect(r.frontmatter.tags).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('strips surrounding quotes from string values', () => {
    const r = parseFrontmatter('---\ntitle: "hello"\n---\n')
    expect(r.frontmatter.title).toBe('hello')
  })

  it('ignores keys with non-word chars (current behavior, flat schema only)', () => {
    // 设计: frontmatter 全部扁平 (类型: 线索, 创建: 2026, etc)
    // 实际数据无嵌套键. 'author.name' 不被识别, 静默跳过
    // 如未来要支持嵌套, 需改 regex `(\w+)` → `([^:]+)` + setValue 递归
    const r = parseFrontmatter('---\nauthor.name: xiaoxin\n---\n')
    expect(r.frontmatter).toEqual({})
  })

  it('handles --- without trailing newline', () => {
    const r = parseFrontmatter('---\ntitle: foo\n---')
    expect(r.frontmatter.title).toBe('foo')
  })
})

describe('stringifyFrontmatter', () => {
  it('serializes key-value', () => {
    expect(stringifyFrontmatter({ title: 'foo' })).toBe('title: foo')
  })

  it('serializes arrays in multi-line form', () => {
    const out = stringifyFrontmatter({ tags: ['a', 'b'] })
    expect(out).toContain('tags:')
    expect(out).toContain('  - "a"')
    expect(out).toContain('  - "b"')
  })

  it('skips null and undefined', () => {
    expect(stringifyFrontmatter({ a: 1, b: null, c: undefined })).toBe('a: 1')
  })

  it('skips nested objects (flat serialization limitation)', () => {
    expect(stringifyFrontmatter({ author: { name: 'x' } })).toBe('')
  })
})

describe('applyFrontmatter', () => {
  it('replaces existing frontmatter', () => {
    const out = applyFrontmatter('---\nold: 1\n---\n\nbody', { new: 2 })
    expect(out).toMatch(/^---\n/)
    expect(out).toContain('new: 2')
    expect(out).not.toContain('old: 1')
    expect(out).toContain('body')
  })

  it('adds frontmatter to content without --- block', () => {
    const out = applyFrontmatter('just body', { title: 'foo' })
    expect(out).toMatch(/^---\ntitle: foo\n---\n\njust body$/)
  })

  it('returns body when frontmatter is empty', () => {
    const out = applyFrontmatter('---\nold: 1\n---\n\nbody', {})
    expect(out).toBe('body')
  })
})

describe('extractDisplayTitle', () => {
  it('uses frontmatter title first', () => {
    expect(extractDisplayTitle('---\ntitle: FM Title\n---\n\n# H1', 'file.md')).toBe('FM Title')
  })

  it('falls back to first H1', () => {
    expect(extractDisplayTitle('# My H1\n\nbody', 'file.md')).toBe('My H1')
  })

  it('falls back to first H2 when no H1', () => {
    expect(extractDisplayTitle('## My H2\n\nbody', 'file.md')).toBe('My H2')
  })

  it('falls back to filename without .md', () => {
    expect(extractDisplayTitle('no headings here', 'mynote.md')).toBe('mynote')
  })

  it('returns Untitled when no source', () => {
    expect(extractDisplayTitle('nothing')).toBe('Untitled')
  })
})
