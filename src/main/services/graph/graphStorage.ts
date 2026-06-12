import { getVaultPath } from '../database/database'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'
import type { GraphData } from './types'

const FOLDER_MAP_DEFAULTS: Record<string, string> = {
  person: '1-人物',
  company: '2-公司',
  project: '3-项目',
  meeting: '4-会议',
  deal: '5-交易',
  concept: '6-概念',
  research: '7-研究',
  collection: '0-收集'
}

async function loadFolderMapFromDisk(vaultPath: string): Promise<Record<string, string>> {
  const mapPath = join(vaultPath, '.xiaoyuan', 'folder-map.json')
  try {
    if (existsSync(mapPath)) {
      const raw = await readFile(mapPath, 'utf-8')
      return JSON.parse(raw) as Record<string, string>
    }
  } catch {
    /* use defaults */
  }
  return { ...FOLDER_MAP_DEFAULTS }
}

// ── Graph path ────────────────────────────────────────────────────────

export async function getGraphPath(): Promise<string> {
  const vaultPath = getVaultPath()
  if (!vaultPath) throw new Error('No vault open')
  const dir = join(vaultPath, '.xiaoyuan')
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  return join(dir, 'graph.json')
}

// ── Validation ─────────────────────────────────────────────────────────

function isGraphData(obj: unknown): obj is GraphData {
  if (!obj || typeof obj !== 'object') return false
  const g = obj as Record<string, unknown>
  return Array.isArray(g.nodes) && Array.isArray(g.edges) && typeof g.updated_at === 'number'
}

// ── Load / Save ───────────────────────────────────────────────────────

export async function loadGraph(): Promise<GraphData | null> {
  try {
    const graphPath = await getGraphPath()
    if (!existsSync(graphPath)) return null
    const raw = await readFile(graphPath, 'utf-8')
    const data: unknown = JSON.parse(raw)
    return isGraphData(data) ? data : null
  } catch {
    log.warn('[graph] loadGraph: JSON parse failed, returning null')
    return null
  }
}

export async function saveGraph(graph: GraphData): Promise<void> {
  const graphPath = await getGraphPath()
  graph.updated_at = Date.now()
  await writeFile(graphPath, JSON.stringify(graph, null, 2), 'utf-8')
  // v1.9: 同步写 _state/graph/SUMMARY.json (AI 入门摘要)
  // 静态 import 避免每次动态加载 (perf)
  const { writeGraphSummary } = await import('../state/graphSummary')
  void writeGraphSummary().catch(() => {})
}

// ── Folder type map ───────────────────────────────────────────────────

export async function loadFolderToTypeMap(): Promise<Record<string, string>> {
  try {
    const vaultPath = getVaultPath()
    if (!vaultPath) return {}
    const map = await loadFolderMapFromDisk(vaultPath)
    const inverted: Record<string, string> = {}
    for (const [type, folder] of Object.entries(map)) {
      inverted[folder] = type
    }
    return inverted
  } catch (err) {
    log.warn(
      '[graph] loadFolderToTypeMap: failed, returning empty map',
      err instanceof Error ? err.message : String(err)
    )
    return {}
  }
}
