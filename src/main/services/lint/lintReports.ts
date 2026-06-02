import { existsSync } from 'fs'
import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import { join, dirname } from 'path'
import { getVaultPath } from '../database/database'
import { parseFrontmatter, applyFrontmatter } from '../frontmatter/index'
import { callAI } from '../ai/aiService'
import log from 'electron-log/main'
import type { MaintainReport } from '../lint/maintain'

// ─── Lint Report Types ───────────────────────────────────────────────

export interface LintFixSuggestion {
  issueType: string
  pagePath?: string
  title?: string
  suggestion: string
  action: 'fix' | 'ignore'
  deadTarget?: string
  orphanTarget?: string
  oldValue?: string
  newValue?: string
  source?: string
  recommendedValue?: string
}

export interface LintReportWithFixes extends MaintainReport {
  fixSuggestions: LintFixSuggestion[]
  savedAt: number
}

// ─── Lint Report Storage ─────────────────────────────────────────────

const lintReportCachePath = (vaultPath: string) => join(vaultPath, '.xiaoyuan', 'lint-reports.json')

export async function saveLintReport(report: LintReportWithFixes): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return
  const cachePath = lintReportCachePath(vaultPath)
  await mkdir(dirname(cachePath), { recursive: true })
  const existing: LintReportWithFixes[] = await readLintReportsInternal().catch(() => [])
  const updated = [report, ...existing].slice(0, 30)
  await writeFile(cachePath, JSON.stringify(updated, null, 2), 'utf-8')
}

async function readLintReportsInternal(): Promise<LintReportWithFixes[]> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return []
  const cachePath = lintReportCachePath(vaultPath)

  if (!existsSync(cachePath)) return []
  const raw = await readFile(cachePath, 'utf-8')

  return JSON.parse(raw) as LintReportWithFixes[]
}

export async function getLintReports(): Promise<LintReportWithFixes[]> {
  return readLintReportsInternal()
}

// ─── Banner Notification ─────────────────────────────────────────────

let _bannerSender: ((type: string, title: string, body?: string) => void) | null = null

export function registerBannerSender(
  sender: (type: string, title: string, body?: string) => void
): void {
  _bannerSender = sender
}

export function notifyBanner(
  type: 'schema' | 'info' | 'success' | 'warning',
  title: string,
  body?: string
): void {
  _bannerSender?.(type, title, body)
}

// ─── Execute Lint Task (delegates to Agent tool) ──────────────────────

/**
 * Run lint via Agent tool (writes _wiki/Lint报告-YYYY-MM-DD.md + log.md).
 * Called by the scheduler via callAgentTool('triggerLint', {}).
 * Kept here for direct callers (e.g. lint:runLint).
 */
export async function runLintTask(_vaultPath: string): Promise<void> {
  // Direct call to maintain.ts
  const { runMaintenance } = await import('../lint/maintain')
  const result = await runMaintenance()
  log.info('[Lint] runLintTask →', String(result).slice(0, 120))
}

// ─── AI Fix Suggestion Generator ─────────────────────────────────────

