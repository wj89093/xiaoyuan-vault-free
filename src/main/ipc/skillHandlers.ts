/**
 * skillHandlers — Skill.md 插件 IPC
 *
 * 提供能力:
 *   - skill:list             列出用户保存的 Skill.md
 *   - skill:loadDefault     返回预置默认 Skill.md 模板
 *   - skill:save            保存用户的 Skill.md (覆盖默认)
 *   - skill:read            读取指定 Skill.md
 *   - skill:delete          删除 Skill.md
 *   - skill:listTemplates   列出预置 8 个 skill 模板 (ingest/query/recall/lint/...)
 *   - skill:loadTemplate    加载预置模板
 *   - skill:getEndpoint     读取 Agent endpoint 配置
 *   - skill:setEndpoint     保存 Agent endpoint 配置
 *
 * 存储位置:
 *   - Skill.md:   ~/Library/Application Support/xiaoyuan-vault/skills/{name}.md
 *   - endpoint:   ~/Library/Application Support/xiaoyuan-vault/skill-endpoint.json
 *   - 预置模板:    src/main/templates/skill-plugin-default.md
 *                 src/main/templates/skills/*.md
 */
import { ipcMain } from 'electron'
import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import log from 'electron-log/main'

function skillsDir(): string {
  return join(app.getPath('userData'), 'skills')
}

function defaultSkillPath(): string {
  // 开发期: src/main/templates/skill-plugin-default.md
  // 构建后: 模板会被复制到 out/templates/ (由 build 脚本)
  const dev = join(__dirname, '..', '..', 'src', 'main', 'templates', 'skill-plugin-default.md')
  if (existsSync(dev)) return dev
  return join(__dirname, '..', 'templates', 'skill-plugin-default.md')
}

function templatesDir(): string {
  const dev = join(__dirname, '..', '..', 'src', 'main', 'templates', 'skills')
  if (existsSync(dev)) return dev
  return join(__dirname, '..', 'templates', 'skills')
}

export interface SkillTemplate {
  name: string
  description: string
  filename: string
}

export interface EndpointConfig {
  url: string
  protocol: 'http' | 'ws' | 'skill'
  note?: string
  updatedAt: number
}

const DEFAULT_ENDPOINT: EndpointConfig = {
  url: 'http://127.0.0.1:18789',
  protocol: 'http',
  note: '',
  updatedAt: 0
}

/**
 * 读取 endpoint 配置（纯函数，便于单测）
 */
export async function readEndpoint(storageDir: string): Promise<EndpointConfig> {
  const path = join(storageDir, 'skill-endpoint.json')
  if (!existsSync(path)) return { ...DEFAULT_ENDPOINT }
  try {
    const data = JSON.parse(await readFile(path, 'utf-8')) as Partial<EndpointConfig>
    return {
      url: data.url ?? DEFAULT_ENDPOINT.url,
      protocol: (data.protocol ?? DEFAULT_ENDPOINT.protocol) as EndpointConfig['protocol'],
      note: data.note ?? '',
      updatedAt: data.updatedAt ?? 0
    }
  } catch {
    return { ...DEFAULT_ENDPOINT }
  }
}

/**
 * 写入 endpoint 配置（纯函数）
 */
