/**
 * template.test.ts — 文件模板生成 + 触碰 frontmatter
 *
 * 2026-07-03 audit N8 后续
 *  - 新建 _wiki 文件时调用, 模板错 = 新文件错
 *  - 2 导出函数, 纯函数
 */
import { describe, it, expect } from 'vitest'
import { generateFileTemplate, touchFrontmatter } from './template'

describe('generateFileTemplate', () => {
  it('returns a markdown string with frontmatter', () => {
    const out = generateFileTemplate('My Note')
    expect(out).toMatch(/^---\n/)
    expect(out).toContain('# My Note')
    expect(out).toContain('## Open Threads')
    expect(out).toContain('## See Also')
  })

  it('includes title in frontmatter', () => {
    const out = generateFileTemplate('My Note')
    expect(out).toMatch(/title: My Note/)
  })

  it('defaults type to "note"', () => {
    const out = generateFileTemplate('My Note')
    expect(out).toMatch(/type: note/)
  })

  it('uses provided type', () => {
    const out = generateFileTemplate('My Meeting', 'meeting')
    expect(out).toMatch(/type: meeting/)
  })

  it('meeting type adds status: active', () => {
    const out = generateFileTemplate('My Meeting', 'meeting')
    expect(out).toMatch(/status: active/)
  })

  it('non-meeting types do NOT add status', () => {
    const out = generateFileTemplate('My Note', 'research')
    expect(out).not.toMatch(/status:/)
  })

  it('includes created + updated dates in YYYY-MM-DD', () => {
    const out = generateFileTemplate('My Note')
    expect(out).toMatch(/created: \d{4}-\d{2}-\d{2}/)
    expect(out).toMatch(/updated: \d{4}-\d{2}-\d{2}/)
  })

  it('includes empty tags array', () => {
    const out = generateFileTemplate('My Note')
    expect(out).toMatch(/tags: \[\]/)
  })
})

describe('touchFrontmatter', () => {
  it('updates the updated field to today', () => {
    const today = new Date().toISOString().slice(0, 10)
    const r = touchFrontmatter({ title: 'foo' })
    expect(r.updated).toBe(today)
  })

  it('preserves all other fields', () => {
    const r = touchFrontmatter({ title: 'foo', type: 'note', tags: ['a', 'b'] })
    expect(r.title).toBe('foo')
    expect(r.type).toBe('note')
    expect(r.tags).toEqual(['a', 'b'])
  })

  it('does not mutate input', () => {
    const orig = { title: 'foo', updated: '2020-01-01' }
    const r = touchFrontmatter(orig)
    expect(orig.updated).toBe('2020-01-01')  // 原对象未改
    expect(r.updated).not.toBe('2020-01-01')
  })

  it('adds updated even if not present', () => {
    const r = touchFrontmatter({ title: 'foo' } as any)
    expect(r.updated).toBeDefined()
  })
})
