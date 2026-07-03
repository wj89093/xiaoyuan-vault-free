/**
 * links.test.ts — wiki link 提取 / 跨 vault 链接 / 类型化关系
 *
 * 2026-07-03 audit N8 后续
 *  - wiki link 渲染是 renderer 核心, 解析错 = 链接死链
 *  - 4 个导出函数, 纯字符串处理, 无 fs/electron
 */
import { describe, it, expect } from 'vitest'
import {
  extractWikiLinks,
  extractTypedLinks,
  addRelationship
} from './links'

describe('extractWikiLinks', () => {
  it('returns empty array when no links', () => {
    expect(extractWikiLinks('plain text')).toEqual([])
  })

  it('extracts single link', () => {
    expect(extractWikiLinks('see [[Page A]] for details')).toEqual(['Page A'])
  })

  it('extracts multiple links', () => {
    expect(extractWikiLinks('[[A]] and [[B]] and [[C]]')).toEqual(['A', 'B', 'C'])
  })

  it('strips display title after |', () => {
    expect(extractWikiLinks('[[Page|display title here]]')).toEqual(['Page'])
  })

  it('handles spaces around link', () => {
    expect(extractWikiLinks('text [[  Spaced  ]] more')).toEqual(['Spaced'])
  })

  it('handles nested brackets in surrounding text', () => {
    expect(extractWikiLinks('before [[X]] middle [[Y]] after')).toEqual(['X', 'Y'])
  })
})


describe('extractTypedLinks', () => {
  it('extracts typed link [[type:target]]', () => {
    const r = extractTypedLinks('[[invested_in:Acme Corp]]')
    expect(r).toEqual([{ type: 'invested_in', target: 'Acme Corp', confidence: 'EXTRACTED' }])
  })

  it('handles space after colon', () => {
    const r = extractTypedLinks('[[works_at: Acme]]')
    expect(r).toEqual([{ type: 'works_at', target: 'Acme', confidence: 'EXTRACTED' }])
  })

  it('lowercases type', () => {
    const r = extractTypedLinks('[[Founded:Acme]]')
    expect(r[0].type).toBe('founded')
  })

  it('ignores plain wiki links (no type: prefix)', () => {
    expect(extractTypedLinks('[[plain]]')).toEqual([])
  })

  it('ignores cross-vault links (中文 prefix not matched)', () => {
    expect(extractTypedLinks('[[个人:foo]]')).toEqual([])
  })

  it('extracts multiple typed links', () => {
    const r = extractTypedLinks('[[a:X]] [[b:Y]] [[c:Z]]')
    expect(r).toHaveLength(3)
  })
})

describe('addRelationship', () => {
  it('adds to empty existing list', () => {
    const r = addRelationship(undefined, 'invested_in', 'Acme')
    expect(r).toEqual([{ type: 'invested_in', target: 'Acme', confidence: 'EXTRACTED' }])
  })

  it('adds to existing list', () => {
    const existing = [{ type: 'a', target: 'X', confidence: 'EXTRACTED' as const }]
    const r = addRelationship(existing, 'b', 'Y')
    expect(r).toHaveLength(2)
  })

  it('dedups same type+target', () => {
    const existing = [{ type: 'a', target: 'X', confidence: 'INFERRED' as const }]
    const r = addRelationship(existing, 'a', 'X', 'EXTRACTED')
    expect(r).toHaveLength(1)
    expect(r[0].confidence).toBe('INFERRED')  // 保留原 confidence
  })

  it('allows different type to same target', () => {
    const existing = [{ type: 'a', target: 'X', confidence: 'EXTRACTED' as const }]
    const r = addRelationship(existing, 'b', 'X')
    expect(r).toHaveLength(2)
  })

  it('default confidence is EXTRACTED', () => {
    const r = addRelationship(undefined, 'a', 'b')
    expect(r[0].confidence).toBe('EXTRACTED')
  })
})
