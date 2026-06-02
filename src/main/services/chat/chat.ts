import { getVaultPath } from '../database/database'
import { callAI } from '../ai/aiService'
import { retrieveRelevantPages } from '../search/ragService'
import { readFile, readdir } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import log from 'electron-log/main'

// ============ Types ============

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

export const SESSION_TITLE_MAX_LEN = 50

export interface ChatMessage {
  id?: number
  session_id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
}

export interface ChatSession {
  id: string
  title: string
  created_at: number
  updated_at: number
  systemPrompt: string | null
}

interface RAGResult {
  path: string
  file: string // alias for path
  title: string
  content: string
  score: number
}
// ============ Validation Helpers ============

function _isValidSession(obj: unknown): obj is ChatSession {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'string' &&
    'title' in obj &&
    typeof (obj as Record<string, unknown>).title === 'string' &&
    'created_at' in obj &&
    typeof (obj as Record<string, unknown>).created_at === 'number' &&
    'updated_at' in obj &&
    typeof (obj as Record<string, unknown>).updated_at === 'number'
  )
}

function _isValidMessage(obj: unknown): obj is ChatMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'role' in obj &&
    typeof (obj as Record<string, unknown>).role === 'string' &&
    'content' in obj &&
    typeof (obj as Record<string, unknown>).content === 'string'
  )
}

// ── Dynamic system prompt loader ─────────────────────────────────

/**
 * Load Agent system prompt from vault or template.
 *
 * Precedence:
 * 1. vault/system.md (user override)
 * 2. built-in template (XML-structured)
 *
 * Fallback: legacy LLM-wiki.md + Agents.md (existing vaults)
 */
const _cache: { vaultPath: string; content: string; ts: number } = {
  vaultPath: '',
  content: '',
  ts: 0
}
const _CACHE_TTL_MS = 30_000

export async function loadVaultSystemPrompt(vaultPath: string): Promise<string> {
  if (vaultPath === _cache.vaultPath && Date.now() - _cache.ts < _CACHE_TTL_MS) {
    return _cache.content
  }

  const parts: string[] = []

  // 1. Vault override: system.md
  const vaultSystemPath = join(vaultPath, 'system.md')
  if (existsSync(vaultSystemPath)) {
    try {
      parts.push(await readFile(vaultSystemPath, 'utf-8'))
    } catch {
      /* skip */
    }
  } else {
    // 2. Built-in template: system.md (XML-structured, preferred)
    const tmpl = resolveTemplatePath('system.md')
    if (tmpl) parts.push(tmpl)
  }

  // 3. Legacy fallback: vault LLM-wiki.md
  if (parts.length === 0) {
    const vaultWikiPath = join(vaultPath, 'LLM-wiki.md')
    if (existsSync(vaultWikiPath)) {
      try {
        parts.push(await readFile(vaultWikiPath, 'utf-8'))
      } catch {
        /* skip */
      }
    } else {
      const tmpl = resolveTemplatePath('LLM-wiki.md')
      if (tmpl) parts.push(tmpl)
    }
  }

  // 4. Legacy fallback: only if system.md not loaded
  if (parts.length === 0) {
    const vaultAgentsPath = join(vaultPath, 'Agents.md')
    if (existsSync(vaultAgentsPath)) {
      try {
        parts.push(await readFile(vaultAgentsPath, 'utf-8'))
      } catch {
        /* skip */
      }
    } else {
      const tmpl = resolveTemplatePath('Agents.md')
      if (tmpl) parts.push(tmpl)
    }
  }

  const content = parts.join('\n')
  _cache.vaultPath = vaultPath
  _cache.content = content
  _cache.ts = Date.now()
  return content
}

// ─── Skill Router ──────────────────────────────────────────────────

interface SkillMeta {
  name: string
  triggers: string[]
  noTriggers: string[]
  autoTrigger: boolean
}

/** Match user question against skill triggers. Returns matched skill content. */
export async function matchSkills(vaultPath: string, question: string): Promise<string> {
  const skills: string[] = []
  const tmplDir = resolveSkillsDir()
  if (tmplDir) await loadSkillsFromDir(tmplDir, question, skills, /* trusted */ true)
  const vaultSkillsDir = join(vaultPath, '.xiaoyuan', 'skills')
  if (existsSync(vaultSkillsDir))
    await loadSkillsFromDir(vaultSkillsDir, question, skills, /* trusted */ false)
  return skills.join('\n\n')
}

