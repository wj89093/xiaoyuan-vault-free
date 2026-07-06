import log from 'electron-log/main'
import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import { listVaultFiles } from '../operations/crud'
import { parseFrontmatter } from '../frontmatter/index'
import { callAI } from '../ai/aiService'
import { getLintReports } from '../lint/lintReports'

export interface BriefingReport {
  date: string
  period?: string // e.g. "2026-04-28 ~ 2026-05-01"
  newPages: number
  updatedPages: number
  entities: string[] // 新建的实体类型（人/公司/项目）
  highlights: string[] // LLM 生成的要点列表
  health: string // wiki 健康状态
  raw: string // LLM 原始摘要
  // P3-2026-06-03: optional summary fields (from conversation-summary frontmatter)
  time?: string
  title?: string
  topic?: string
  decisions?: string[]
  relatedFiles?: string[]
  nextSteps?: string[]
  /** Array of summary reports (for daily/weekly aggregation) */
  summaries?: Array<{
    date: string
    time: string
    title: string
    topic: string
    decisions: string[]
    relatedFiles: string[]
    nextSteps: string[]
    raw: string
  }>
}

// ─── Daily/Weekly Briefing ─────────────────────────────────────────
//
// 用户打开 App 时展示：本周 wiki 发生了什么变化。
// 不只是索引重建，而是 LLM 读 log.md + index.md 生成人类可读的 briefing。

export async function generateBriefing(): Promise<BriefingReport> {
  const vaultPath = getVaultPath()
  if (!vaultPath) {
    return makeEmpty('未打开知识库')
  }

  try {
    // 1. Read operation log (vault/log.md)
    const logPath = join(vaultPath, 'log.md')
    const logRaw = await readFile(logPath, 'utf-8').catch(() => '')

    // 2. Read wiki index (vault/index.md)
    const indexPath = join(vaultPath, 'index.md')
    const indexRaw = await readFile(indexPath, 'utf-8').catch(() => '')

    // 3. Get recent file changes (files updated in last 7 days)
    const recent = await getRecentChanges(vaultPath, 7)
    const period = getPeriodString(7)

    // 4. Get lint report for health context
    const lintReports = await getLintReports().catch(() => [])
    const latestLint = lintReports[0] ?? null
    const lintSummary = latestLint
      ? `Lint 健康：共 ${latestLint.totalFiles} 个文件，死链 ${latestLint.deadLinks?.length ?? 0} 个，孤立页面 ${latestLint.orphanPages?.length ?? 0} 个，矛盾 ${latestLint.contradictions?.length ?? 0} 处`
      : '暂无 Lint 报告'

    // 5. LLM 读 log + index + recent changes + lint，生成 briefing
    const briefing = await generateLLMBriefing(logRaw, indexRaw, recent, period, lintSummary)
    return briefing
  } catch (err) {
    log.warn('[Briefing] failed:', (err as Error).message)
    return makeEmpty(`生成失败: ${(err as Error).message}`)
  }
}

// ─── LLM-generate briefing ──────────────────────────────────────────

