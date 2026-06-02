import type { Relationship } from './types'

/**
 * Extract [[Wiki Links]] from content.
 * Supports Obsidian-style display title: [[link|Display Title]] → 'link'
 */
export function extractWikiLinks(content: string): string[] {
  const matches = content.match(/\[\[([^\]]+)\]\]/g)
  if (!matches) return []
  return matches
    .map((m) => m.slice(2, -2).trim())
    .map((m) => m.split('|')[0].trim()) // Strip display title after |
    .filter(Boolean)
}

/**
 * Extract [[TYPE:NAME]] typed links from content
 * Format: [[type:name]] or [[type: name with spaces]]
 */
export function extractTypedLinks(content: string): Relationship[] {
  const results: Relationship[] = []
  // [[type:name]] pattern
  const regex = /\[\[([a-z_]+):\s*([^\]]+)\]\]/gi
  let match
  while ((match = regex.exec(content)) !== null) {
    const type = match[1].toLowerCase()
    const target = match[2].trim()
    if (type && target) {
      results.push({ type, target, confidence: 'EXTRACTED' })
    }
  }
  return results
}

/**
 * Add typed link to frontmatter relationships
 */
export function addRelationship(
  existing: Relationship[] | undefined,
  type: string,
  target: string,
  confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' = 'EXTRACTED'
): Relationship[] {
  const rels = existing ?? []
  // Avoid duplicates
  const exists = rels.some((r) => r.type === type && r.target === target)
  if (exists) return rels
  return [...rels, { type, target, confidence }]
}
