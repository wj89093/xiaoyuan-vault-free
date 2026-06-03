/**
 * maintain.ts — 知识库健康检查与维护
 */
import log from 'electron-log/main'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'
import { join as _join } from 'path'
import { getVaultPath } from '../database/database'
import { listVaultFiles } from '../operations/crud'
import type { FileRecord } from '../database/database'
import { parseFrontmatter, extractWikiLinks } from '../frontmatter/index'
import { callAI } from '../ai/aiService'

export interface MaintainReport {
  timestamp: number
  totalFiles: number
  orphanPages: { path: string; title: string }[]
  stalePages: { path: string; title: string; daysSinceUpdate: number }[]
  deadLinks: { fromPath: string; fromTitle: string; deadTarget: string }[]
  missingFields: { path: string; title: string; missing: string[] }[]
  summary: string
  // LLM-first 新增
  contradictions: Contradiction[]
  wikiHealth: string
  conceptGaps: ConceptGap[]
  suggestedLinks: SuggestedLink[]
}

export interface ConceptGap {
  mentionedAs: string // the link text that has no target page
  foundIn: string[] // pages that mention this concept
  severity: 'high' | 'medium' | 'low'
}

export interface SuggestedLink {
  fromPath: string
  fromTitle: string
  toTitle: string
  reason: string
  severity: 'high' | 'medium' | 'low'
}

export interface Contradiction {
  pagePath: string
  pageTitle: string
  oldValue: string
  newValue: string
  source: string
  severity: 'high' | 'medium' | 'low'
}

const STALE_DAYS = 90
const REQUIRED_FIELDS = ['title', 'type', 'status']

// ─── Main entry point ───────────────────────────────────────────────

export async function runMaintenance(): Promise<MaintainReport> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return emptyReport('未打开知识库')

  const files = await listVaultFiles()
  const mdFiles = flattenFiles(files).filter(
    (f: FileRecord) => !f.isDirectory && f.path.endsWith('.md')
  )

  const orphanPages: MaintainReport['orphanPages'] = []
  const stalePages: MaintainReport['stalePages'] = []
  const deadLinks: MaintainReport['deadLinks'] = []
  const missingFields: MaintainReport['missingFields'] = []
  const contradictions: Contradiction[] = []
  const allTitles = new Set<string>()
  const linkMap = new Map<string, string[]>()

  // First pass: collect metadata + structural checks
  for (const file of mdFiles) {
    try {
      const raw = await readFile(file.path, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      const title = frontmatter.title ?? file.name.replace('.md', '')
      allTitles.add(title)

      // Missing fields
      const missing = REQUIRED_FIELDS.filter((f) => !frontmatter[f])
      if (missing.length > 0) missingFields.push({ path: file.path, title, missing })

      // Staleness
      if (frontmatter.updated) {
        const daysSince = (Date.now() - new Date(frontmatter.updated).getTime()) / 86400000
        if (daysSince > STALE_DAYS)
          stalePages.push({ path: file.path, title, daysSinceUpdate: Math.round(daysSince) })
      }

      // Links
      const links = extractWikiLinks(raw)
      for (const link of links) {
        if (!linkMap.has(link)) linkMap.set(link, [])
        linkMap.get(link)!.push(title)
      }
    } catch {
      log.warn('[Maintain] iteration skipped')
    }
  }

  // Second pass: orphans + dead links
  const linkedTitles = new Set<string>()
  for (const [target, sources] of linkMap) {
    if (allTitles.has(target)) linkedTitles.add(target)
    else {
      for (const source of sources) {
        deadLinks.push({
          fromPath: mdFiles.find((f) => f.title === source || f.name === source)?.path ?? '',
          fromTitle: source,
          deadTarget: target
        })
      }
    }
  }

  for (const file of mdFiles) {
    const title = file.title ?? file.name.replace('.md', '')
    if (!linkedTitles.has(title) && mdFiles.length > 1) orphanPages.push({ path: file.path, title })
  }

  // LLM-first: Contradiction detection
  try {
    const detected = await detectContradictions(mdFiles)
    contradictions.push(...detected)
  } catch (err) {
    log.warn(
      '[Maintain] contradiction detection failed:',
      String((err as unknown) instanceof Error ? (err as Error).message : err)
    )
  }

  const summary =
    [
      orphanPages.length > 0 ? `${orphanPages.length}个孤儿页面` : '',
      stalePages.length > 0 ? `${stalePages.length}个过期页面(>${STALE_DAYS}天)` : '',
      deadLinks.length > 0 ? `${deadLinks.length}个死链接` : '',
      missingFields.length > 0 ? `${missingFields.length}个缺字段` : '',
      contradictions.length > 0 ? `${contradictions.length}个矛盾` : ''
    ]
      .filter(Boolean)
      .join('，') || '一切正常 ✅'

  const wikiHealth =
    contradictions.length === 0 ? '✅ 健康' : `⚠️ ${contradictions.length}个矛盾待处理`

  log.info(`[Maintain] ${summary}`)

  // ── Concept Gap Detection ──────────────────────────────────────────────
  // A concept gap: a [[wiki link]] target has no corresponding page
  const conceptGaps: ConceptGap[] = []
  for (const [linkTarget, pagesThatMention] of linkMap.entries()) {
    const normalizedTarget = linkTarget.toLowerCase().replace(/\s+/g, '-')
    const hasPage = mdFiles.some((f) => {
      const fn = f.name.toLowerCase().replace(/\s+/g, '-').replace('.md', '')
      return fn === normalizedTarget || fn === linkTarget.toLowerCase()
    })
    if (!hasPage) {
      conceptGaps.push({
        mentionedAs: linkTarget,
        foundIn: pagesThatMention,
        severity:
          pagesThatMention.length >= 3 ? 'high' : pagesThatMention.length >= 2 ? 'medium' : 'low'
      })
    }
  }

  // ── Suggested Cross-Reference Detection ──────────────────────────────
  // Pages in the same folder that could link to each other but don't
  const suggestedLinks: SuggestedLink[] = []
  const folderGroups = new Map<string, FileRecord[]>()
  for (const f of mdFiles) {
    const folder = f.path.includes('/') ? f.path.split('/').slice(-2, -1)[0] : ''
    if (!folderGroups.has(folder)) folderGroups.set(folder, [])
    folderGroups.get(folder)!.push(f)
  }
  for (const [folder, files] of folderGroups.entries()) {
    if (files.length < 2) continue
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const fa = files[i],
          fb = files[j]
        const titleA = fa.name.replace('.md', ''),
          titleB = fb.name.replace('.md', '')
        const linksA = linkMap.get(titleA) ?? []
        const linksB = linkMap.get(titleB) ?? []
        if (!linksA.includes(titleB) && !linksB.includes(titleA)) {
          suggestedLinks.push({
            fromPath: fa.path,
            fromTitle: titleA,
            toTitle: titleB,
            reason: `同文件夹 "${folder}" 内的 ${titleA} 和 ${titleB} 可能相关`,
            severity: folder === '_wiki' ? 'medium' : 'low'
          })
        }
      }
    }
  }

  return {
    timestamp: Date.now(),
    totalFiles: mdFiles.length,
    orphanPages,
    stalePages,
    deadLinks,
    missingFields,
    summary,
    contradictions,
    wikiHealth,
    conceptGaps,
    suggestedLinks
  }
}