async function generateLLMBriefing(
  logRaw: string,
  indexRaw: string,
  recentFiles: { path: string; title: string; type: string; updated: string }[],
  period: string,
  lintSummary: string
): Promise<BriefingReport> {
  // 截取 log.md 最后 100 行（避免 token 过多）
  const logLines = logRaw.split('\n').slice(-100).join('\n')
  const recentSummary = recentFiles
    .map((f) => `- ${f.title} (${f.type ?? 'collection'}, ${f.updated})`)
    .join('\n')

  const prompt = `你是晓园 Vault 的知识管家。

请根据以下信息，生成一份本周的 wiki 变化简报。

## 时间范围
${period}

## 最近的页面更新（本周）
${recentSummary ?? '本周无更新'}

## 操作日志（最近 100 行）
${logLines ?? '无日志'}

## 知识库健康（Lint 报告）
${lintSummary}

## 任务
1. 数一数本周新增了多少页面，更新了多少页面
2. 识别新建的重要实体（人名、公司名、项目名）
3. 用 3-5 句话总结本周 wiki 的主要变化
4. 评估 wiki 的健康状态（增长速度、是否有死链/矛盾风险）

严格只基于提供的信息，不要编造。

返回严格 JSON（不要有解释）：
{
  "newPages": 数字,
  "updatedPages": 数字,
  "entities": ["实体1", "实体2"],
  "highlights": ["要点1", "要点2", "要点3"],
  "health": "健康状态描述（10字内）",
  "raw": "一段话总结本周变化（30字内）"
}`

  try {
    const result = await callAI('resolve', { prompt })
    const match = String(result).match(/\{[\s\S]*\}/)
    if (!match) return makeEmpty('LLM 返回格式异常')

    const p = JSON.parse(match[0]) as Record<string, unknown>
    return {
      date: new Date().toISOString().slice(0, 10),
      period,
      newPages: typeof p.newPages === 'number' ? p.newPages : 0,
      updatedPages: typeof p.updatedPages === 'number' ? p.updatedPages : 0,
      entities: (p.entities as unknown[]).slice(0, 5) as string[],
      highlights: (p.highlights as unknown[]).slice(0, 5) as string[],
      health: String(p.health ?? '未知'),
      raw: String(p.raw ?? '')
    }
  } catch (err) {
    log.warn('[Briefing] LLM failed:', (err as Error).message)
    return makeEmpty(`LLM 失败: ${(err as Error).message}`)
  }
}

// ─── Conversation Summary ───────────────────────────────────────
//
// 对话结束时，Agent 调用此函数存档对话摘要到 _briefing/conversations/

export interface ConversationSummary {
  date: string
  time: string
  title: string
  topic: string
  decisions: string[]
  relatedFiles: string[]
  nextSteps: string[]
  raw: string
}

export async function saveConversationSummary(params: {
  title: string
  topic: string
  decisions: string[]
  relatedFiles: string[]
  nextSteps: string[]
  discussion?: string
}): Promise<{ path: string; ok: boolean; error?: string }> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return { path: '', ok: false, error: '未打开知识库' }

  try {
    const now = new Date()
    const date = now.toISOString().slice(0, 10)
    const time = now.toISOString().slice(11, 16) // HH:MM
    const hhmm = now.toISOString().slice(11, 16).replace(':', '')

    const dir = join(vaultPath, '_briefing', 'conversations', date)
    await mkdir(dir, { recursive: true })

    const fm = [
      '---',
      `title: ${params.title}`,
      `topic: ${params.topic}`,
      `type: conversation`,
      `date: ${date}`,
      `time: ${time}`,
      `tags: [conversation]`,
      `created: ${date} ${time}`,
      '---'
    ].join('\n')

    const body = [
      fm,
      '',
      `# ${params.title}`,
      '',
      '## 讨论了什么',
      params.discussion ?? '（无记录）',
      '',
      '## 关键决策',
      ...params.decisions.map((d) => `- ${d}`),
      '',
      '## 相关文件',
      ...params.relatedFiles.map((f) => `- ${f}`),
      '',
      '## 下一步',
      ...params.nextSteps.map((s) => `- ${s}`)
    ].join('\n')

    // v1.7 (P1-2): topic 累积路径 — 如果 _briefing/topics/{topic}.md 存在则 append + 重新生成索引
    if (params.topic) {
      const topicPath = join(vaultPath, '_briefing', 'topics', `${params.topic}.md`)
      const existing = existsSync(topicPath) ? await readFile(topicPath, 'utf-8') : null
      if (existing !== null || params.topic) {
        // 累积 (即使 existing=null 也会新建首个文件)
        const composed = composeTopicFile(existing, params, date, time) as { content: string }
        await mkdir(join(vaultPath, '_briefing', 'topics'), { recursive: true })
        await writeFile(topicPath, composed.content, 'utf-8')
        return { path: topicPath, ok: true }
      }
    }

    // 默认路径: 按 date 写入 (保留 v1.5 行为)
    const filePath = join(dir, `conv-${hhmm}.md`)
    await writeFile(filePath, body, 'utf-8')
    return { path: filePath, ok: true }
  } catch (err) {
    return { path: '', ok: false, error: String(err) }
  }
}
//
// 设计: saveConversationSummary 接 params.topic, 如果 _briefing/topics/{topic}.md
// 存在则 append + 重新生成 frontmatter 索引, 不存在则新建.
// Agent 调法和之前一样, 传 topic 字段即自动触发累积.
//
// 保留旧的按 date 写入作为 fallback (如果 topic 不提供).
//
// 累计文件格式:
//   ---
//   topic: 合同管理
//   updated_at: 2026-06-05
//   entries:                  # 跨日索引
//     - { date, time, title }
//   decisions: 累计 (按时间顺序)
//   nextSteps: 累计
//   ---
//
//   ## 2026-06-01 14:30 — ABC 合同评审
//
//   ### 关键决策
//   - ...
//
//   ## 2026-06-03 09:15 — XYZ 协议补充条款
//
//   ### 关键决策
//   - ...
//
// 收益: 跨 session 知识连续 — Agent 读 1 个文件拿到该 topic 全部历史

