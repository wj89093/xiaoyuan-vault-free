/**
 * agentMemory.ts — Agent 记忆系统
 *
 * 记忆分层:
 *   🔵 工作记忆  current.json（sessionManager 管理）
 *   🟡 短期记忆  _briefing/conversations/YYYY-MM-DD/（每日对话存档）
 *   🟢 持久记忆  log.md（操作日志）+ index.md（知识库结构）
 *   🟣 增量记忆  _briefing/memory-facts/{date}.md（每轮对话自动提取）
 *
 * 核心能力:
 *   buildMemoryContext(date) — 加载指定日期的记忆，构建注入上下文
 *   saveSessionSummary(session, messages, vaultPath) — 存档当前对话到 conversations/
 *   extractIncrementalFacts(messages) — 增量提取事实/决策/偏好（轻量，异步）
 *   queryMemory(query, date) — Agent 工具，搜索记忆存档
 *   generateWeeklyDigest() — 每周生成结构化摘要，写入 _briefing/summaries/
 */
import { readFile, writeFile, mkdir, readdir, appendFile, access } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { getVaultPath } from '../database/database'
import { parseFrontmatter } from '../frontmatter/index'
import { callAI } from '../ai/aiService'
import type { AgentMessage } from '../agent/types'

// ─── Build memory context for a given date ──────────────────────────
/**
 * 加载指定日期的对话存档 + 操作日志 + 增量记忆，构建 Agent 可阅读的记忆上下文。
 * 用于新 session 初始化时注入背景知识。
 */
export async function buildMemoryContext(date: string): Promise<string> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return ''

  const parts: string[] = []

  // 1. 加载增量记忆（每轮对话自动提取的事实/决策/偏好）
  const facts = await loadIncrementalFacts(date)
  if (facts.length > 0) {
    parts.push(`## 🟣 ${date} 增量记忆\n\n${facts.map(f => `- ${f}`).join('\n')}`)
  }

  // 2. 加载对话存档
  const convs = await loadConversationSummaries(date)
  if (convs.length > 0) {
    const convText = convs.map(c => {
      const decisions = c.decisions.length > 0 ? '\n  决策:\n' + c.decisions.map(d => `    - ${d}`).join('\n') : ''
      const nextSteps = c.nextSteps.length > 0 ? '\n  下一步:\n' + c.nextSteps.map(s => `    - ${s}`).join('\n') : ''
      return `## [${c.time}] ${c.title}（${c.topic}）${decisions}${nextSteps}`
    }).join('\n\n')
    parts.push(`## 📅 ${date} 对话记录\n\n${convText}`)
  }

  // 3. 加载操作日志（最近的 50 行）
  try {
    const logPath = join(vaultPath, 'log.md')
    const logRaw = await readFile(logPath, 'utf-8')
    const logLines = logRaw.split('\n').slice(-50).join('\n')
    if (logLines.trim()) {
      parts.push(`## 📋 最近操作日志\n\n${logLines}`)
    }
  } catch { /* ignore missing log */ }

  // 4. 加载工具学习经验（self-improvement）
  try {
    const learnPath = join(vaultPath, '_briefing', 'tool-learnings.md')
    const learnRaw = await readFile(learnPath, 'utf-8')
    if (learnRaw.trim()) {
      parts.push(`## 🧠 工具优化经验\n\n${learnRaw.slice(0, 3000)}`)
    }
  } catch { /* ignore missing learnings */ }

  if (parts.length === 0) return ''

  return [
    '## 🔄 上下文（来自记忆系统）',
    `以下是你在 ${date} 与用户的对话历史和操作记录，请结合这些信息理解当前对话。`,
    '',
    ...parts,
    '',
    '---',
    '以上为记忆上下文，当前对话中如需参考可使用 tool 读取相关文件。',
  ].join('\n')
}

// ─── Retry queue processor (P1.5) ──────────────────────────────────────────

