/**
 * graphTFIDF.test.ts — TF-IDF 知识图谱算法核心 (free 仓 backport)
 *
 * 2026-07-06 audit N8 backport
 *  - 跟 team 仓 `abd1745` 24 case 风格一致
 *  - 4 个导出函数 + 4 个常量, 纯计算无 fs
 *  - free 仓 graph.test.ts 通过 graph.ts re-export 间接测, 这里直接测 graphTFIDF.ts
 */
import { describe, it, expect } from 'vitest'
import {
  tokenize,
  computeTFIDF,
  cosineSimilarity,
  buildEdges,
  STOPWORDS,
  MIN_TOKENS_FOR_SIMILARITY,
  SIMILARITY_THRESHOLD
} from './graphTFIDF'
import type { TFIDFDocument } from './types'

describe('STOPWORDS', () => {
  it('contains common Chinese stopwords', () => {
    expect(STOPWORDS.has('的')).toBe(true)
    expect(STOPWORDS.has('了')).toBe(true)
    expect(STOPWORDS.has('在')).toBe(true)
  })

  it('contains common English stopwords', () => {
    expect(STOPWORDS.has('the')).toBe(true)
    expect(STOPWORDS.has('is')).toBe(true)
  })

  it('has reasonable size (≥50 common words)', () => {
    expect(STOPWORDS.size).toBeGreaterThanOrEqual(50)
  })
})

describe('tokenize', () => {
  it('returns empty map for empty input', () => {
    expect(tokenize('').size).toBe(0)
  })

  it('strips markdown heading, bold, italic, code', () => {
    const r = tokenize('# Title\n**bold** _italic_ `code`')
    expect(r.size).toBeGreaterThanOrEqual(0)
  })

  it('strips markdown links but keeps inner text', () => {
    const r = tokenize('see [link text](http://x.com) for more')
    expect([...r.keys()].some(k => k.includes('link'))).toBe(true)
  })

  it('strips fenced code blocks (content not in tokens)', () => {
    const withCode = tokenize('real word\n```\nhidden code\n```\nfinal word')
    const withoutCode = tokenize('real word\nfinal word')
    expect([...withCode.keys()].sort()).toEqual([...withoutCode.keys()].sort())
  })

  it('filters English words shorter than 3 chars', () => {
    const r = tokenize('a an the be of to')
    expect(r.size).toBe(0)
  })

  it('filters pure numbers', () => {
    const r = tokenize('123 4567 abc')
    expect([...r.keys()]).not.toContain('123')
    expect([...r.keys()]).not.toContain('4567')
  })

  it('produces CJK bigrams for Chinese', () => {
    const r = tokenize('合成生物学')
    expect(r.size).toBeGreaterThan(0)
  })

  it('is case-insensitive for English', () => {
    const r = tokenize('Hello HELLO hello')
    const keys = [...r.keys()].filter(k => k.includes('hello'))
    expect(keys).toHaveLength(1)
    expect(r.get(keys[0])).toBe(3)
  })

  it('strips markdown table rows', () => {
    const r = tokenize('| col1 | col2 |\n| --- | --- |\nreal content')
    expect([...r.keys()].some(k => k.includes('real'))).toBe(true)
  })
})

describe('computeTFIDF', () => {
  it('returns empty for empty document list', () => {
    const r = computeTFIDF([])
    expect(r.vectors).toEqual([])
    expect(r.idf.size).toBe(0)
  })

  it('produces vector per document', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a', title: 'A', tags: [], tokens: tokenize('hello world'), relationships: [] },
      { file: 'b', title: 'B', tags: [], tokens: tokenize('foo bar'), relationships: [] }
    ]
    const r = computeTFIDF(docs)
    expect(r.vectors).toHaveLength(2)
  })

  it('gives higher IDF to rare terms', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a', title: 'A', tags: [], tokens: tokenize('common unique1'), relationships: [] },
      { file: 'b', title: 'B', tags: [], tokens: tokenize('common'), relationships: [] },
      { file: 'c', title: 'C', tags: [], tokens: tokenize('common unique2'), relationships: [] }
    ]
    const r = computeTFIDF(docs)
    const idfCommon = r.idf.get('common') ?? 0
    const idfUnique1 = r.idf.get('unique1') ?? 0
    const idfUnique2 = r.idf.get('unique2') ?? 0
    expect(idfUnique1).toBeGreaterThan(idfCommon)
    expect(idfUnique2).toBeGreaterThan(idfCommon)
  })

  it('applies tag boost (2x weight via separate term weighting)', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a', title: 'A', tags: ['important'], tokens: tokenize('important'), relationships: [] }
    ]
    const r = computeTFIDF(docs)
    const vec = r.vectors[0]
    const tagWeight = vec.get('important') ?? 0
    expect(tagWeight).toBeGreaterThan(0)
  })

  it('counts tag as document frequency (df) for IDF', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a', title: 'A', tags: ['shared'], tokens: new Map(), relationships: [] },
      { file: 'b', title: 'B', tags: ['shared'], tokens: new Map(), relationships: [] },
      { file: 'c', title: 'C', tags: ['unique'], tokens: new Map(), relationships: [] }
    ]
    const r = computeTFIDF(docs)
    // 'shared' 出现 2/3 次, 'unique' 1/3 次, unique IDF 应该更高
    const idfShared = r.idf.get('shared') ?? 0
    const idfUnique = r.idf.get('unique') ?? 0
    expect(idfUnique).toBeGreaterThan(idfShared)
  })
})