/**
 * 纯函数: 拼装 topic 累积文件内容
 * - existingContent: 现有 topic 文件内容 (null = 新建)
 * - params: saveConversationSummary 的新条目
 * - newDate/newTime: 新条目时间戳
 * - 返回: { content, entries, decisions, nextSteps } — 拼装后的全文 + 解析用结构
 */
export function composeTopicFile(
  existingContent: string | null,
  params: {
    title: string
    topic: string
    decisions: string[]
    relatedFiles?: string[]
    nextSteps: string[]
    discussion?: string
  },
  newDate: string,
  newTime: string
): {
  content: string
  entries: { date: string; time: string; title: string }[]
  decisions: string[]
  nextSteps: string[]
} {
  // 解析现有 frontmatter 和 entries
  const existing = existingContent
    ? parseTopicFile(existingContent)
    : { entries: [], decisions: [], nextSteps: [] }

  // 追加新条目 (最新在前, 与 body 倒序一致)
  const newEntry = { date: newDate, time: newTime, title: params.title }
  const entries = [newEntry, ...existing.entries]
  // decisions/nextSteps 累计去重 + 追加
  const decisions = mergeUnique(existing.decisions, params.decisions)
  const nextSteps = mergeUnique(existing.nextSteps, params.nextSteps)

  // 重新生成 frontmatter
  const fm = [
    '---',
    `topic: ${params.topic}`,
    `updated_at: ${newDate}`,
    'entries:',
    ...entries.map((e) => `  - date: ${e.date}\n    time: ${e.time}\n    title: ${e.title}`),
    'decisions:',
    ...decisions.map((d) => `  - ${d}`),
    'nextSteps:',
    ...nextSteps.map((s) => `  - ${s}`),
    '---'
  ].join('\n')

  // 拼 body — 每日 1 段, 倒序 (最新在前)
  const newSection = [
    '',
    `# ${newDate} ${newTime} — ${params.title}`,
    '',
    '### 讨论了什么',
    params.discussion ?? '（无记录）',
    '',
    '### 关键决策',
    ...params.decisions.map((d) => `- ${d}`),
    '',
    '### 相关文件',
    ...(params.relatedFiles ?? []).map((f) => `- ${f}`),
    '',
    '### 下一步',
    ...params.nextSteps.map((s) => `- ${s}`)
  ].join('\n')

  // 拼 全部 sections (现有 + 新, 新在前)
  const existingSections = existingContent ? extractTopicSections(existingContent) : []
  const allSections = [newSection, ...existingSections].join('\n\n---\n\n')

  return {
    content: fm + '\n' + allSections,
    entries,
    decisions,
    nextSteps
  }
}

/**
 * 解析 topic 累积文件的 frontmatter + sections
 * 返回: { entries, decisions, nextSteps, sections }
 */