async function processRetryQueue(vaultPath: string, retryQueuePath: string): Promise<void> {
  try {
    const { access, constants, readFile, appendFile, unlink } = await import('fs/promises')
    await access(retryQueuePath, constants.F_OK)
  } catch { return }  // no queue

  try {
    const raw = await readFile(retryQueuePath, 'utf-8')
    const lines = raw.split('\n').filter(l => l.trim())
    if (lines.length === 0) { try { await unlink(retryQueuePath) } catch { /* */ }; return }

    const failed: string[] = []
    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        const fp = join(vaultPath, '_briefing', 'memory-facts', entry.date + '.md')
        let exists = false
        try { await access(fp, constants.F_OK); exists = true } catch { /* */ }
        const time = entry.time ?? new Date(entry.ts).toISOString().slice(11, 16)
        const lines2 = (entry.facts as string[]).map((f: string) => `- [${time}] ${f}`)
        if (!exists) lines2.unshift(`# 增量记忆 ${entry.date}`, '', '> 每轮对话自动提取的关键事实、决策、偏好', '')
        await appendFile(fp, lines2.join('\n') + '\n', 'utf-8')
        log.info('[processRetryQueue] retry succeeded:', entry.date)
      } catch {
        failed.push(line)
      }
    }
    if (failed.length > 0) {
      await writeFile(retryQueuePath, failed.join('\n'), 'utf-8')
    } else {
      await unlink(retryQueuePath)
    }
  } catch { /* queue read failed, skip */ }
}

// ─── Incremental Memory Extraction ───────────────────────────────────
/**
 * 轻量增量记忆提取 — 每轮对话后自动运行（fire-and-forget）
 *
 * 与 saveSessionSummary 不同：此函数只处理最新的少量消息，
 * 提取 2-3 条简洁的事实，追加到每日记忆文件。
 * 不创建新文件，不阻塞主流程。
 */
export async function extractIncrementalFacts(messages: AgentMessage[], opts?: { retryQueue?: boolean }): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return

  // ── Process retry queue first (P1.5) ────────────────────────
  const retryQueuePath = join(vaultPath, '_briefing', 'memory-facts', '_retry.jsonl')
  if (opts?.retryQueue !== false) {
    // Try to process any pending failed facts before new work
    await processRetryQueue(vaultPath, retryQueuePath)
  }

  if (messages.length < 2) return

  try {
    // 只取最近一轮用户+助手交互（跳过 system / tool）
    const recent = [...messages].reverse()
    const pair: AgentMessage[] = []
    let foundUser = false
    for (const m of recent) {
      if (m.role === 'assistant' && pair.length === 0) pair.push(m)
      else if (m.role === 'user' && !foundUser) { pair.push(m); foundUser = true; break }
    }
    if (pair.length < 2) return
    pair.reverse()

    const sample = pair
      .map(m => `**${m.role}**: ${String(m.content ?? '').slice(0, 600)}`)
      .join('\n\n')

    const result = await callAI('resolve', {
      prompt: `你是记忆提取助手。从以下对话中提取 2-3 条关键事实（偏好/决策/修正/发现）。
每条约 15-30 字，用 - 开头列表返回。

对话：
${sample}

只返回列表，不要解释：`,
    }) as string

    // Parse bullet points
    const facts = String(result)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-'))
      .map(l => l.slice(1).trim())
      .filter(Boolean)
      .slice(0, 3)

    if (facts.length === 0) return

    const date = new Date().toISOString().slice(0, 10)
    const time = new Date().toISOString().slice(11, 16)
    const dir = join(vaultPath, '_briefing', 'memory-facts')
    await mkdir(dir, { recursive: true })
    const fp = join(dir, `${date}.md`)

    // Check if file exists — if not, create header
    let exists = false
    try { await access(fp, constants.F_OK); exists = true } catch { /* doesn't exist */ }

    const lines = facts.map(f => `- [${time}] ${f}`)
    if (!exists) {
      lines.unshift(`# 增量记忆 ${date}`, '', '> 每轮对话自动提取的关键事实、决策、偏好', '')
    }

    await appendFile(fp, lines.join('\n') + '\n', 'utf-8')
  } catch (e: unknown) {
    // P1.5: write failed fact to retry queue instead of silent discard
    const err = e as Error
    log.warn('[extractIncrementalFacts] failed, queuing for retry:', err.message)
    try {
      const { appendFile, mkdir } = await import('fs/promises')
      const dir = join(vaultPath, '_briefing', 'memory-facts')
      await mkdir(dir, { recursive: true })
      await appendFile(retryQueuePath, JSON.stringify({ facts, time, date, ts: Date.now(), error: err.message }) + '\n', 'utf-8')
    } catch { /* queue write failed, give up */ }
  }
}
async function loadIncrementalFacts(date: string): Promise<string[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []
  try {
    const fp = join(vaultPath, '_briefing', 'memory-facts', `${date}.md`)
    const raw = await readFile(fp, 'utf-8')
    return raw
      .split('\n')
      .filter(l => l.startsWith('- ['))
      .map(l => l.slice(l.indexOf('] ') + 2).trim())
      .filter(Boolean)
  } catch { return [] }
}