function resolveSkillsDir(): string | null {
  const srcPath = join(app.getAppPath(), 'src', 'main', 'templates', 'skills')
  if (existsSync(srcPath)) return srcPath
  const outPath = join(__dirname, '..', 'templates', 'skills')
  if (existsSync(outPath)) return outPath
  return null
}

async function loadSkillsFromDir(
  dir: string,
  question: string,
  out: string[],
  trusted: boolean
): Promise<void> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return
  }
  const q = question.toLowerCase()
  for (const file of files) {
    if (!file.endsWith('.md')) continue
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      const meta = parseSkillFrontmatter(raw)
      if (!meta) continue
      if (meta.autoTrigger) {
        out.push(trusted ? raw : sanitizeSkillContent(raw, meta.name))
        continue
      }
      if (meta.noTriggers.some((t) => q.includes(t.toLowerCase()))) continue
      if (meta.triggers.some((t) => q.includes(t.toLowerCase()))) {
        out.push(trusted ? raw : sanitizeSkillContent(raw, meta.name))
      }
    } catch {
      /* skip */
    }
  }
}

/** Sanitize untrusted user skill: strip dangerous markdown content, keep safe frontmatter only. */
function sanitizeSkillContent(raw: string, name: string): string {
  // Only keep frontmatter + safe structural markers (# headers, - lists, code fences with no injections)
  const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/)
  const fm = fmMatch ? fmMatch[0] : ''
  // Allow only: # H1-H3, ## H2-H3, - bullet lists, 1. ordered lists, `inline code`, ``` code blocks
  // Strip everything else (instructions, role-play, prompt injection attempts)
  const afterFm = fmMatch ? raw.slice(fmMatch[0].length) : raw
  const dangerous = [
    /you are/gi,
    /ignore previous/gi,
    /disregard/gi,
    /system prompt/gi,
    /override/gi ///g,
  ]
  const isDangerous = dangerous.some((p) => p.test(afterFm))
  if (isDangerous) {
    log.warn('[matchSkills] blocked dangerous skill content:', name)
    // Return frontmatter only with safety notice
    return fm + '\n# Skill: ' + name + '\n⚠️ 此技能内容已被静默过滤（安全策略）'
  }
  // Allow safe content through unchanged
  return raw
}

function parseSkillFrontmatter(raw: string): SkillMeta | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return null
  const fm = fmMatch[1]
  const nameMatch = fm.match(/^name:\s*(.+)/m)
  if (!nameMatch?.[1]) return null
  const triggers: string[] = []
  const noTriggers: string[] = []
  let autoTrigger = false
  let inTriggers = false
  let inNoTriggers = false
  for (const line of fm.split('\n')) {
    if (line.trim() === 'triggers:') {
      inTriggers = true
      inNoTriggers = false
      continue
    }
    if (line.trim() === 'noTriggers:') {
      inNoTriggers = true
      inTriggers = false
      continue
    }
    if (line.trim() === 'autoTrigger: true') {
      autoTrigger = true
      continue
    }
    if (!line.startsWith('  - ')) {
      inTriggers = false
      inNoTriggers = false
      continue
    }
    const val = line.slice(4).trim()
    if (inTriggers) triggers.push(val)
    else if (inNoTriggers) noTriggers.push(val)
  }
  return { name: nameMatch[1].trim(), triggers, noTriggers, autoTrigger }
}

/** 解析模板文件路径：dev → src/main/templates/，prod → out/main/templates/ */
function resolveTemplatePath(filename: string): string | null {
  const srcPath = join(app.getAppPath(), 'src', 'main', 'templates', filename)
  const outPath = join(__dirname, '..', 'templates', filename)
  if (existsSync(srcPath)) return readFileSync(srcPath, 'utf-8')
  if (existsSync(outPath)) return readFileSync(outPath, 'utf-8')
  return null
}

const MAX_CONTEXT_LENGTH = 200000 // DeepSeek 1M tokens, 20% budget ≈ 200K chars
const _SESSIONS_FILE = 'chat-sessions.json'

/**
 * Build index.md context with hierarchical loading.
 * Priority: section titles first → section content by budget.
 * Ensures headers survive even if content overflows.
 */
