import type { Relationship } from '../frontmatter/index'

export interface GraphNode {
  id: string
  title: string
  page_type?: string
  tags?: string[]
  edge_count: number
  is_entity?: boolean
  entity_type?: string
  entity_count?: number
}

export interface GraphEdge {
  source: string
  target: string
  relation: 'shared_tag' | 'similar_content' | 'hyperlink' | 'typed_link'
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  updated_at: number
}

export interface TFIDFDocument {
  file: string
  title: string
  tags: string[]
  tokens: Map<string, number>
  relationships: Relationship[]
}