export async function generateFixSuggestions(
  report: MaintainReport,
  _vaultPath: string
): Promise<LintFixSuggestion[]> {
  const suggestions: LintFixSuggestion[] = []

  if (report.deadLinks.length > 0) {
    const deadLinksText = report.deadLinks
      .slice(0, 10)
      .map((l) => `  - 来自「${l.fromTitle}」→ 链接「${l.deadTarget}」不存在`)
      .join('\n')
    const prompt = `你是知识库助手。以下页面存在死链接（链接目标不存在）：\n${deadLinksText}\n\n现有页面标题：\n${Array.from(
      new Set(report.deadLinks.map((l) => l.fromTitle))
    )
      .slice(0, 20)
      .join(
        '\n'
      )}\n\n请为每个死链接生成修复建议。返回JSON数组：\n[{"deadTarget": "不存在的链接目标", "suggestion": "修复建议（搜索相似标题、更改链接、删除链接）", "action": "fix或ignore"}]\n\n只返回JSON数组。`
    try {
      const result = await callAI('lint_fix', { prompt })

      const match = String(result).match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<{
          deadTarget: string
          suggestion: string
          action: string
        }>
        for (const p of parsed) {
          const link = report.deadLinks.find((l) => l.deadTarget === p.deadTarget)
          if (link) {
            suggestions.push({
              issueType: 'deadLink',
              pagePath: link.fromPath,
              title: link.fromTitle,
              deadTarget: p.deadTarget,
              suggestion: p.suggestion,
              action: p.action as 'fix' | 'ignore'
            })
          }
        }
      }
    } catch (e) {
      log.warn('[Lint] dead link suggestions failed:', e)
    }
  }

  if (report.orphanPages.length > 0) {
    const orphanText = report.orphanPages
      .slice(0, 10)
      .map((p) => `  - ${p.title}`)
      .join('\n')
    const prompt = `你是知识库结构助手。发现以下页面没有反向链接（孤立页面）：\n${orphanText}\n\n请判断每个页面应该归档还是保留。如果内容不完整或重复，建议「归档」。\n\n返回JSON数组：\n[{"orphanTarget": "页面标题", "suggestion": "建议（归档 / 写入哪个文件夹）", "action": "fix或ignore"}]\n\n只返回JSON数组。`
    try {
      const result = await callAI('lint_fix', { prompt })

      const match = String(result).match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0]) as Array<{
          orphanTarget: string
          suggestion: string
          action: string
        }>
        for (const p of parsed) {
          const page = report.orphanPages.find((l) => l.title === p.orphanTarget)
          if (page) {
            suggestions.push({
              issueType: 'orphanPage',
              pagePath: page.path,
              title: p.orphanTarget,
              orphanTarget: p.orphanTarget,
              suggestion: p.suggestion,
              action: p.action as 'fix' | 'ignore'
            })
          }
        }
      }
    } catch (e) {
      log.warn('[Lint] orphan suggestions failed:', e)
    }
  }

  if (report.contradictions.length > 0) {
    for (const c of report.contradictions.slice(0, 5)) {
      const prompt = `页面「${c.pageTitle}」存在信息矛盾：\n旧值：${c.oldValue}\n新值：${c.newValue}\n来源：${c.source}\n\n请根据页面整体内容判断应该保留哪个值。\n\n只返回JSON：\n{"recommendedValue": "推荐保留的值", "reason": "判断理由"}\n\n只返回JSON。`
      try {
        const result = await callAI('resolve', { prompt })

        const match = String(result).match(/\{[\s\S]*\}/)
        if (match) {
          const p = JSON.parse(match[0]) as { recommendedValue: string; reason: string }
          suggestions.push({
            issueType: 'contradiction',
            pagePath: c.pagePath,
            title: c.pageTitle,
            oldValue: c.oldValue,
            newValue: c.newValue,
            source: c.source,
            recommendedValue: p.recommendedValue,
            suggestion: `${p.recommendedValue}（${p.reason}）`,
            action: 'ignore'
          })
        }
      } catch {
        /* skip */
      }
    }
  }

  return suggestions
}

// ─── Fix Lint Issue (apply a fix) ────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function fixLintIssue(issue: {
  type: string
  pagePath?: string
  deadTarget?: string
  orphanTarget?: string
}): Promise<boolean> {
  const vaultPath = getVaultPath()
  if (!vaultPath) {
    log.warn('[Lint] fixLintIssue: no vault open, skipping')
    return false
  }
  if (!issue.pagePath) return false

  if (issue.type === 'deadLink' && issue.deadTarget) {
    const raw = await readFile(issue.pagePath, 'utf-8').catch(() => '')
    if (!raw) return false
    const updated = raw.replace(
      new RegExp(`(\\label\\s*\\[\\\\?\\[)(${escapeRegExp(issue.deadTarget)})(\\])`, 'g'),
      (_, pre, target, post) => `${pre}${target}${post}（待确认）`
    )
    if (updated === raw) return false
    await writeFile(issue.pagePath, updated, 'utf-8')
    log.info(`[Lint] dead link fixed: ${issue.deadTarget} → marked in ${issue.pagePath}`)
    return true
  }

  if (issue.type === 'orphanPage' && issue.orphanTarget) {
    const orphanDir = join(vaultPath, '_orphan')
    await mkdir(orphanDir, { recursive: true })
    const targetPath = join(orphanDir, `${issue.orphanTarget}.md`)
    try {
      const raw = await readFile(issue.pagePath, 'utf-8')
      const { frontmatter, content } = parseFrontmatter(raw)
      ;(frontmatter as Record<string, unknown>).status = 'archived'
      ;(frontmatter as Record<string, unknown>).archivedAt = new Date().toISOString().slice(0, 10)
      const rewritten = applyFrontmatter(content, frontmatter)
      await writeFile(targetPath, rewritten, 'utf-8')
      await unlink(issue.pagePath)
      log.info(`[Lint] orphan page archived: ${issue.orphanTarget} → _orphan/`)
      return true
    } catch {
      return false
    }
  }

  return false
}