export function parseTopicFile(content: string): {
  entries: { date: string; time: string; title: string }[]
  decisions: string[]
  nextSteps: string[]
  sections: string[]
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!fmMatch) {
    return { entries: [], decisions: [], nextSteps: [], sections: [] }
  }
  const [, fm, body] = fmMatch

  // 解析 frontmatter
  const entries: { date: string; time: string; title: string }[] = []
  const decisions: string[] = []
  const nextSteps: string[] = []
  let inEntries = false
  let inDecisions = false
  let inNextSteps = false
  let curEntry: Partial<{ date: string; time: string; title: string }> = {}
  for (const line of fm.split('\n')) {
    if (line === 'entries:') {
      inEntries = true
      inDecisions = false
      inNextSteps = false
      curEntry = {}
      continue
    }
    if (line === 'decisions:') {
      if (curEntry.date) entries.push(curEntry as { date: string; time: string; title: string })
      curEntry = {}
      inDecisions = true
      inEntries = false
      inNextSteps = false
      continue
    }
    if (line === 'nextSteps:') {
      inNextSteps = true
      inDecisions = false
      inEntries = false
      continue
    }
    if (inEntries && line.startsWith('  - date:')) {
      // 新 entry 起始: 先 push 旧 entry (如果有), 再重置
      if (curEntry.date) {
        entries.push(curEntry as { date: string; time: string; title: string })
      }
      curEntry = { date: line.replace('  - date: ', '').trim() }
    } else if (inEntries && line.startsWith('    time:')) {
      curEntry.time = line.replace('    time: ', '').trim()
    } else if (inEntries && line.startsWith('    title:')) {
      curEntry.title = line.replace('    title: ', '').trim()
    } else if (inDecisions && line.startsWith('  - ')) {
      decisions.push(line.replace('  - ', '').trim())
    } else if (inNextSteps && line.startsWith('  - ')) {
      nextSteps.push(line.replace('  - ', '').trim())
    }
  }
  if (curEntry.date) entries.push(curEntry as { date: string; time: string; title: string })

  // 解析 body sections
  const sections = body.split(/\n---\n/).filter((s) => s.trim())

  return { entries, decisions, nextSteps, sections }
}

/** 抽 body sections (保留换行) */
function extractTopicSections(content: string): string[] {
  const { sections } = parseTopicFile(content)
  return sections
}