/** Search tool-call log (_briefing/tool-calls.jsonl) for matching entries */
async function searchToolLog(query: string, days: number): Promise<string[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []
  try {
    const { readFile } = await import('fs/promises')
    const { join } = await import('path')
    const fp = join(vaultPath, '_briefing', 'tool-calls.jsonl')
    const raw = await readFile(fp, 'utf-8')
    const q = query.toLowerCase()
    const results: string[] = []
    const cutoff = Date.now() - days * 86400000
    for (const line of raw.trim().split('\n')) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        const ts = Date.parse(String(entry.ts ?? ''))
        if (isNaN(ts) || ts < cutoff) continue
        const tool = String(entry.tool ?? '')
        const args = String(entry.args ?? '')
        const result = String(entry.result ?? '')
        if (tool.toLowerCase().includes(q) || args.toLowerCase().includes(q) || result.toLowerCase().includes(q)) {
          const dur = entry.dur_ms ? ` (${entry.dur_ms}ms)` : ''
          const err = entry.error ? ' ❌' : ''
          results.push(`[${String(entry.ts ?? '').slice(0, 16)}] ${tool}${dur}${err}\n  ${args.slice(0, 120)}`)
        }
      } catch { continue }
      if (results.length >= 5) break
    }
    return results
  } catch { return [] }
}

// ─── Self-Improvement: Extract learnings from tool logs ─────────────
/**
 * 分析最近工具调用日志，自动提取优化经验。
 * 追加到 _briefing/tool-learnings.md（去重）。
 * 在 session reset 或每天首次会话时调用。
 */
export async function extractToolLearnings(): Promise<{ entries: number; ok: boolean }> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return { entries: 0, ok: false }

  try {
    const { readFile, mkdir, writeFile } = await import('fs/promises')
    const { join } = await import('path')

    // 1. Read tool-calls.jsonl
    const fp = join(vaultPath, '_briefing', 'tool-calls.jsonl')
    let raw: string
    try { raw = await readFile(fp, 'utf-8') } catch { return { entries: 0, ok: false } }

    const lines = raw.trim().split('\n')
    if (lines.length < 3) return { entries: 0, ok: true }

    // 2. Parse recent entries (last 20, within 2 days)
    const cutoff = Date.now() - 2 * 86400000
    const entries: Array<Record<string, unknown>> = []
    for (const line of lines.slice(-20)) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        const ts = Date.parse(String(entry.ts ?? ''))
        if (ts > cutoff) entries.push(entry)
      } catch { continue }
    }
    if (entries.length === 0) return { entries: 0, ok: true }

    // 3. Extract patterns
    const errorEntries = entries.filter(e => e.error === true)
    const slowEntries = entries.filter(e => Number(e.dur_ms ?? 0) > 3000)
    const toolCounts: Record<string, number> = {}
    for (const e of entries) {
      const t = String(e.tool ?? '')
      toolCounts[t] = (toolCounts[t] || 0) + 1
    }

    // 4. Build prompt for LLM to analyze
    const summary = [
      `最近工具调用 ${entries.length} 次。`,
      errorEntries.length > 0 ? `失败 ${errorEntries.length} 次: ${errorEntries.map(e => `${e.tool}(${String(e.args).slice(0, 60)}) → ${String(e.result).slice(0, 60)}`).join('; ')}` : '',
      slowEntries.length > 0 ? `慢调用 ${slowEntries.length} 次 (>3s): ${slowEntries.map(e => `${e.tool} (${e.dur_ms}ms)`).join(', ')}` : '',
      `工具分布: ${Object.entries(toolCounts).map(([k, v]) => `${k}×${v}`).join(', ')}`,
    ].filter(Boolean).join('\n')

    const today = new Date().toISOString().slice(0, 10)

    const result = await callAI('resolve', {
      prompt: `你是工具优化分析助手。从以下工具调用摘要中提取 1-3 条可操作的优化建议。

${summary}

格式（严格）：
- ${today} | {场景} | {优化前问题} → {优化后做法} | 效果: {简述}

每条约 20-50 字。只返回列表，不要解释。如果无明显优化点，返回空。`,
    }) as string

    // 5. Parse and dedup
    const newEntries = String(result)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('- ') && l.includes('|'))
      .map(l => l.slice(2).trim())

    if (newEntries.length === 0) return { entries: 0, ok: true }

    // Read existing learnings for dedup
    const learnPath = join(vaultPath, '_briefing', 'tool-learnings.md')
    let existing = ''
    try { existing = await readFile(learnPath, 'utf-8') } catch { /* new file */ }

    const existingSet = new Set(
      existing.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2, l.indexOf(' | ')))
    )

    const added: string[] = []
    for (const entry of newEntries) {
      const key = entry.split(' | ')[0] ?? ''
      if (key && !existingSet.has(key)) {
        added.push(entry)
        existingSet.add(key)
      }
    }

    if (added.length === 0) return { entries: 0, ok: true }

    // 6. Append
    if (!existing.trim()) {
      existing = '# 工具优化经验\n\n> AI 自动从工具调用日志中提取的优化建议。\n\n'
    }
    await mkdir(join(vaultPath, '_briefing'), { recursive: true })
    await writeFile(learnPath, existing.trimEnd() + '\n' + added.map(e => `- ${e}`).join('\n') + '\n', 'utf-8')

    return { entries: added.length, ok: true }
  } catch {
    return { entries: 0, ok: false }
  }
}

