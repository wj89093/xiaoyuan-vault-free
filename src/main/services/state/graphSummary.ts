/**
 * graphSummary.ts — _state/graph/SUMMARY.json
 *
 * AI-readable summary of the vault knowledge graph. Companion to
 * .xiaoyuan/graph.json (the full source of truth).
 *
 * Why this exists:
 * - graph.json can grow to MB for large vaults
 * - AI just needs to know "vault is healthy" or "5 broken links"
 * - Drills down to graph.json only when needed
 *
 * Design (v1.9, 2026-06-12): two-layer state model
 *   _state/graph/SUMMARY.json  ← AI default (this file)
 *   .xiaoyuan/graph.json       ← full source, drill-down
 *
 * Trigger: graph save (in graphStorage.saveGraph). Silent fail.
 */
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import { loadGraph } from '../graph/graphStorage'
import type { GraphData } from '../graph/types'
import log from 'electron-log/main'

export interface TopDomain {
  /** Cluster of nodes by primary tag (lowercased, deduped) */
  name: string
  count: number
}

export interface BrokenLink {
  source: string
  target: string
}

export interface GraphSummary {
  updatedAt: string
  totalNodes: number
  totalEdges: number
  /** File count in this graph (= totalNodes for file-level nodes) */
  fileNodes: number
  /** Entity nodes (people/places/concepts extracted from content) */
  entityNodes: number
  /** Nodes with zero edges — orphaned files */
  orphanFiles: number
  /**
   * Edges whose target file doesn't exist in nodes — broken wiki links.
   * This is a *heuristic*: wiki-link targets should be file nodes; if
   * the target isn't in the graph, the link is likely dead.
   */
  brokenLinks: number
  /** Top tags/domains by node count, max 10 */
  topDomains: TopDomain[]
  /** Up to 20 sample broken link pairs (source→target) for AI triage */
  brokenLinkSamples: BrokenLink[]
  /** Path to the full graph.json (relative to vault root) */
  source: string
}

/**
 * Build a summary from GraphData. Pure function — testable.
 */
export function buildGraphSummary(graph: GraphData): Omit<GraphSummary, 'updatedAt' | 'source'> {
  const nodes = graph.nodes
  const edges = graph.edges
  const fileNodes = nodes.filter((n) => !n.is_entity)
  const entityNodes = nodes.filter((n) => n.is_entity)
  const orphanFiles = fileNodes.filter((n) => n.edge_count === 0).length

  // Find broken links: edge target not in node ids
  const nodeIds = new Set(nodes.map((n) => n.id))
  const brokenEdgePairs = edges
    .filter((e) => !nodeIds.has(e.target))
    .map((e) => ({ source: e.source, target: e.target }))

  // Top domains: cluster file nodes by primary tag (lowercase, dedupe)
  const tagCounts = new Map<string, number>()
  for (const n of fileNodes) {
    const tag = n.tags?.[0]?.toLowerCase().trim()
    if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const topDomains: TopDomain[] = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    fileNodes: fileNodes.length,
    entityNodes: entityNodes.length,
    orphanFiles,
    brokenLinks: brokenEdgePairs.length,
    topDomains,
    brokenLinkSamples: brokenEdgePairs.slice(0, 20)
  }
}

/**
 * Write _state/graph/SUMMARY.json. Silent fail.
 * Call this after the full graph.json is saved.
 */
export async function writeGraphSummary(): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return

  try {
    const graph = await loadGraph()
    if (!graph) return // no graph yet, nothing to summarize

    const partial = buildGraphSummary(graph)
    const summary: GraphSummary = {
      ...partial,
      updatedAt: new Date().toISOString(),
      source: '../.xiaoyuan/graph.json'
    }

    const dir = join(vaultPath, '_state', 'graph')
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SUMMARY.json'), JSON.stringify(summary, null, 2), 'utf-8')
  } catch (e) {
    log.warn('[GRAPH_SUMMARY] write failed:', e)
  }
}