// ─── LLM-first: Contradiction Detection ──────────────────────────────
//
// 当新内容 enrich 时，LLM 应该已经判断过矛盾了。
// maintain.ts 的矛盾检测是定期兜底扫描：
// 找到所有有 summary 的页面，随机抽样检查新旧信息是否有矛盾。

async function detectContradictions(
  mdFiles: { path: string; name: string; title?: string }[]
): Promise<Contradiction[]> {
  // 只检查有 summary 的页面（已有一定信息量）
  const candidates = mdFiles.filter((f) => {
    try {
      const raw = readFileSync(f.path, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      return !!frontmatter.summary && !!frontmatter.updated
    } catch {
      return false
    }
  })

  if (candidates.length === 0) return []

  // 每次最多检查 10 个（避免 API 调用过多）
  const sample = candidates.slice(0, 10)
  const results: Contradiction[] = []

  for (const file of sample) {
    try {
      const raw = readFileSync(file.path, 'utf-8')
      const { frontmatter } = parseFrontmatter(raw)
      const result = await checkPageContradictions(
        file.path,
        frontmatter.title ?? file.name.replace('.md', ''),
        frontmatter.summary ?? '',
        raw
      )
      if (result) results.push(result)
    } catch {
      log.warn('[Maintain] iteration skipped')
    }
  }

  return results
}

async function checkPageContradictions(
  pagePath: string,
  title: string,
  existingSummary: string,
  pageRaw: string
): Promise<Contradiction | null> {
  // 提取时间线里最近的 3 条记录作为"旧信息"
  const timelineMatch = pageRaw.match(/##\s*时间线[\s\S]*$/i)
  if (!timelineMatch) return null

  const timelineLines = timelineMatch[0]
    .split('\n')
    .filter((l) => l.startsWith('- ') || l.startsWith('## ['))
  const recentEntries = timelineLines.slice(-3).join('\n')

  if (!recentEntries.trim()) return null

  const prompt = `你是知识库质量检查员。

已有页面「${title}」的最新摘要：
${existingSummary}

该页面的时间线记录（近 3 条）：
${recentEntries}

请判断：这条最新摘要和信息是否有矛盾？

判断标准：
- 新摘要和旧记录一致 → 无矛盾
- 新摘要推翻了旧记录（数字/事实冲突） → 矛盾
- 新摘要补充了新信息但没有冲突 → 无矛盾

严格判断，只有真正的事实矛盾才报告。

只返回 JSON，不要解释：
{"contradiction": null | {"oldValue": "矛盾的一方", "newValue": "矛盾的另一方", "source": "来源片段"}}

如果没有矛盾，返回：{"contradiction": null}`

  try {
    const result = await callAI('resolve', { prompt })
    const match = String(result).match(/\{[\s\S]*\}/)
    if (!match) return null
    const p = JSON.parse(match[0]) as Record<string, unknown>
    const contradiction = p.contradiction as Record<string, string> | undefined
    if (!contradiction) return null
    return {
      pagePath,
      pageTitle: title,
      oldValue: contradiction.oldValue,
      newValue: contradiction.newValue,
      source: contradiction.source,
      severity: 'medium'
    }
  } catch (err) {
    log.warn(
      '[maintain] lintGraph: failed, returning null',
      err instanceof Error ? err.message : String(err)
    )
    return null
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

function flattenFiles(files: FileRecord[]): FileRecord[] {
  const result: FileRecord[] = []
  for (const f of files) {
    result.push(f)
    if (f.children) result.push(...flattenFiles(f.children))
  }
  return result
}

function emptyReport(reason: string): MaintainReport {
  return {
    timestamp: Date.now(),
    totalFiles: 0,
    orphanPages: [],
    stalePages: [],
    deadLinks: [],
    missingFields: [],
    summary: reason,
    contradictions: [],
    wikiHealth: '未知',
    conceptGaps: [],
    suggestedLinks: []
  }
}
