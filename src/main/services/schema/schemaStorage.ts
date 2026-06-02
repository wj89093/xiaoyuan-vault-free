import { existsSync, mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import { parseFrontmatter } from '../frontmatter/index'
import { callAI } from '../ai/aiService'
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/await-thenable */
import log from 'electron-log/main'

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

// ─── Schema Interfaces ────────────────────────────────────────────────

export interface SchemaField {
  key: string
  label: string
  type: 'text' | 'select' | 'multi-select' | 'date' | 'number'
  options?: string[]
  description: string
  extractHint: string
}

export interface FolderSchema {
  /** 相对文件夹路径，如 「6-概念」 */
  folder: string
  /** 版本号，方便 schema 迭代 */
  version: string
  /** 字段列表 */
  fields: SchemaField[]
  /** 用户是否已确认 */
  confirmed: boolean
  /** AI 对这个文件夹内容的自然语言描述 */
  description: string
  createdAt: number
  confirmedAt?: number
  updatedAt?: number
}

// ─── Schema Storage ──────────────────────────────────────────────────

function getSchemasDirPath(): string {
  const vaultPath = getVaultPath()
  if (!vaultPath) return ''
  return join(vaultPath, '.xiaoyuan', 'schemas')
}

function schemaFilePath(folder: string): string {
  const base = getSchemasDirPath()
  const safeName = folder.replace(/[/\\?*:]/g, '_')
  return join(base, `${safeName}.json`)
}

/** 列出所有已知 folder 名称（有无 schema 均可） */
export async function listFolderSchemas(): Promise<FolderSchema[]> {
  const dir = getSchemasDirPath()
  if (!dir || !existsSync(dir)) return []
  const names = await readdir(dir)
  const schemas: FolderSchema[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const raw = await readFile(join(dir, name), 'utf-8')
      schemas.push(JSON.parse(raw) as FolderSchema)
    } catch {
      // skip corrupt files
    }
  }
  return schemas.sort((a, b) => a.folder.localeCompare(b.folder))
}

export async function loadFolderSchema(folder: string): Promise<FolderSchema | null> {
  const fp = schemaFilePath(folder)
  if (!existsSync(fp)) return null
  try {
    return JSON.parse(await readFile(fp, 'utf-8'))
  } catch {
    return null
  }
}

export async function saveFolderSchema(schema: FolderSchema): Promise<void> {
  const dir = getSchemasDirPath()
  if (!dir) return
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  await writeFile(schemaFilePath(schema.folder), JSON.stringify(schema, null, 2), 'utf-8')
}

/** 获取所有待确认的 schema（基于 confirmed=false 且未被 settings 排除的 schema） */
export async function getPendingFolderSchemas(): Promise<FolderSchema[]> {
  const all = await listFolderSchemas()
  return all.filter((s) => !s.confirmed)
}

/**
 * When user confirms a folder schema, write it as per-folder CLAUDE.md in _raw/{folder}/
 * so the ingest engine reads it for all future imports to that folder.
 */
export async function syncSchemaToCLAUDE(schema: FolderSchema, vaultPath: string): Promise<void> {
  const claudePath = join(vaultPath, '_raw', schema.folder, 'CLAUDE.md')
  const fieldDescs = schema.fields
    .map((f) => {
      const opts = f.options?.length ? ` 可选值：${f.options.join('、')}` : ''
      return `- ${f.label} (${f.key}): ${f.description ?? f.type}${opts}`
    })
    .join('\n')
  const content = [
    `# CLAUDE.md — ${schema.folder}/`,
    '',
    '> 本文件夹的 LLM Wiki 摄入规范。AI 在 ingest 时优先读取本文件而非全局 CLAUDE.md。',
    '',
    '## 字段规范',
    '',
    fieldDescs,
    '',
    '## 行为约定',
    '',
    `- 所有导入本文件夹的文件必须补全以上字段`,
    `- 类型字段（type）统一用 frontmatter 里的 \`type\`，不要用文件名判断`,
    `- AI 在 ingest 时先读本文件，再读全局 CLAUDE.md`
  ].join('\n')

  await mkdir(dirname(claudePath), { recursive: true })
  await writeFile(claudePath, content, 'utf-8')
}

// ─── Schema Detection ────────────────────────────────────────────────

const SYSTEM_FILES = new Set(['index.md', 'log.md', 'RESOLVER.md', 'schema.md'])

/**
 * 扫描 vault 中所有文件夹，找出还没有 schema 的，
 * 让 AI 根据文件夹内现有内容推测 schema 字段，
 * 标记为 pending（等待用户确认）。
 */
