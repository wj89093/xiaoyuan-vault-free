import { readFile, writeFile } from 'fs/promises'
import { basename } from 'path'
import { getVaultPath } from '../database/database'
import { parseFrontmatter, applyFrontmatter } from '../frontmatter/index'
import { callAI } from '../ai/aiService'
import log from 'electron-log/main'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Content Worth Assessment ─────────────────────────────────────

export interface AssessResult {
  worth: boolean
  reason?: string
  score?: number
}

/**
 * 判断内容是否值得 AI 处理。
 * 系统文件、空文件、太短的文件都跳过。
 */
export function assessContentWorth(rawContent: string): AssessResult {
  const { frontmatter, content } = parseFrontmatter(rawContent)

  if (frontmatter.summary && frontmatter.tags?.length > 0 && frontmatter.type) {
    return { worth: false, reason: 'already complete', score: 100 }
  }

  const body = content.trim()
  if (!body) return { worth: false, reason: 'empty content' }
  if (body.length < 50) return { worth: false, reason: 'too short' }
  if (body.length > 50000) return { worth: true, score: 60 }

  return { worth: true, score: 70 }
}

// ─── Single File Processing ─────────────────────────────────────────

interface ProcessContext {
  settings: {
    onTags: boolean
    onSummary: boolean
    onSchemaDriven: boolean
  }
  folders: string[]
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  schemaByFolder: Map<string, import('../schema/schemaStorage').FolderSchema>
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  missingSchemaFields: import('../schema/schemaStorage').SchemaField[]
}

/**
 * 处理单个文件：根据 settings 决定要做什么（打标签/写摘要/填 schema 字段），
 * 调用 AI 并写入 frontmatter 更新。
 * 返回是否实际做了修改。
 */
export async function processFile(
  filePath: string,
  ctx: ProcessContext,
): Promise<boolean> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return false

  const raw = await readFile(filePath, 'utf-8')
  const { frontmatter, content } = parseFrontmatter(raw)

  const assessment = assessContentWorth(content)
  if (!assessment.worth) return false

  const needsTags = ctx.settings.onTags && (!frontmatter.tags || frontmatter.length === 0)
  const needsSummary = ctx.settings.onSummary && !frontmatter.summary

  // Schema 字段：检查该文件所在文件夹是否有已确认的 schema
  const relPath = filePath.slice(vaultPath.length + 1)
  const fileFolder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '根目录'
  const folderSchema = ctx.schemaByFolder.get(fileFolder)
  const needsSchemaFields = ctx.settings.onSchemaDriven && folderSchema != null

  const missingSchemaFields = needsSchemaFields
    ? folderSchema!.fields.filter(f => !frontmatter[f.key as keyof typeof frontmatter])
    : []

  if (!needsTags && !needsSummary && missingSchemaFields.length === 0) {
    return false
  }

  log.info(`[AutoAI] processing: ${basename(filePath)}`)

  const body = content.trim()
  if (!body) return false

  const updates: Record<string, any> = {}

  // 并行处理标签、摘要、schema 字段
  const tasks: Promise<void>[] = []

  if (needsTags) {
    tasks.push(
      (async () => {
        try {
          const _prompt = `你是知识库助手。为以下页面生成 2-5 个标签（tags）。

页面内容（前 500 字）：
${body.slice(0, 500)}

要求：
- 用中文
- 每个标签 2-4 个字
- 直接返回 JSON 数组，不要其他文字
- 示例: ["概念", "基础", "生物"]

返回 JSON 数组：`
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const result = await callAI('suggestTags', { content: body.slice(0, 500) })
          const match = String(result).match(/\[[\s\S]*\]/)
          if (match) {
            const tags = JSON.parse(match[0]) as string[]
            updates.tags = tags.slice(0, 5)
          }
        } catch (err) {
          log.warn('[AutoAI] tags failed:', (err as Error).message)
        }
      })()
    )
  }

  if (needsSummary) {
    tasks.push(
      (async () => {
        try {
          const _prompt = `你是知识库助手。为以下页面生成一段 30-60 字的中文摘要。

页面内容：
${body.slice(0, 1000)}

要求：
- 用一句话概括页面的核心内容
- 直接返回摘要文字，不要前缀

摘要：`
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const result = await callAI('suggestSummary', { content: body.slice(0, 1000) })
           
          const summary = String(result).trim().slice(0, 200)
          if (summary) updates.summary = summary
        } catch (err) {
          log.warn('[AutoAI] summary failed:', (err as Error).message)
        }
      })()
    )
  }

  if (missingSchemaFields.length > 0) {
    const fieldNames = missingSchemaFields.map(f => f.label).join('、')
    tasks.push(
      (async () => {
        try {
          const _prompt = [
            `你是知识库助手。分析以下页面内容，提取以下字段：${fieldNames}`,
            `页面内容（前 800 字）：`,
            body.slice(0, 800),
            '',
            '返回严格 JSON，对象键为字段 key，值为提取的值。不要有解释。',
          ].join('\n')
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const result = await callAI('extractSchemaFields', { content: body.slice(0, 800), fields: missingSchemaFields })
          const match = String(result).match(/\{[\s\S]*\}/)
          if (match) {
            const extracted = JSON.parse(match[0]) as Record<string, unknown>
            for (const f of missingSchemaFields) {
              if (extracted[f.key] !== undefined) {
                updates[f.key] = extracted[f.key]
              }
            }
          }
        } catch (err) {
          log.warn('[AutoAI] schema field extraction failed:', (err as Error).message)
        }
      })()
    )
  }

  await Promise.all(tasks)

  if (Object.keys(updates).length === 0) return false

  const updatedFrontmatter = { ...frontmatter, ...updates }
  const rewritten = applyFrontmatter(content, updatedFrontmatter)
  await writeFile(filePath, rewritten, 'utf-8')
  log.info(`[AutoAI] updated ${basename(filePath)}: ${Object.keys(updates).join(', ')}`)
  return true
}