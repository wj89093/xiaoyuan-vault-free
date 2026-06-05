import { describe, it, expect } from 'vitest'
import { queryTopicsFromGraph } from './miscHandlers'
import type { GraphData } from '../services/graph/types'

// ─── v1.7: kg:queryTopics 纯函数测试 (P0-3, 实测 IPC 行为) ─────────────

const MOCK_GRAPH: GraphData = {
  nodes: [
    { id: '_wiki/合同/ABC.md', title: 'ABC 科技合同', tags: ['合同', 'ABC'], edge_count: 3 },
    { id: '_wiki/合同/XYZ.md', title: 'XYZ 合作协议', tags: ['合同', 'XYZ'], edge_count: 2 },
    { id: '_wiki/会议/启动.md', title: 'ABC 项目启动会', tags: ['会议', 'ABC'], edge_count: 1 },
    { id: '_wiki/技术/方案.md', title: 'ABC 技术方案', tags: ['技术'], edge_count: 1 },
    { id: '_wiki/合同/DEF.md', title: 'DEF 合同', tags: ['合同', 'DEF'], edge_count: 1 }
  ],
  edges: [
    { source: '_wiki/合同/ABC.md', target: '_wiki/合同/XYZ.md', relation: 'shared_tag', weight: 1 },
    { source: '_wiki/合同/ABC.md', target: '_wiki/会议/启动.md', relation: 'shared_tag', weight: 1 },
    { source: '_wiki/合同/ABC.md', target: '_wiki/技术/方案.md', relation: 'shared_tag', weight: 1 },
    { source: '_wiki/合同/ABC.md', target: '_wiki/合同/DEF.md', relation: 'typed_link', weight: 1 },
    { source: '_wiki/会议/启动.md', target: '_wiki/合同/DEF.md', relation: 'shared_tag', weight: 1 },
    { source: '_wiki/技术/方案.md', target: '_wiki/合同/DEF.md', relation: 'shared_tag', weight: 1 }
  ],
  updated_at: 0
}

describe('v1.7 kg:queryTopics — 纯函数 (实测 IPC 行为)', () => {
  it('不传 name → 返所有节点 (LIMIT maxResults 50)', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH)
    expect(r.query).toBe('')
    expect(r.nodes).toHaveLength(5) // 5 个 mock 节点
    expect(r.edges).toHaveLength(6) // 6 个 mock 边全返
  })

  it('name="ABC" → 按 title 模糊匹 3 节点 (ABC 合同 + ABC 项目启动会 + ABC 技术方案)', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH, 'ABC')
    expect(r.nodes.map((n) => n.id).sort()).toEqual(
      [
        '_wiki/合同/ABC.md',
        '_wiki/会议/启动.md',
        '_wiki/技术/方案.md'
      ].sort()
    )
  })

  it('name="ABC" → 按 tags 模糊匹 (同 title 匹重叠, 但 tags 匹补 title 漏的)', () => {
    // XYZ 合作协议 tags 包含 'ABC'? 不, 是 'XYZ'。但 title 匹 ABC 匹中
    // DEF 合同 tags 包含 'DEF', title 是 'DEF 合同' - 不匹 ABC
    // 所以 ABC 匹 = 3 节点 (title 匹, tags 不补新节点)
    const r = queryTopicsFromGraph(MOCK_GRAPH, 'ABC')
    const tags = r.nodes.flatMap((n) => n.tags ?? [])
    expect(tags).toContain('合同')
    expect(tags).toContain('会议')
    expect(tags).toContain('技术')
  })

  it('name="合同" → 按 tags 匹 4 节点 (合同管理 topic 全部)', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH, '合同')
    // ABC + XYZ + DEF (3 个) title 含合同 + DEF 合同 tags 含合同
    expect(r.nodes).toHaveLength(3)
    expect(r.nodes.every((n) => n.tags?.includes('合同'))).toBe(true)
  })

  it('name 不区分大小写', () => {
    const r1 = queryTopicsFromGraph(MOCK_GRAPH, 'abc')
    const r2 = queryTopicsFromGraph(MOCK_GRAPH, 'ABC')
    expect(r1.nodes.map((n) => n.id)).toEqual(r2.nodes.map((n) => n.id))
  })

  it('邻接边只返匹中节点相关 (不返无关边)', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH, 'ABC')
    // ABC 匹中 3 节点 (ABC合同/启动会/技术方案)
    // 边: ABC合同-XYZ (XYZ 不在匹中) → 应排除
    const ids = new Set(r.nodes.map((n) => n.id))
    r.edges.forEach((e) => {
      expect(ids.has(e.source) || ids.has(e.target)).toBe(true)
    })
  })

  it('maxNeighbors=2 → ABC 节点 (3 条相关边) 截断到 2 条', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH, 'ABC', { maxNeighbors: 2 })
    // ABC合同 连到 XYZ, 启动, 技术方案, DEF (4 边, 但 XYZ 不在匹中只返 3 边)
    // maxNeighbors=2 → 每节点最多 2 条边
    // ABC合同: 3 边 (启动/技术方案/DEF) → 截断到 2 边
    // 启动: 1 边 (DEF) → 不截
    // 技术方案: 1 边 (DEF) → 不截
    // DEF 不在匹中 → 它出发的边不计
    const edgesFromAbc = r.edges.filter((e) => e.source === '_wiki/合同/ABC.md')
    expect(edgesFromAbc.length).toBeLessThanOrEqual(2)
  })

  it('maxResults=2 → 只返 2 节点 (即使匹中更多)', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH, 'ABC', { maxResults: 2 })
    expect(r.nodes).toHaveLength(2)
  })

  it('不存在的 name → 返空 nodes + 空 edges', () => {
    const r = queryTopicsFromGraph(MOCK_GRAPH, '不存在的关键词xyz')
    expect(r.nodes).toEqual([])
    expect(r.edges).toEqual([])
  })

  it('query 字段回显 name (空字符串如果没传)', () => {
    const r1 = queryTopicsFromGraph(MOCK_GRAPH)
    expect(r1.query).toBe('')
    const r2 = queryTopicsFromGraph(MOCK_GRAPH, 'ABC')
    expect(r2.query).toBe('ABC')
  })
})
