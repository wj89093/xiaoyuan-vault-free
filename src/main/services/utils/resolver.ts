/**
 * resolver.ts — 内容类型/意图分类（开源版简化）
 *
 * 开源版不含内置 LLM，所以不能像 Pro 那样做 LLM-first 分类。
 * 这里用简单规则做兜底：基于 frontmatter 字段、文件名、长度等做启发式判断。
 */

import { basename, extname } from 'path'

// ─── 规则化分类 ─────────────────────────────────────────────────────

const RESEARCH_KEYWORDS = ['研究', '论文', '实验', '论文', '报告', 'review', 'research', 'paper', 'study']
const MEETING_KEYWORDS = ['会议', 'meeting', '纪要', 'minutes']
const NOTE_KEYWORDS = ['随笔', 'note', '想法', 'idea', '思考']
const REFERENCE_KEYWORDS = ['参考', 'reference', '手册', 'manual', 'guide']

function inferType(title: string, content: string): 'research' | 'document' | 'meeting' | 'note' | 'reference' | 'idea' {
  const text = (title + ' ' + content.slice(0, 500)).toLowerCase()

  if (RESEARCH_KEYWORDS.some(k => text.includes(k))) return 'research'
  if (MEETING_KEYWORDS.some(k => text.includes(k))) return 'meeting'
  if (NOTE_KEYWORDS.some(k => text.includes(k))) return 'note'
  if (REFERENCE_KEYWORDS.some(k => text.includes(k))) return 'reference'
  return 'document'
}

function inferIntent(title: string): 'enrich' | 'query' | 'maintain' | 'unknown' {
  const t = title.toLowerCase()
  if (t.includes('整理') || t.includes('enrich') || t.includes('摄入')) return 'enrich'
  if (t.includes('查询') || t.includes('query') || t.includes('找')) return 'query'
  if (t.includes('lint') || t.includes('检查') || t.includes('健康')) return 'maintain'
  return 'unknown'
}

// ─── 公开 API ─────────────────────────────────────────────────────────

export interface ResolverResult {
  intent: 'enrich' | 'query' | 'maintain' | 'unknown'
  type: string
  confiance: 'high' | 'medium' | 'low'
  reason: string
}

/**
 * 分类内容（开源版规则版）
 */
export async function resolveContentType(
  content: string,
  title?: string
): Promise<ResolverResult> {
  const t = title || basename(content, extname(content))
  return {
    intent: inferIntent(t),
    type: inferType(t, content),
    confiance: 'medium',
    reason: '开源版：基于关键词的简单规则分类（无 LLM）',
  }
}

/**
 * 简单 query 回答（开源版 stub：返回"请用 Skill.md 接入你的 AI"）
 */
export async function queryVault(_question: string): Promise<string> {
  return '开源版不含内置 AI。请打开 设置 → Skill.md 把工作手册发给你的 Agent（如 OpenClaw / Claude Code / 自建 LLM），让它帮你查询 vault。'
}
