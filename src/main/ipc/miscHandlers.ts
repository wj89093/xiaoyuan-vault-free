/**
 * miscHandlers — small misc IPC handlers merged from:
 *   queryHandlers + resolverHandlers + graphHandlers
 *
 * All are 1:1 wrappers around service functions — safe to merge.
 */
import { ipcMain } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { queryVault } from '../services/search/query'
import { resolveContentType } from '../services/utils/resolver'
import { rebuildGraph, rebuildGraphIncremental, loadGraph } from '../services/graph/graph'
import { getVaultPath } from '../services/database/database'
import { IS_PRO, IS_OPEN_SOURCE } from '../buildFeatures'
import type { GraphData } from '../services/graph/types'

/**
 * 纯函数: KG 节点查询 (v1.7 抽, 可独立测试)
 * - name 不传: 返所有节点 + 边 (LIMIT maxResults 防暴)
 * - name 传: 按 title / tags 模糊匹 (case-insensitive)
 * - maxResults: 限制匹中节点数 (默认 50)
 * - maxNeighbors: 每匹中节点最多 N 条边 (默认 10)
 */
export function queryTopicsFromGraph(
  graph: GraphData,
  name?: string,
  options?: { maxNeighbors?: number; maxResults?: number }
): { query: string; nodes: GraphData['nodes']; edges: GraphData['edges'] } {
  const maxResults = options?.maxResults ?? 50
  const maxNeighbors = options?.maxNeighbors ?? 10

  const matchedNodes = !name
    ? graph.nodes
    : graph.nodes.filter(
        (n) =>
          n.title.toLowerCase().includes(name.toLowerCase()) ||
          n.tags?.some((t) => t.toLowerCase().includes(name.toLowerCase()))
      )
  const limitadas = matchedNodes.slice(0, maxResults)

  // 按节点截断 (每节点最多 maxNeighbors 条边)
  const ids = new Set(limitadas.map((n) => n.id))
  const perNodeEdgeCount = new Map<string, number>()
  const finalEdges: GraphData['edges'] = []
  for (const e of graph.edges) {
    if (!ids.has(e.source) && !ids.has(e.target)) continue
    const sCount = perNodeEdgeCount.get(e.source) ?? 0
    const tCount = perNodeEdgeCount.get(e.target) ?? 0
    if (ids.has(e.source) && sCount >= maxNeighbors) continue
    if (ids.has(e.target) && tCount >= maxNeighbors) continue
    finalEdges.push(e)
    if (ids.has(e.source)) perNodeEdgeCount.set(e.source, sCount + 1)
    if (ids.has(e.target)) perNodeEdgeCount.set(e.target, tCount + 1)
  }

  return { query: name ?? '', nodes: limitadas, edges: finalEdges }
}