export async function buildIndexContext(vaultPath: string, maxChars = 3000): Promise<string> {
  try {
    const indexPath = join(vaultPath, 'index.md')
    if (!existsSync(indexPath)) return ''
    const content = await readFile(indexPath, 'utf-8')
    if (content.length <= maxChars) return content

    // Split into sections by ## headers
    const sections: { title: string; body: string; start: number }[] = []
    const lines = content.split('\n')
    let currentTitle = '(无标题)'
    let bodyLines: string[] = []
    let startPos = 0

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (bodyLines.length > 0) {
          sections.push({ title: currentTitle, body: bodyLines.join('\n'), start: startPos })
        }
        currentTitle = line.slice(3).trim()
        bodyLines = []
        startPos = content.indexOf(line)
      } else {
        bodyLines.push(line)
      }
    }
    if (bodyLines.length > 0) {
      sections.push({ title: currentTitle, body: bodyLines.join('\n'), start: startPos })
    }

    // Build: all section titles + section bodies until budget runs out
    const resultParts: string[] = []
    let used = 0
    for (const sec of sections) {
      const titleLine = `## ${sec.title}`
      if (used + titleLine.length > maxChars) {
        // Just put the title if space allows
        if (used + titleLine.length < maxChars) {
          resultParts.push(titleLine)
          used += titleLine.length
        }
        break
      }
      resultParts.push(titleLine)
      used += titleLine.length

      // Add body line by line
      const bodyLines2 = sec.body.split('\n')
      for (const bl of bodyLines2) {
        if (used + bl.length + 1 > maxChars) {
          resultParts.push(bl.slice(0, Math.max(0, maxChars - used - 1)))
          return resultParts.join('\n')
        }
        resultParts.push(bl)
        used += bl.length + 1
      }
    }
    return resultParts.join('\n')
  } catch {
    return ''
  }
}

/**
 * Three-stage RAG pipeline: rewrite → retrieve → answer
 * Inspired by OpenWiki Ask Sidebar (wiki_ask)
 */
export async function askQuestion(
  question: string,
  contextMessages: ChatMessage[] = []
): Promise<{
  answer: string
  sources: { file: string; title: string; snippet: string }[]
  confidence: number
}> {
  const vaultPath = getVaultPath()
  if (!vaultPath) {
    return { answer: '请先打开知识库。', sources: [], confidence: 0 }
  }

  try {
    // Stage 0: Rewrite query (extract key concepts)
    const searchQuery = await rewriteQuery(question, contextMessages)

    // Stage 1: Retrieve relevant pages via FTS5
    const results = await retrieveRelevantPages(searchQuery)
    log.info(`[RAG] found ${results.length} relevant pages for: ${question.slice(0, 50)}`)

    // Stage 2: Generate answer with context
    const { answer, confidence } = await generateAnswer(question, results, contextMessages)

    // Format sources
    const sources = results.slice(0, 3).map((r) => ({
      file: r.path,
      title: r.title,
      snippet: r.content
    }))

    return { answer, sources, confidence }
  } catch (err) {
    log.error('[RAG] ask failed:', (err as any).message)
    return {
      answer: `抱歉，搜索时出现错误：${(err as any).message}`,
      sources: [],
      confidence: 0
    }
  }
}

export async function askQuestionStream(
  question: string,
  contextMessages: ChatMessage[] = []
): Promise<{ results: RAGResult[]; confidence: number }> {
  const vaultPath = getVaultPath()
  if (!vaultPath) {
    return { results: [], confidence: 0 }
  }

  try {
    const searchQuery = await rewriteQuery(question, contextMessages)
    const results = await retrieveRelevantPages(searchQuery)
    log.info(`[RAG] stream found ${results.length} pages for: ${question.slice(0, 50)}`)
    return {
      results,
      confidence: Math.min(0.3 + results.length * 0.15, 1.0)
    }
  } catch (err) {
    log.error('[RAG] stream retrieve failed:', (err as any).message)
    return { results: [], confidence: 0 }
  }
}

/**
 * Build system + user prompts for streaming answer generation.
 */