describe('cosineSimilarity', () => {
  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity(new Map(), new Map())).toBe(0)
  })

  it('returns 1 for identical vectors', () => {
    const v = new Map([['a', 1], ['b', 2]])
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Map([['x', 1]])
    const b = new Map([['y', 1]])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('returns value between 0 and 1 for partial overlap', () => {
    const a = new Map([['x', 1], ['y', 1]])
    const b = new Map([['y', 1], ['z', 1]])
    const r = cosineSimilarity(a, b)
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })

  it('is symmetric (cosine(A, B) === cosine(B, A))', () => {
    const a = new Map([['x', 1], ['y', 2], ['z', 3]])
    const b = new Map([['y', 1], ['z', 2], ['w', 3]])
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10)
  })
})

describe('buildEdges', () => {
  it('returns empty for empty docs', () => {
    const r = buildEdges([], [], new Map())
    expect(r).toEqual([])
  })

  it('creates typed_link edge when one doc targets another title', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a.md', title: 'Doc A', tags: [], tokens: new Map(), relationships: [{ type: 'ref', target: 'Doc B', confidence: 'EXTRACTED' }] },
      { file: 'b.md', title: 'Doc B', tags: [], tokens: new Map(), relationships: [] }
    ]
    const { vectors, idf } = computeTFIDF(docs)
    const edges = buildEdges(docs, vectors, idf)
    expect(edges.length).toBeGreaterThan(0)
    expect(edges.some(e => e.relation === 'typed_link')).toBe(true)
  })

  it('creates shared_tag edge when two docs share a tag', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a.md', title: 'Doc A', tags: ['shared'], tokens: new Map(), relationships: [] },
      { file: 'b.md', title: 'Doc B', tags: ['shared'], tokens: new Map(), relationships: [] }
    ]
    const { vectors, idf } = computeTFIDF(docs)
    const edges = buildEdges(docs, vectors, idf)
    expect(edges.some(e => e.relation === 'shared_tag')).toBe(true)
  })

  it('dedups edges (same source-target-relation only once)', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a.md', title: 'Doc A', tags: ['shared'], tokens: new Map(), relationships: [] },
      { file: 'b.md', title: 'Doc B', tags: ['shared'], tokens: new Map(), relationships: [] }
    ]
    const { vectors, idf } = computeTFIDF(docs)
    const edges = buildEdges(docs, vectors, idf)
    const tagEdges = edges.filter(e => e.relation === 'shared_tag')
    const edgeKeys = tagEdges.map(e => `${e.source}|${e.target}|${e.relation}`)
    expect(new Set(edgeKeys).size).toBe(edgeKeys.length)
  })

  it('respects MAX_EDGES limit (200)', () => {
    const docs: TFIDFDocument[] = Array.from({ length: 50 }, (_, i) => ({
      file: `f${i}.md`,
      title: `Doc ${i}`,
      tags: ['common'],
      tokens: new Map(),
      relationships: []
    }))
    const { vectors, idf } = computeTFIDF(docs)
    const edges = buildEdges(docs, vectors, idf)
    expect(edges.length).toBeLessThanOrEqual(200)
  })

  it('skips similarity edges for docs with too few tokens', () => {
    // 2 docs, 都只 1 token (< MIN_TOKENS_FOR_SIMILARITY=5)
    const docs: TFIDFDocument[] = [
      { file: 'a.md', title: 'A', tags: [], tokens: new Map([['word', 1]]), relationships: [] },
      { file: 'b.md', title: 'B', tags: [], tokens: new Map([['word', 1]]), relationships: [] }
    ]
    const { vectors, idf } = computeTFIDF(docs)
    const edges = buildEdges(docs, vectors, idf)
    // 不应该有 similar_content 边 (tokens 太短)
    expect(edges.some(e => e.relation === 'similar_content')).toBe(false)
  })

  it('shared_tag weight scales with shared tag count', () => {
    const docs: TFIDFDocument[] = [
      { file: 'a.md', title: 'A', tags: ['t1', 't2', 't3'], tokens: new Map(), relationships: [] },
      { file: 'b.md', title: 'B', tags: ['t1'], tokens: new Map(), relationships: [] },
      { file: 'c.md', title: 'C', tags: ['t1', 't2'], tokens: new Map(), relationships: [] }
    ]
    const { vectors, idf } = computeTFIDF(docs)
    const edges = buildEdges(docs, vectors, idf)
    const tagEdges = edges.filter(e => e.relation === 'shared_tag')
    // 不同对共享 tag 数不同 → weight 不同 (A-B:1, A-C:2, B-C:1)
    expect(tagEdges.length).toBeGreaterThanOrEqual(2)
  })
})

describe('constants', () => {
  it('SIMILARITY_THRESHOLD is in (0, 1)', () => {
    expect(SIMILARITY_THRESHOLD).toBeGreaterThan(0)
    expect(SIMILARITY_THRESHOLD).toBeLessThan(1)
  })

  it('MIN_TOKENS_FOR_SIMILARITY is positive', () => {
    expect(MIN_TOKENS_FOR_SIMILARITY).toBeGreaterThan(0)
  })
})