export function registerMiscHandlers(): void {
  // ── Build info (Pro/OpenSource detection for renderer) ─────────
  ipcMain.handle('app:buildInfo', () => ({
    isPro: IS_PRO,
    isOpenSource: IS_OPEN_SOURCE,
    buildTarget: process.env.BUILD_TARGET ?? 'pro'
  }))
  // ── Query ─────────────────────────────────────────────────────────
  ipcMain.handle(
    'query:vault',
    async (
      _,
      question: string,
      options?: { topic?: string; maxResults?: number; maxWikiFiles?: number }
    ) => {
      return queryVault(question, options)
    }
  )

  // ── Resolver ──────────────────────────────────────────────────────
  ipcMain.handle('resolver:classify', async (_, content: string, title?: string) => {
    return resolveContentType(content, title)
  })

  // ── Graph ─────────────────────────────────────────────────────────
  ipcMain.handle('graph:rebuild', async () => {
    return rebuildGraph()
  })

  // P3-2026-06-02: 增量重建,只重算 changedFiles 相关的边
  ipcMain.handle('graph:rebuildIncremental', async (_, changedFiles: string[]) => {
    if (!Array.isArray(changedFiles)) {
      return { nodes: 0, edges: 0, incremental: false }
    }
    return rebuildGraphIncremental(changedFiles)
  })

  ipcMain.handle('graph:load', async () => {
    return loadGraph()
  })

  // v1.7 (backport from Free 仓 00cc793): Agent 文本查询图谱
  ipcMain.handle(
    'kg:queryTopics',
    async (_, name?: string, options?: { maxNeighbors?: number; maxResults?: number }) => {
      const graph = await loadGraph()
      if (!graph) {
        return { nodes: [], edges: [], query: name ?? '' }
      }
      return queryTopicsFromGraph(graph, name, options)
    }
  )

  // Open a file in the editor (sets selectedFile + loads content into editor)
  ipcMain.handle('vault:openFile', async (_, filePath: string) => {
    const vaultPath = getVaultPath()
    const fullPath = vaultPath
      ? filePath.startsWith(vaultPath)
        ? filePath
        : join(vaultPath, filePath)
      : filePath

    // Ensure .system directory exists
    const systemDir = vaultPath ? join(vaultPath, '_wiki', '.system') : null
    if (systemDir && !existsSync(systemDir)) {
      const fs = await import('fs/promises')
      await fs.mkdir(systemDir, { recursive: true })
    }

    // Ensure agent-prompt.md exists with default content
    if (!existsSync(fullPath)) {
      const defaultContent = `# 晓园 Vault 操作说明 (Skill.md)

你是一个运行在晓园 Vault 知识库中的 AI 助手。本文件告诉你如何操作这个知识库。

---

## 核心概念

晓园 Vault 是一个 **AI 原生知识库**，采用三层架构：

| 层 | 目录 | 说明 |
|----|------|------|
| 来源层 | \`_raw/\` | 原始文件（PDF、docx、图片等），只读，不编辑 |
| 知识层 | \`_wiki/\` | AI 整理后的结构化知识页面（Markdown），可读可写 |
| 系统层 | \`.system/\` | 系统配置和操作说明，不要随意修改 |

---

## 关键操作

### 1. 读取文件
\`\`\`
readFile _wiki/某目录/某页面.md
\`\`\`
读取 \`_wiki/\` 下的知识页面，这是你的主要信息来源。

### 2. 创建/编辑知识页面
在 \`_wiki/\` 下创建 \`.md\` 文件，必须包含 **frontmatter**：
\`\`\`yaml
---
title: 页面标题
type: note        # note | meeting | research | document
topic: 招商工具    # 所属主题目录
tags: [标签1, 标签2]
created: 2026-05-29
source: _raw/某原始文件.pdf
---
\`\`\`
正文使用 Markdown 语法。

### 3. Wiki 链接
用 \`[[页面名称]]\` 链接到其他知识页面（不需要 \`.md\` 后缀和路径）。

### 4. 摄入（Ingest）
当用户拖入新文件到 \`_raw/\` 时：
1. 读取 \`_raw/\` 下的新文件
2. 分析内容，确定主题分类
3. 在 \`_wiki/{topic}/\` 下创建知识页面
4. 填写完整的 frontmatter
5. 在 \`log.md\` 中记录操作

### 5. 文件结构规范
\`\`\`
_wiki/
├── 招商工具/       # 招商分析工具和方法论
├── 产业招商/       # 具体产业招商方案
├── 产业政策/       # 政府政策和园区方案
├── 园区运营/       # 园区管理和运营经验
├── 园区学习/       # 学习交流活动
├── 企业档案/       # 企业信息档案
├── 选址分析/       # 选址方法论和案例
├── 行业会议/       # 会议笔记和参会资料
└── 机构介绍/       # 政府/机构介绍
\`\`\`

---

## 禁止事项

- ❌ 不要编辑 \`_raw/\` 下的原始文件
- ❌ 不要删除 \`.system/\` 下的配置文件
- ❌ 不要在正文外创建 wiki 链接
- ❌ 不要使用绝对路径

---

## 日志记录

每次操作后更新 \`log.md\`，格式：
\`\`\`
## [日期 时间] ingest | {操作描述}

### {主题分类}
- [[页面名称]] → {目录}/ | {简要说明}
  - 来源：{原始文件路径}
\`\`\`
`
      await writeFile(fullPath, defaultContent, 'utf-8')
    }

    // Emit event to renderer so it can update selectedFile state
    const { getMainWindowRef } = await import('../mainWindowRef')
    const win = getMainWindowRef()
    if (win) {
      win.webContents.send('vault:fileOpened', fullPath)
    }

    return { ok: true, path: fullPath }
  })
}
