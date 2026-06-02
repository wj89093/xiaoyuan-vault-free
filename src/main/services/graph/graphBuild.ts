import { getVaultPath } from '../database/database'
import { readFile, readdir } from 'fs/promises'
import { join, extname } from 'path'
import log from 'electron-log/main'
import { parseFrontmatter, extractTypedLinks, type Relationship } from '../frontmatter/index'
import { tokenize, computeTFIDF, buildEdges, cosineSimilarity } from './graphTFIDF'
import { loadGraph, saveGraph, loadFolderToTypeMap } from './graphStorage'
import type { TFIDFDocument, GraphNode, GraphEdge, GraphData } from './types'

const SYSTEM_FILES = new Set(['index.md', 'log.md', 'schema.md'])

// ── File scanning ──────────────────────────────────────────────────────

export async function scanMarkdownFiles(vaultPath: string, dir = ''): Promise<string[]> {
  const fullDir = dir ? join(vaultPath, dir) : vaultPath
  const entries = await readdir(fullDir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === '.xiaoyuan') continue
    const relPath = dir ? `${dir}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      if (entry.name === '_raw') continue
      const subFiles = await scanMarkdownFiles(vaultPath, relPath)
      results.push(...subFiles)
    } else if (extname(entry.name) === '.md' && !SYSTEM_FILES.has(entry.name)) {
      results.push(relPath)
    }
  }

  return results
}

// ── Document tokenization ───────────────────────────────────────────────

export async function tokenizeDocument(
  file: string,
  vaultPath: string
): Promise<TFIDFDocument | null> {
  const fullPath = join(vaultPath, file)
  const raw = await readFile(fullPath, 'utf-8')

  const { frontmatter: fm, content: body } = parseFrontmatter(raw)
  const title: string = fm.title ?? file.replace(/\.md$/, '')
  const tags: string[] = Array.isArray(fm.tags) ? fm.tags : []
  const tokens = tokenize(body)

  const bodyRelationships = extractTypedLinks(body)
  const fmRelationships: Relationship[] = Array.isArray(fm.relationships) ? fm.relationships : []
  const seenKeys = new Set<string>()
  const relationships: Relationship[] = [...fmRelationships, ...bodyRelationships].filter((r) => {
    const key = `${r.type}:${r.target}`
    if (seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })

  return { file, title, tags, tokens, relationships }
}

// ── Rebuild helpers ─────────────────────────────────────────────────────

function makeNodes(
  documents: TFIDFDocument[],
  folderToType: Record<string, string>,
  existingGraph: GraphData | null
): GraphNode[] {
  return documents.map((doc) => {
    const folder = doc.file.split('/')[0] || ''
    const entity_count = doc.relationships.length
    const is_entity = entity_count > 0
    const primaryType = doc.relationships[0]?.type || folderToType[folder] || 'note'
    const existing = existingGraph?.nodes.find((n) => n.id === doc.file)
    return {
      id: doc.file,
      title: doc.title,
      tags: doc.tags,
      page_type: folderToType[folder] || 'note',
      edge_count: existing?.edge_count ?? 0,
      is_entity,
      entity_type: is_entity ? primaryType : undefined,
      entity_count: is_entity ? entity_count : 0
    }
  })
}

function countEdges(nodes: GraphNode[], edges: GraphEdge[]): void {
  const counts = new Map<string, number>()
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
  }
  for (const node of nodes) {
    node.edge_count = counts.get(node.id) ?? 0
  }
}

// ── Full rebuild ───────────────────────────────────────────────────────

export async function rebuildGraph(): Promise<{ nodes: number; edges: number }> {
  const vaultPath = getVaultPath()
  if (!vaultPath) throw new Error('No vault open')

  log.info('[Graph] rebuilding knowledge graph...')
  const start = Date.now()

  try {
    const files = await scanMarkdownFiles(vaultPath)
    log.info(`[Graph] found ${files.length} markdown files`)

    const documents: TFIDFDocument[] = []
    for (const file of files) {
      try {
        const doc = await tokenizeDocument(file, vaultPath)
        if (doc) documents.push(doc)
      } catch {
        log.warn('[Graph] tokenize skipped:', file)
      }
    }

    const { vectors, idf } = computeTFIDF(documents)
    const folderToType = await loadFolderToTypeMap()
    const nodes = makeNodes(documents, folderToType, null)
    const edges = buildEdges(documents, vectors, idf)
    countEdges(nodes, edges)

    const graph: GraphData = { nodes, edges, updated_at: Date.now() }
    await saveGraph(graph)

    const elapsed = Date.now() - start
    log.info(`[Graph] done: ${nodes.length} nodes, ${edges.length} edges (${elapsed}ms)`)
    return { nodes: nodes.length, edges: edges.length }
  } catch (err) {
    log.error('[Graph] rebuild failed:', (err as Error).message)
    return { nodes: 0, edges: 0 }
  }
}

// ── Incremental rebuild ───────────────────────────────────────────────

export async function rebuildGraphIncremental(
  changedFiles: string[]
): Promise<{ nodes: number; edges: number }> {
  const vaultPath = getVaultPath()
  if (!vaultPath) throw new Error('No vault open')
  if (!changedFiles.length) return { nodes: 0, edges: 0 }

  log.info(`[Graph] incremental rebuild: ${changedFiles.length} files changed`)
  const start = Date.now()

  try {
    const existingGraph = await loadGraph()
    const allFiles = await scanMarkdownFiles(vaultPath)

    const documents: TFIDFDocument[] = []
    for (const file of allFiles) {
      try {
        const doc = await tokenizeDocument(file, vaultPath)
        if (doc) documents.push(doc)
      } catch {
        log.warn('[Graph] tokenize skipped:', file)
      }
    }

    const { vectors } = computeTFIDF(documents)
    const folderToType = await loadFolderToTypeMap()
    const changedSet = new Set(changedFiles)

    const nodes = makeNodes(documents, folderToType, existingGraph)

    // Remove stale edges (involving changed files)
    const edges: GraphEdge[] = existingGraph
      ? existingGraph.edges.filter((e) => !changedSet.has(e.source) && !changedSet.has(e.target))
      : []

    // Rebuild edges for changed files vs all files
    const SIMILARITY_THRESHOLD = 0.15
    const seen = new Set<string>()
    const changedIndices = new Map<string, number>()
    documents.forEach((doc, i) => {
      if (changedSet.has(doc.file)) changedIndices.set(doc.file, i)
    })

    for (const [changedFile, ci] of changedIndices) {
      for (let j = 0; j < documents.length; j++) {
        if (j === ci) continue
        const docj = documents[j]

        const sharedTags = documents[ci].tags.filter((t) => docj.tags.includes(t))
        const keyTag = `${changedFile}|${docj.file}|shared_tag`
        if (sharedTags.length > 0 && !seen.has(keyTag)) {
          seen.add(keyTag)
          edges.push({
            source: changedFile,
            target: docj.file,
            relation: 'shared_tag',
            weight: sharedTags.length * 0.3
          })
        }

        const docI = documents[ci]
        for (const rel of docI.relationships) {
          const targetNorm = rel.target.toLowerCase().replace(/\s+/g, '')
          const docjTitles = [docj.title, ...docj.relationships.map((r) => r.target)]
          if (docjTitles.some((t) => t.toLowerCase().replace(/\s+/g, '') === targetNorm)) {
            const keyTyped = `${changedFile}|${docj.file}|typed_link`
            if (!seen.has(keyTyped)) {
              seen.add(keyTyped)
              edges.push({
                source: changedFile,
                target: docj.file,
                relation: 'typed_link',
                weight: 1.0
              })
            }
          }
        }

        if (vectors[ci] && vectors[j] && documents[ci].tokens.size >= 5 && docj.tokens.size >= 5) {
          const similarity = cosineSimilarity(vectors[ci], vectors[j])
          if (similarity >= SIMILARITY_THRESHOLD) {
            const keySim = `${changedFile}|${docj.file}|similar_content`
            if (!seen.has(keySim)) {
              seen.add(keySim)
              edges.push({
                source: changedFile,
                target: docj.file,
                relation: 'similar_content',
                weight: similarity
              })
            }
          }
        }
      }
    }

    countEdges(nodes, edges)
    const graph: GraphData = { nodes, edges, updated_at: Date.now() }
    await saveGraph(graph)

    const elapsed = Date.now() - start
    log.info(
      `[Graph] incremental done: ${nodes.length} nodes, ${edges.length} edges (${elapsed}ms)`
    )
    return { nodes: nodes.length, edges: edges.length }
  } catch (err) {
    log.error('[Graph] incremental rebuild failed:', (err as Error).message)
    return { nodes: 0, edges: 0 }
  }
}