// ─── Query memory ─────────────────────────────────────────────────────
/**
 * Agent 调用此工具搜索记忆存档。
 * date 不传时查最近 7 天。
 * 同时搜索对话摘要 + 增量记忆。
 */
export async function queryMemory(query: string, date?: string): Promise<string> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return '无记忆（未打开知识库）'

  // 默认查最近 7 天
  const days = date ? 1 : 7
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000)
    dates.push(d.toISOString().slice(0, 10))
  }

  const results: string[] = []
  for (const d of dates) {
    // 搜索对话摘要
    const convs = await loadConversationSummaries(d)
    const q = query.toLowerCase()
    for (const c of convs) {
      const matched: string[] = []
      if (c.title.toLowerCase().includes(q)) matched.push(`标题: ${c.title}`)
      if (c.topic.toLowerCase().includes(q)) matched.push(`话题: ${c.topic}`)
      if (c.decisions.some(dd => dd.toLowerCase().includes(q))) matched.push(`决策: ${c.decisions.filter(dd => dd.toLowerCase().includes(q)).join('; ')}`)
      if (c.nextSteps.some(ss => ss.toLowerCase().includes(q))) matched.push(`下一步: ${c.nextSteps.filter(ss => ss.toLowerCase().includes(q)).join('; ')}`)
      if (matched.length > 0) {
        results.push(`[${d} ${c.time}] ${c.title}（${c.topic}）\n  ${matched.join('\n  ')}`)
      }
    }

    // 搜索增量记忆
    const facts = await loadIncrementalFacts(d)
    const matchingFacts = facts.filter(f => f.toLowerCase().includes(q))
    if (matchingFacts.length > 0) {
      results.push(`[${d}] 增量记忆:\n  ${matchingFacts.map(f => `- ${f}`).join('\n  ')}`)
    }
  }

  // 搜索工具调用日志
  const toolLogHits = await searchToolLog(query, days)
  if (toolLogHits.length > 0) {
    results.push('\n## 工具调用记录\n' + toolLogHits.join('\n'))
  }

  if (results.length === 0) return `未找到与「${query}」相关的记忆。`

  return ['## 记忆搜索结果（' + query + '）', '', ...results].join('\n')
}

// ─── Save session summary ──────────────────────────────────────────
/**
 * 将当前 session 的对话内容存档到 _briefing/conversations/YYYY-MM-DD/
 * 由 sessionManager 在 session 结束（reset / 新日期）时调用。
 */