/** 数组去重 + 保持顺序 */
function mergeUnique<T>(existing: T[], added: T[]): T[] {
  const seen = new Set(existing)
  const result = [...existing]
  for (const item of added) {
    if (!seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}

/**
 * v1.7 (P1-2): 读 topic 累积文件 (跨日聚合)
 * 返 { topic, updatedAt, entries, decisions, nextSteps }
 * 不存在返 null
 */
export async function getTopicSummaries(topic: string): Promise<{
  topic: string
  updatedAt: string
  entries: { date: string; time: string; title: string }[]
  decisions: string[]
  nextSteps: string[]
} | null> {
  const vaultPath = getVaultPath()
  if (!vaultPath || !topic) return null

  const topicPath = join(vaultPath, '_briefing', 'topics', `${topic}.md`)
  if (!existsSync(topicPath)) return null

  try {
    const raw = await readFile(topicPath, 'utf-8')
    const parsed = parseTopicFile(raw) as {
      entries: { date: string; time: string; title: string }[]
      decisions: string[]
      nextSteps: string[]
    }
    const { entries, decisions, nextSteps } = parsed
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    const updatedAt = fmMatch ? (fmMatch[1].match(/updated_at:\s*(\S+)/)?.[1] ?? '') : ''
    return { topic, updatedAt, entries, decisions, nextSteps }
  } catch {
    return null
  }
}

// ─── Read conversation summaries for a date ───────────────────────

/**
 * v1.7: options 参数 — Agent 端省 token
 *   - topic: 过滤指定 topic 的摘要 (跨日期查同 topic 时尤其省)
 *   - maxResults: 限制返条数 (默认 50 — Agent 只需最近 N 条决策)
 */
export async function getConversationSummaries(
  date: string,
  options?: { topic?: string; maxResults?: number }
): Promise<ConversationSummary[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []

  const dir = join(vaultPath, '_briefing', 'conversations', date)
  const summaries: ConversationSummary[] = []

  try {
    const files = await readdir(dir)
    const convFiles = files.filter((f) => f.startsWith('conv-') && f.endsWith('.md')).sort()

    for (const file of convFiles) {
      try {
        const raw = await readFile(join(dir, file), 'utf-8')
        const { frontmatter } = parseFrontmatter(raw)
        // Extract decisions / nextSteps from body
        const decisions: string[] = []
        const nextSteps: string[] = []
        const lines = raw.split('\n')
        let inDecisions = false
        let inNext = false
        for (const line of lines) {
          if (line.trim() === '## 关键决策') {
            inDecisions = true
            inNext = false
            continue
          }
          if (line.trim() === '## 下一步') {
            inNext = true
            inDecisions = false
            continue
          }
          if (line.startsWith('## ')) {
            inDecisions = false
            inNext = false
          }
          if ((inDecisions || inNext) && line.startsWith('- ')) {
            const text = line.slice(2).trim()
            if (inDecisions) decisions.push(text)
            if (inNext) nextSteps.push(text)
          }
        }
        summaries.push({
          date: frontmatter.date ?? date,
          time: frontmatter.time ?? '',
          title: frontmatter.title ?? file,
          topic: frontmatter.topic ?? '',
          decisions: decisions as string[],
          relatedFiles: (frontmatter.sources as string[]) ?? [],
          nextSteps: nextSteps as string[],
          raw: raw as string
        } as BriefingReport['summaries'] extends Array<infer T> ? T : never)
      } catch {
        /* skip unreadable file */
      }
    }
  } catch {
    /* dir doesn't exist */
  }

  // v1.7: topic 过滤 + maxResults 截断
  const topicFiltered = options?.topic
    ? summaries.filter((s) => s.topic === options.topic)
    : summaries
  return options?.maxResults ? topicFiltered.slice(0, options.maxResults) : topicFiltered
}

// ─── Helpers ─────────────────────────────────────────────────────

async function getRecentChanges(
  vaultPath: string,
  days: number
): Promise<{ path: string; title: string; type: string; updated: string }[]> {
  const files = await listVaultFiles()
  const all = flattenFiles(files)
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const results: { path: string; title: string; type: string; updated: string }[] = []

  for (const f of all as Array<{ isDirectory?: boolean; path: string; name: string }>) {
    if (f.isDirectory || !f.path.endsWith('.md')) continue
    try {
      const raw = await readFile(f.path, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      const updated = frontmatter.updated ?? ''
      if (updated) {
        const t = new Date(updated).getTime()
        if (t >= cutoff) {
          results.push({
            path: f.path,
            title: frontmatter.title ?? f.name.replace('.md', ''),
            type: frontmatter.type ?? 'collection',
            updated
          })
        }
      }
    } catch {
      log.warn('[Briefing] week scan failed')
    }
  }

  return results.sort((a, b) => (a.updated < b.updated ? 1 : -1))
}

function getPeriodString(days: number): string {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return `${fmt(start)} ~ ${fmt(end)}`
}

function flattenFiles(files: unknown[]): unknown[] {
  const result: unknown[] = []
  for (const f of files) {
    result.push(f)
    if (
      f &&
      typeof f === 'object' &&
      'children' in f &&
      Array.isArray((f as { children?: unknown[] }).children)
    ) {
      result.push(...flattenFiles((f as { children: unknown[] }).children))
    }
  }
  return result
}

function makeEmpty(reason: string): BriefingReport {
  return {
    date: new Date().toISOString().slice(0, 10),
    period: '',
    newPages: 0,
    updatedPages: 0,
    entities: [],
    highlights: [],
    health: reason,
    raw: reason
  }
}
