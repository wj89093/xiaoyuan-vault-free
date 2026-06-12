/**
 * lintSummary.ts — _state/lint/SUMMARY.json
 *
 * AI-readable summary of vault lint health. Companion to
 * .xiaoyuan/lint-reports.json (last 30 full MaintainReports).
 *
 * Why this exists:
 * - Lint reports are rich but bulky (each ~5-10KB with all the suggestions)
 * - AI just needs to know "5 broken links, 3 missing-field, 2 orphan"
 *   to decide whether to ask user "want me to fix?"
 * - SUMMARY.json = one read = health snapshot
 *   Drill-down to lint-reports.json only when user/AI wants to act
 *
 * Design (v1.9, 2026-06-12): two-layer state model
 *   _state/lint/SUMMARY.json  ← AI default (this file)
 *   .xiaoyuan/lint-reports.json  ← last 30 full reports, drill-down
 *
 * Trigger: lintReports.saveLintReport (after each lint run). Silent fail.
 */
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import { getLintReports } from '../lint/lintReports'
import type { LintReportWithFixes, LintFixSuggestion } from '../lint/lintReports'
import log from 'electron-log/main'

export interface IssueBucket {
  /** Total count of this issue type across the most recent report */
  count: number
  /** Path to full lint-reports.json (drill-down) */
  source: string
}

export interface LintSummary {
  updatedAt: string
  totalFiles: number
  /** Most recent lint report timestamp (epoch ms); null if never run */
  lastRunAt: number | null
  /** Issue counts (latest report) */
  issues: {
    orphanPages: number
    stalePages: number
    deadLinks: number
    missingFields: number
    contradictions: number
    conceptGaps: number
    suggestedLinks: number
  }
  /** Pending fix suggestions (action='fix' from latest report) */
  pendingFixes: number
  /** Per-issue-type breakdown of fix suggestions from latest report */
  fixSuggestionsByType: Record<string, number>
  /** Last 5 report timestamps (ISO) — AI sees trend */
  recentRuns: string[]
}

/**
 * Build summary from last 30 reports (newest first). Pure function.
 */
export function buildLintSummary(reports: LintReportWithFixes[]): Omit<LintSummary, 'updatedAt'> {
  if (reports.length === 0) {
    return {
      totalFiles: 0,
      lastRunAt: null,
      issues: {
        orphanPages: 0,
        stalePages: 0,
        deadLinks: 0,
        missingFields: 0,
        contradictions: 0,
        conceptGaps: 0,
        suggestedLinks: 0
      },
      pendingFixes: 0,
      fixSuggestionsByType: {},
      recentRuns: []
    }
  }

  // Reports arrive newest-first (saveLintReport prepends)
  const latest = reports[0]
  const fixes = latest.fixSuggestions ?? []
  const pendingFixes = fixes.filter((f: LintFixSuggestion) => f.action === 'fix').length

  // Bucket fix suggestions by issueType
  const fixSuggestionsByType: Record<string, number> = {}
  for (const f of fixes) {
    fixSuggestionsByType[f.issueType] = (fixSuggestionsByType[f.issueType] ?? 0) + 1
  }

  return {
    totalFiles: latest.totalFiles,
    lastRunAt: latest.timestamp,
    issues: {
      orphanPages: latest.orphanPages?.length ?? 0,
      stalePages: latest.stalePages?.length ?? 0,
      deadLinks: latest.deadLinks?.length ?? 0,
      missingFields: latest.missingFields?.length ?? 0,
      contradictions: latest.contradictions?.length ?? 0,
      conceptGaps: latest.conceptGaps?.length ?? 0,
      suggestedLinks: latest.suggestedLinks?.length ?? 0
    },
    pendingFixes,
    fixSuggestionsByType,
    recentRuns: reports.slice(0, 5).map((r) => new Date(r.timestamp).toISOString())
  }
}

/**
 * Write _state/lint/SUMMARY.json. Silent fail.
 * Call this after saveLintReport.
 */
export async function writeLintSummary(): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return

  try {
    const reports = await getLintReports()
    const partial = buildLintSummary(reports)
    const summary: LintSummary = {
      ...partial,
      updatedAt: new Date().toISOString()
    }

    const dir = join(vaultPath, '_state', 'lint')
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SUMMARY.json'), JSON.stringify(summary, null, 2), 'utf-8')
  } catch (e) {
    log.warn('[LINT_SUMMARY] write failed:', e)
  }
}