export async function saveSessionSummary(params: {
  date: string      // session 对应的日期（YYYY-MM-DD）
  sessionId: string
  messages: AgentMessage[]
  vaultPath?: string
}): Promise<{ path: string; ok: boolean; error?: string }> {
  const vaultPath = params.vaultPath ?? getVaultPath()
  if (!vaultPath) return { path: '', ok: false, error: 'No vault open' }
  if (!params.messages || params.messages.length === 0) return { path: '', ok: false, error: 'No messages' }

  try {
    const now = new Date()
    const time = now.toISOString().slice(11, 16) // HH:MM
    const hhmm = time.replace(':', '')
    const dir = join(vaultPath, '_briefing', 'conversations', params.date)
    await mkdir(dir, { recursive: true })

    // 用 LLM 从对话中提取摘要信息
    const { topic, decisions, nextSteps, raw } = await summarizeConversation(params.messages)

    const fm = [
      '---',
      `title: ${raw.title}`,
      `topic: ${topic}`,
      `type: conversation`,
      `date: ${params.date}`,
      `time: ${time}`,
      `session: ${params.sessionId}`,
      `tags: [conversation]`,
      '---',
    ].join('\n')

    const body = [
      fm,
      '',
      `# ${raw.title}`,
      '',
      '## 讨论内容',
      raw.discussion,
      '',
      '## 关键决策',
      ...decisions.map(d => `- ${d}`),
      '',
      '## 相关文件',
      ...(raw.files || []).map(f => `- ${f}`),
      '',
      '## 下一步',
      ...nextSteps.map(s => `- ${s}`),
    ].join('\n')

    const filePath = join(dir, `conv-${hhmm}.md`)
    await writeFile(filePath, body, 'utf-8')
    return { path: filePath, ok: true }
  } catch (err) {
    return { path: '', ok: false, error: String(err) }
  }
}

// ─── Internal helpers ───────────────────────────────────────────────

interface ConversationSummary {
  date: string
  time: string
  title: string
  topic: string
  decisions: string[]
  nextSteps: string[]
  raw: { discussion: string; title: string; files: string[] }
}

async function loadConversationSummaries(date: string): Promise<ConversationSummary[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []
  const dir = join(vaultPath, '_briefing', 'conversations', date)
  const summaries: ConversationSummary[] = []
  try {
    const files = await readdir(dir)
    const convFiles = files.filter(f => f.startsWith('conv-') && f.endsWith('.md')).sort()
    for (const file of convFiles) {
      try {
        const raw = await readFile(join(dir, file), 'utf-8')
        const { frontmatter } = parseFrontmatter(raw)
        const decisions: string[] = []
        const nextSteps: string[] = []
        let inDecisions = false
        let inNext = false
        for (const line of raw.split('\n')) {
          if (line.trim() === '## 关键决策') { inDecisions = true; inNext = false; continue }
          if (line.trim() === '## 下一步') { inNext = true; inDecisions = false; continue }
          if (line.startsWith('## ')) { inDecisions = false; inNext = false }
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
          decisions,
          nextSteps,
          raw: {
            discussion: '',
            title: frontmatter.title ?? file,
            files: (frontmatter.sources as string[]) ?? [],
          },
        })
      } catch { /* skip unreadable file */ }
    }
  } catch { /* dir doesn't exist */ }
  return summaries
}