export async function buildAnswerPrompt(
  question: string,
  results: RAGResult[],
  history: ChatMessage[]
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const contextParts: string[] = []
  let totalChars = 0

  for (const r of results) {
    const path = r.file || r.path
    if (!path) {
      contextParts.push('[来源: ' + (r.title || '') + ']\n(r.file missing)')
      i += 0
      continue
    }
    const fullContent = existsSync(path)
      ? (await readFile(path, 'utf-8')).slice(0, 30000)
      : (r.snippet ?? '')
    const block = `[来源: ${r.title}]\n${fullContent}`
    if (totalChars + block.length > MAX_CONTEXT_LENGTH) break
    contextParts.push(block)
    totalChars += block.length
  }

  const context = contextParts.join('\n\n---\n\n')
  const recentHistory = history
    .slice(-20)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n')

  // 系统提示词由 loadVaultSystemPrompt 加载 LLM-wiki.md + Agents.md 模板，
  // SelfAgentAdapter 会自动合并；此处只附加动态上下文
  const systemPrompt = [
    '对话历史：',
    recentHistory || '(无)',
    '',
    '知识库检索结果：',
    context || '(无相关结果)'
  ].join('\n')

  return {
    systemPrompt,
    userPrompt: question
  }
}

// ============ Stage 0: Rewrite ============

async function rewriteQuery(question: string, history: ChatMessage[]): Promise<string> {
  // If question is already keyword-like, use directly
  if (question.length < 50 && !question.includes('?')) {
    return question
  }

  // For simple questions, skip AI rewrite (cost saving)
  if (question.length < 30) {
    return question
  }

  try {
    const recentHistory = history
      .slice(-4)
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n')

    const rewritten = await callAI('reason', {
      question,
      context: [recentHistory],
      systemPrompt: `你是一个搜索查询重写助手。将用户的问题改写为1-2个关键词短语，用于在知识库中搜索。

规则：
- 提取核心概念，去除问句结构
- 中文保留原词，英文缩写保留
- 相关概念用空格分隔
- 最多返回20个字

用户问题: "${question}"
对话历史: ${recentHistory ? '最近对话：' + recentHistory : '无'}

只返回改写后的搜索词，不要解释。`
    })

    // For 'reason' type, the function callAI returns the raw response
    // Clean up and truncate
    const cleaned = String(rewritten ?? question)
      .trim()
      .slice(0, 50)
    log.info(`[RAG] query rewrite: "${question.slice(0, 40)}" → "${cleaned}"`)
    return cleaned ?? question
  } catch (err) {
    log.warn('[RAG] rewriteQuery failed, using original:', err)
    return question
  }
}

// ============ Stage 1: Retrieve ============

/**
 * Retrieve relevant pages for a query.
 * Per LLM Wiki spec: first read index.md to find relevant pages, then drill into them.
 * Falls back to FTS5 search within _wiki/ directory if index is missing.
 */
async function generateAnswer(
  question: string,
  results: RAGResult[],
  history: ChatMessage[]
): Promise<{ answer: string; confidence: number }> {
  // Build context from retrieved pages
  const contextParts: string[] = []
  let totalChars = 0

  for (const r of results) {
    const path = r.file || r.path
    if (!path) {
      contextParts.push('[来源: ' + (r.title || '') + ']\n(r.file missing)')
      i += 0
      continue
    }
    const fullContent = existsSync(path)
      ? (await readFile(path, 'utf-8')).slice(0, 30000)
      : (r.snippet ?? '')
    const block = `[来源: ${r.title}]\n${fullContent}`
    if (totalChars + block.length > MAX_CONTEXT_LENGTH) break
    contextParts.push(block)
    totalChars += block.length
  }

  const context = contextParts.join('\n\n---\n\n')
  const _recentHistory = history
    .slice(-20)
    .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
    .join('\n')

  const vaultPath = getVaultPath() ?? ''
  const systemBase = vaultPath ? await loadVaultSystemPrompt(vaultPath) : ''

  try {
    const answer = await callAI('reason', {
      question,
      context: [context],
      systemPrompt: systemBase
    })

    const answerText = typeof answer === 'string' ? answer : String(answer ?? '')

    // Estimate confidence based on retrieved results
    const confidence = results.length > 0 ? Math.min(0.3 + results.length * 0.15, 1.0) : 0.1

    return { answer: answerText, confidence }
  } catch (err) {
    log.error('[RAG] answer generation failed:', (err as any).message)
    return {
      answer: `AI 回答生成失败：${(err as any).message}。请尝试换个问法。`,
      confidence: 0
    }
  }
}

// ============ Session Management ============

// ─── Session management (delegated) ─────────────────────────────────
export {
  getSessionsDir,
  loadSessions,
  saveSessions,
  createSession,
  deleteSession,
  loadMessages,
  saveMessages
} from './chatSessions'

export { retrieveRelevantPages, extractSnippet } from '../search/ragService'
