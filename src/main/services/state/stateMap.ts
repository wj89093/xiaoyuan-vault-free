/**
 * stateMap.ts — STATE_MAP.json writer
 *
 * Generates `_state/STATE_MAP.json` describing what state files exist in
 * this vault and where to find them. Designed to give external AI a single
 * entry point ("read _state/STATE_MAP.json") to discover the full vault
 * state landscape.
 *
 * Design philosophy (2026-06-12):
 * - `_state/` = AI-visible state (summaries, indices, current state)
 * - `.xiaoyuan/` = internal data (full source of truth, AI can read but
 *   default to summaries in `_state/`)
 * - `_state/STATE_MAP.json` is the "table of contents" — every state file
 *   that AI might want, with path + purpose + size + updatedAt.
 *
 * Write trigger: vault 打开/创建/刷新 (via vaultHandlers).
 * Silent fail: external AI 读旧 map 也够用.
 */
import { stat, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import log from 'electron-log/main'

export interface StateFileEntry {
  /** Display name (uppercase snake) */
  name: string
  /** Path relative to vault root (forward-slash) */
  path: string
  /** What this file contains (1 line) */
  purpose: string
  /** When to read this file (1 line) */
  whenToRead: string
  /** Last modified ISO timestamp (if file exists) */
  updatedAt?: string
  /** File size in bytes (if file exists) */
  sizeBytes?: number
  /** Whether file currently exists */
  exists: boolean
}

export interface StateMap {
  updatedAt: string
  vault: {
    path: string
    name: string
  }
  stateDir: string
  files: StateFileEntry[]
  /**
   * Top-level categories so AI can orient quickly.
   * Each category lists the file names in `files[]` that belong to it.
   */
  categories: Record<string, string[]>
}

/**
 * Returns the state map entries (without writing). Useful for tests.
 */
export function getStateMapEntries(): {
  files: StateFileEntry[]
  categories: Record<string, string[]>
} {
  const files: StateFileEntry[] = [
    {
      name: 'VAULT_STATE',
      path: '_state/VAULT_STATE.json',
      purpose: '当前打开的 vault (personal/team) + 切换状态',
      whenToRead: '启动时 — 知道 "现在在哪个 vault"',
      exists: false
    },
    {
      name: 'FS_CACHE',
      path: '_state/FS_CACHE.json',
      purpose: 'vault 一级文件树快照 (totalFiles/roots)',
      whenToRead: '想知道 vault 有哪些顶层目录/文件, 不需递归 ls',
      exists: false
    },
    {
      name: 'GRAPH',
      path: '.xiaoyuan/graph.json',
      purpose: '完整知识图谱 (nodes + edges)',
      whenToRead: '需要查节点/关系时, drill-down 用',
      exists: false
    },
    {
      name: 'GRAPH_SUMMARY',
      path: '_state/graph/SUMMARY.json',
      purpose: '图谱健康度摘要 (orphanFiles/brokenLinks/topDomains)',
      whenToRead: '想知道 vault 图谱健康度 (推荐优先读这个)',
      exists: false
    },
    {
      name: 'FOLDER_MAP',
      path: '.xiaoyuan/folder-map.json',
      purpose: 'folder → type 映射 (e.g. _wiki/合同管理 → 合同领域)',
      whenToRead: '想知道某个 folder 属于什么领域',
      exists: false
    },
    {
      name: 'SCHEMAS',
      path: '.xiaoyuan/schemas/',
      purpose: 'per-folder schema 契约 (字段定义)',
      whenToRead: '写入文件前 — 查这个 folder 该有哪些字段',
      exists: false
    },
    {
      name: 'LINT_REPORTS',
      path: '.xiaoyuan/lint-reports.json',
      purpose: '最近 30 个 lint 报告 (broken links / format issues)',
      whenToRead: '想知道 vault 有哪些内容问题',
      exists: false
    },
    {
      name: 'TASKS',
      path: '.xiaoyuan/tasks.json',
      purpose: '后台维护任务队列',
      whenToRead: '几乎不需要 — 内部调度用',
      exists: false
    },
    {
      name: 'CHAT_SESSIONS',
      path: '.xiaoyuan/chat/sessions.json',
      purpose: 'chat 会话列表',
      whenToRead: '查历史对话时',
      exists: false
    },
    {
      name: 'CHAT_MESSAGES',
      path: '.xiaoyuan/chat/messages/<sessionId>.json',
      purpose: '每个 chat 会话的消息内容',
      whenToRead: '读历史对话内容',
      exists: false
    },
    {
      name: 'MEMORY_FACTS',
      path: '_briefing/memory-facts/',
      purpose: 'agent 记忆事实 (跨 session 持久)',
      whenToRead: '想知道 user 之前说过什么 / 偏好',
      exists: false
    },
    {
      name: 'TOOL_CALLS',
      path: '_briefing/tool-calls.jsonl',
      purpose: 'agent 工具调用日志 (jsonl, 1 行 1 个调用)',
      whenToRead: 'debug / 查 agent 做过什么',
      exists: false
    },
    {
      name: 'INDEX_DB',
      path: '.xiaoyuan/index.db',
      purpose: 'SQLite 主索引 (文件元数据 + 搜索索引)',
      whenToRead: '不要直接读 — 用 IPC (search/list) 接口',
      exists: false
    }
  ]

  const categories: Record<string, string[]> = {
    'AI 入门 (先读这两个)': ['VAULT_STATE', 'FS_CACHE'],
    知识图谱: ['GRAPH_SUMMARY', 'GRAPH', 'FOLDER_MAP'],
    文件契约: ['SCHEMAS'],
    健康检查: ['LINT_REPORTS'],
    '内部数据 (AI 可读但不推荐默认)': [
      'TASKS',
      'CHAT_SESSIONS',
      'CHAT_MESSAGES',
      'MEMORY_FACTS',
      'TOOL_CALLS',
      'INDEX_DB'
    ]
  }

  return { files, categories }
}

/**
 * Resolve a path relative to vault root to absolute, return null if no vault.
 */
function resolveVaultRelative(vaultPath: string, relPath: string): string {
  return join(vaultPath, ...relPath.split('/'))
}

/**
 * Enrich entries with exists/size/updatedAt. Mutates and returns entries.
 */
async function enrichEntries(
  vaultPath: string,
  entries: StateFileEntry[]
): Promise<StateFileEntry[]> {
  for (const entry of entries) {
    const abs = resolveVaultRelative(vaultPath, entry.path)
    try {
      if (existsSync(abs)) {
        const s = await stat(abs)
        entry.exists = true
        entry.sizeBytes = s.size
        entry.updatedAt = s.mtime.toISOString()
      }
    } catch {
      // silent — keep exists=false
    }
  }
  return entries
}

/**
 * Write _state/STATE_MAP.json. Silent fail.
 * Call this after vault open/create, and on demand (refresh).
 */
export async function writeStateMap(): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return

  try {
    const { files, categories } = getStateMapEntries()
    const enriched = await enrichEntries(vaultPath, files)
    const map: StateMap = {
      updatedAt: new Date().toISOString(),
      vault: {
        path: vaultPath,
        name: vaultPath.split('/').pop() ?? ''
      },
      stateDir: '_state/',
      files: enriched,
      categories
    }
    const stateDir = join(vaultPath, '_state')
    if (!existsSync(stateDir)) await mkdir(stateDir, { recursive: true })
    await writeFile(join(stateDir, 'STATE_MAP.json'), JSON.stringify(map, null, 2), 'utf-8')
  } catch (e) {
    log.warn('[STATE_MAP] write failed:', e)
  }
}