async function summarizeConversation(messages: AgentMessage[]): Promise<{
  topic: string
  decisions: string[]
  nextSteps: string[]
  raw: { discussion: string; title: string; files: string[] }
}> {
  // 过滤掉 system 消息，只留 user + assistant
  const userMsgs = messages.filter(m => m.role === 'user')
  const assistantMsgs = messages.filter(m => m.role === 'assistant')

  // 取前 10 条摘要样本（避免 token 过多）
  const sample = [...userMsgs, ...assistantMsgs]
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(-10)
    .map(m => `**${m.role}**: ${String(m.content ?? '').slice(0, 500)}`)
    .join('\n\n')

  try {
    const result = await callAI('resolve', {
      prompt: `你是晓园 Vault 的记忆整理助手。请从以下对话记录中提取关键信息。

对话记录：
${sample}

请严格返回 JSON（不要有解释）：
{
  "topic": "一句话描述这个对话在讨论什么（15字内）",
  "decisions": ["关键决策1", "关键决策2"],
  "nextSteps": ["下一步行动1", "下一步行动2"],
  "raw": {
    "discussion": "一段话概括讨论内容（50字内）",
    "title": "对话标题（20字内）",
    "files": ["提及的相关文件1", "相关文件2"]
  }
}`,
    }) as string

    const match = String(result).match(/\{[\s\S]*\}/)
    if (!match) return makeEmpty()
    const p = JSON.parse(match[0]) as Record<string, unknown>
    return {
      topic: String(p.topic ?? ''),
      decisions: (p.decisions as unknown[] || []).slice(0, 5) as string[],
      nextSteps: (p.nextSteps as unknown[] || []).slice(0, 5) as string[],
      raw: {
        discussion: String((p.raw as Record<string, unknown>)?.discussion ?? ''),
        title: String((p.raw as Record<string, unknown>)?.title ?? ''),
        files: ((p.raw as Record<string, unknown>)?.files as unknown[] || []).slice(0, 10) as string[],
      },
    }
  } catch {
    return makeEmpty()
  }
}

function makeEmpty() {
  return {
    topic: '对话',
    decisions: [] as string[],
    nextSteps: [] as string[],
    raw: { discussion: '', title: '对话记录', files: [] as string[] },
  }
}

async function loadConversationSummariesForWeek(date: string): Promise<ConversationSummary[]> {
  return loadConversationSummaries(date)
}

// ─── Weekly digest ───────────────────────────────────────────────────
/**
 * 生成周报摘要，写入 _briefing/summaries/weekly-YYYY-MM-DD.md
 * 由 sessionManager 在新周一首次对话时调用（检测上一周）
 */
export async function generateWeeklyDigest(): Promise<{ path: string; ok: boolean }> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return { path: '', ok: false }

  try {
    // 取上一周的日期范围
    const now = new Date()
    const dayOfWeek = now.getDay() || 7  // 0=周日 → 7
    const weekStart = new Date(now.getTime() - (dayOfWeek - 1) * 86400000)
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const weekStartStr = fmt(weekStart)
    const weekEndStr = fmt(weekEnd)

    // 收集本周每天的 conversations
    const dailySummaries: { date: string; convs: ConversationSummary[] }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart.getTime() + i * 86400000)
      const dateStr = fmt(d)
      const convs = await loadConversationSummariesForWeek(dateStr)
      if (convs.length > 0) {
        dailySummaries.push({ date: dateStr, convs })
      }
    }

    if (dailySummaries.length === 0) {
      return { path: '', ok: false }
    }

    // 汇总本周摘要
    const summaryLines: string[] = []
    let totalDecisions = 0
    let totalActions = 0
    for (const { date, convs } of dailySummaries) {
      summaryLines.push(`\n### ${date}`)
      for (const c of convs) {
        summaryLines.push(`- **${c.title}**（${c.topic}）`)
        if (c.decisions.length > 0) summaryLines.push(`  - 决策: ${c.decisions.join('; ')}`)
        if (c.nextSteps.length > 0) summaryLines.push(`  - 下一步: ${c.nextSteps.join('; ')}`)
        totalDecisions += c.decisions.length
        totalActions += c.nextSteps.length
      }
    }

    const dir = join(vaultPath, '_briefing', 'summaries')
    await mkdir(dir, { recursive: true })
    const weeklyFp = join(dir, `weekly-${weekStartStr}.md`)

    const body = [
      '---',
      `title: 周报 ${weekStartStr} ~ ${weekEndStr}`,
      `type: weekly-digest`,
      `date: ${weekStartStr}`,
      `tags: [weekly-digest, auto-generated]`,
      '---',
      '',
      `# 📊 周报 ${weekStartStr} ~ ${weekEndStr}`,
      '',
      `> 本周共 ${dailySummaries.length} 天有对话记录，${totalDecisions} 项决策，${totalActions} 项待办。`,
      '',
      ...summaryLines,
    ].join('\n')

    await writeFile(weeklyFp, body, 'utf-8')
    return { path: weeklyFp, ok: true }
  } catch {
    return { path: '', ok: false }
  }
}