export async function writeEndpoint(
  storageDir: string,
  config: Partial<EndpointConfig>
): Promise<boolean> {
  const path = join(storageDir, 'skill-endpoint.json')
  const current: EndpointConfig = {
    url: config.url ?? DEFAULT_ENDPOINT.url,
    protocol: (config.protocol ?? DEFAULT_ENDPOINT.protocol) as EndpointConfig['protocol'],
    note: config.note ?? '',
    updatedAt: Date.now()
  }
  try {
    await writeFile(path, JSON.stringify(current, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/**
 * 校验 skill 名称（仅允许字母、数字、-、_）
 */
export function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

/** 内置 skill 模板元信息（与 templates/skills/ 目录对应） */
export const BUILTIN_TEMPLATES: SkillTemplate[] = [
  { name: 'ingest', description: '文件摄入 — 读取 _raw/ 分析并写入 _wiki/', filename: 'ingest.md' },
  { name: 'query', description: '知识库查询 — 用 FTS5 搜索 vault', filename: 'query.md' },
  { name: 'recall', description: '回忆 — 从历史会话 / 笔记中提取', filename: 'recall.md' },
  { name: 'lint', description: '质量检查 — 运行 lint 并修复', filename: 'lint.md' },
  {
    name: 'write-note',
    description: '写笔记 — 创建 / 更新 markdown 页面',
    filename: 'write-note.md'
  },
  {
    name: 'conversation-summary',
    description: '对话摘要 — 提炼当前会话决策与下一步',
    filename: 'conversation-summary.md'
  },
  {
    name: 'self-improvement',
    description: '自我改进 — 记录学到的经验',
    filename: 'self-improvement.md'
  },
  { name: 'stats', description: '统计 — vault 文件数 / 增长趋势', filename: 'stats.md' }
]

export function registerSkillHandlers(): void {
  // ── Skill.md CRUD ───────────────────────────────────────────

  ipcMain.handle('skill:list', async (): Promise<Array<{ name: string; path: string }>> => {
    const dir = skillsDir()
    if (!existsSync(dir)) return []
    const files = await readdir(dir)
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f.replace(/\.md$/, ''), path: join(dir, f) }))
  })

  ipcMain.handle('skill:loadDefault', async (): Promise<string> => {
    const path = defaultSkillPath()
    try {
      return await readFile(path, 'utf-8')
    } catch (e) {
      log.error('[Skill] loadDefault failed:', e)
      return ''
    }
  })

  ipcMain.handle('skill:save', async (_event, name: string, content: string): Promise<boolean> => {
    if (!isValidSkillName(name)) {
      throw new Error('Invalid skill name (only alphanumeric, dash, underscore)')
    }
    const dir = skillsDir()
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    const filePath = join(dir, `${name}.md`)
    await writeFile(filePath, content, 'utf-8')
    log.info('[Skill] saved', filePath)
    return true
  })

  ipcMain.handle('skill:read', async (_event, name: string): Promise<string> => {
    const filePath = join(skillsDir(), `${name}.md`)
    try {
      return await readFile(filePath, 'utf-8')
    } catch {
      return ''
    }
  })

  ipcMain.handle('skill:delete', async (_event, name: string): Promise<boolean> => {
    const filePath = join(skillsDir(), `${name}.md`)
    try {
      await unlink(filePath)
      log.info('[Skill] deleted', filePath)
      return true
    } catch {
      return false
    }
  })

  // ── 预置模板 (templates/skills/*.md) ────────────────────────

  ipcMain.handle('skill:listTemplates', async (): Promise<SkillTemplate[]> => {
    return BUILTIN_TEMPLATES
  })

  ipcMain.handle('skill:loadTemplate', async (_event, name: string): Promise<string> => {
    const tpl = BUILTIN_TEMPLATES.find((t) => t.name === name)
    if (!tpl) {
      throw new Error(`Unknown template: ${name}`)
    }
    const filePath = join(templatesDir(), tpl.filename)
    try {
      return await readFile(filePath, 'utf-8')
    } catch (e) {
      log.error('[Skill] loadTemplate failed:', name, e)
      return ''
    }
  })

  // ── Endpoint 配置 ──────────────────────────────────────────

  ipcMain.handle('skill:getEndpoint', async (): Promise<EndpointConfig> => {
    return readEndpoint(app.getPath('userData'))
  })

  ipcMain.handle(
    'skill:setEndpoint',
    async (_event, config: Partial<EndpointConfig>): Promise<boolean> => {
      return writeEndpoint(app.getPath('userData'), config)
    }
  )

  log.info('[Skill] handlers registered (8 builtin templates + endpoint + CRUD)')
}
