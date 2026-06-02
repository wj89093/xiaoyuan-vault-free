/**
 * Frontmatter type definitions for xiaoyuan-Vault
 */

export interface Relationship {
  type: string // invested_in, founded, attended, works_at, etc.
  target: string // Target entity name
  confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'
  source?: string // Source of this relationship
}

export interface OpenThread {
  content: string // The open task/question
  status: 'open' | 'done'
  created?: string // Date created
}

export interface Frontmatter {
  title?: string
  type?: string // person | company | project | meeting | deal | concept | research | collection
  status?: string // active | archived
  summary?: string // One-line summary
  confidence?: 'high' | 'medium' | 'low'
  tags?: string[]
  created?: string
  updated?: string
  relationships?: Relationship[]
  openThreads?: OpenThread[]
  seeAlso?: string[] // Cross-links to other pages
  [key: string]: unknown
}