export async function detectAndProposeSchemas(
  vaultPath: string,
  settings: { onSchemaDriven: boolean; pendingSchemas?: string[] }
): Promise<string[]> {
  if (!settings.onSchemaDriven) return []

  const folders = await getVaultFolders(vaultPath)
  const existing = await listFolderSchemas()
  const existingNames = new Set(existing.map((s) => s.folder))
  const pending: string[] = [...(settings.pendingSchemas ?? [])]

  for (const folder of folders) {
    if (folder.startsWith('.') || existingNames.has(folder)) continue

    log.info(`[Schema] new folder detected: ${folder}, proposing schema...`)
    try {
      const folderPath = join(vaultPath, folder)
      const samples: string[] = []
      const entries = await readdir(folderPath)
      for (const name of entries.slice(0, 6)) {
        if (name.endsWith('.md') && !SYSTEM_FILES.has(name)) {
          const raw = await readFile(join(folderPath, name), 'utf-8')
          const { content } = parseFrontmatter(raw)
          if (content.trim().length > 100) samples.push(content.trim().slice(0, 600))
        }
      }

      const proposedFields = await proposeSchemaFieldsFromSamples(folder, samples)

      const schema: FolderSchema = {
        folder,
        version: '0.1',
        fields: proposedFields,
        confirmed: false,
        description: folder,
        createdAt: Date.now()
      }

      await saveFolderSchema(schema)
      if (!pending.includes(folder)) {
        pending.push(folder)
      }
      log.info(`[Schema] proposed ${proposedFields.length} fields for "${folder}"`)
    } catch (err) {
      log.warn(`[Schema] failed to propose schema for "${folder}":`, (err as Error).message)
    }
  }

  return pending
}

async function getVaultFolders(vaultPath: string): Promise<string[]> {
  const folders: Set<string> = new Set()

  async function scan(dir: string, parent = '') {
    let entries: string[]
    try {
      entries = (await import('fs/promises')).readdir(dir)
    } catch {
      return
    }

    for (const name of (await entries).sort()) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const relPath = parent ? `${parent}/${name}` : name
      const fullPath = join(dir, name)
      try {
        const fstat = (await import('fs/promises')).stat(fullPath)
        if ((await fstat).isDirectory()) {
          if (relPath !== '.xiaoyuan') {
            folders.add(relPath)
            await scan(fullPath, relPath)
          }
        }
      } catch {
        log.warn('[Schema] scan error')
      }
    }
  }

  await scan(vaultPath)
  return Array.from(folders).sort()
}

/**
 * AI 调用：根据文件夹名称和内容样本，建议 schema 字段
 */
export async function proposeSchemaFieldsFromSamples(
  folder: string,
  samples: string[]
): Promise<SchemaField[]> {
  if (samples.length === 0) {
    return [
      {
        key: 'type',
        label: '类型',
        type: 'text',
        description: `页面分类（${folder}）`,
        extractHint: '根据内容判断页面最合适的类型标签'
      }
    ]
  }

  const prompt = [
    `你是一个知识库 Schema 设计师。`,
    `文件夹名称：${folder}`,
    `该文件夹内文档内容样本（${samples.length} 篇）：`,
    ...samples.map((s, i) => `--- 样本 ${i + 1} ---\n${s.slice(0, 500)}`),
    '',
    `请分析这些文档的共同结构，设计 2~5 个 frontmatter 字段（不含 title/date），`,
    `使得该文件夹下所有页面都能通过这些字段被结构化描述。`,
    `要求：`,
    `- 每个字段要有清晰的 key（英文小驼峰）、label（中文）、type、description、extractHint（AI 提取提示）`,
    `- type 可选：text / select / multi-select / date / number`,
    `- select 和 multi-select 要有 options 枚举`,
    `- extractHint 要写清楚 AI 如何从内容中提取这个字段的值`,
    `返回 JSON 数组，不要其他文字。`,
    `示例格式：`,
    `[{"key":"category","label":"分类","type":"select","options":["综述","案例","指南"],"description":"...","extractHint":"..."}]`
  ].join('\n')

  try {
    const raw = await callAI('suggestSchema', { folder, samples: prompt })
    if (typeof raw === 'string') {
      const parsed = parseJSONArray(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((f: any) => ({
            key: String(f.key ?? '').trim(),
            label: String(f.label ?? f.key ?? ''),
            type: ['text', 'select', 'multi-select', 'date', 'number'].includes(f.type)
              ? f.type
              : 'text',
            options: Array.isArray(f.options) ? f.options : undefined,
            description: String(f.description ?? ''),
            extractHint: String(f.extractHint ?? '')
          }))
          .filter((f: SchemaField) => f.key)
      }
    }
  } catch {
    // fallback below
  }

  return [
    {
      key: 'type',
      label: '类型',
      type: 'text',
      description: `页面分类（${folder}）`,
      extractHint: '根据内容判断页面最合适的类型标签'
    }
  ]
}

/** 宽松解析 JSON 数组（可能被 AI 包裹在 markdown 代码块里） */
export function parseJSONArray(raw: string): unknown[] {
  try {
    return JSON.parse(raw)
  } catch {
    /* next */
  }
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (m) {
    try {
      return JSON.parse(m[1].trim())
    } catch {
      /* next */
    }
  }
  const arrM = raw.match(/\[[\s\S]*\]/)
  if (arrM) {
    try {
      return JSON.parse(arrM[0])
    } catch {
      /* next */
    }
  }
  return []
}
