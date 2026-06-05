/**
 * skillHandlers — 用户 Skill.md CRUD
 *
 * 提供能力 (v1.4 精简后):
 *   - skill:list         列出用户保存的 Skill.md
 *   - skill:loadDefault 返回内置默认模板 (指向 Agents.md)
 *   - skill:save        保存用户的 Skill.md
 *   - skill:read        读取指定 Skill.md
 *   - skill:delete      删除 Skill.md
 *
 * v1.4 删除的功能 (HTTP 协议):
 *   - skill:listTemplates
 *   - skill:loadTemplate
 *   - skill:getEndpoint
 *   - skill:setEndpoint
 *
 * 存储位置: ~/Library/Application Support/xiaoyuan-vault/skills/{name}.md
 * 内置模板: src/main/templates/Agents.md
 */
import { ipcMain, app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, readdir, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import log from 'electron-log/main'
// v1.5: 共享 readConfig (从 services/config 抽出来)
import { readConfig } from "../services/config"

function skillsDir(): string {
  return join(app.getPath('userData'), 'skills')
}

function defaultSkillPath(): string {
  // v1.4: 默认模板指向 Agents.md（v1.3 的 skill-plugin-default.md 已删）
  const dev = join(__dirname, '..', '..', 'src', 'main', 'templates', 'Agents.md')
  if (existsSync(dev)) return dev
  return join(__dirname, '..', 'templates', 'Agents.md')
}

/** 校验 skill 名称（仅允许字母、数字、-、_） */
export function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

// ─── v1.5 注入层（纯函数, 可独立测试）─────────────────────────────────────
// 从 vault 拼上 MARKDOWN_CAPABILITIES.md (编辑器能力) + N 个 Skill 模板
// 静默失败: vaultPath 无效 / 目录不存在 / 读错 → 返回 []
//
// v1.7 加 skills 参数 (按需注入):
//   - 不传/空数组: 拼全部 (v1.5 行为, 保持向后兼容)
//   - 传数组: 只拼列出的 skills + 始终拼 caps (caps 是编辑器能力, Agent 都需要)
export async function composeInjectedSkillText(
  vaultPath: string | null | undefined,
  skills?: string[]
): Promise<string[]> {
  if (!vaultPath || !existsSync(vaultPath)) return []
  const injectedParts: string[] = []

  // 1. 始终注入 MARKDOWN_CAPABILITIES.md (编辑器能力 Agent 都需要, 轻量)
  const capsPath = join(vaultPath, 'MARKDOWN_CAPABILITIES.md')
  if (existsSync(capsPath)) {
    const caps = await readFile(capsPath, 'utf-8')
    injectedParts.push('# 📝 自动注入: 编辑器能力清单 (来自 MARKDOWN_CAPABILITIES.md)\n\n' + caps)
  }

  // 2. 注入 skills/ 目录 Skill 模板
  const skillsDirPath = join(vaultPath, 'skills')
  if (existsSync(skillsDirPath)) {
    const allFiles = (await import('fs')).readdirSync(skillsDirPath).filter(f => f.endsWith('.md')).sort()
    // 按 skills 参数过滤 (undefined = 全拼, 数组 = 只拼列出的)
    const wanted = !skills || skills.length === 0
      ? allFiles
      : allFiles.filter(f => skills.includes(f.replace(/\.md$/, '')))
    for (const f of wanted) {
      const skillContent = await readFile(join(skillsDirPath, f), 'utf-8')
      const skillName = f.replace(/\.md$/, '')
      injectedParts.push(`# 🔧 Skill 模板: ${skillName}\n\n` + skillContent)
    }
  }

  return injectedParts
}

export function registerSkillHandlers(): void {
  ipcMain.handle('skill:list', async (): Promise<Array<{ name: string; path: string }>> => {
    const dir = skillsDir()
    if (!existsSync(dir)) return []
    const files = await readdir(dir)
    return files
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f.replace(/\.md$/, ''), path: join(dir, f) }))
  })

  ipcMain.handle('skill:loadDefault', async (_, skills?: string[]): Promise<string> => {
    const path = defaultSkillPath()
    try {
      const baseSkill = await readFile(path, 'utf-8')
      // v1.5: 注入层 — 拼上 capabilities 段, Agent 写入时自动看到支持的扩展
      // v1.7: skills 参数 — 按需注入 (省 ~3-4K tokens, 默认全拼保持兼容)
      // 静默失败: 没 vault / 没 capabilities 文件 / 读错都不阻断
      try {
        const config = await readConfig()
        const injectedParts = await composeInjectedSkillText(config.lastVaultPath, skills)
        if (injectedParts.length > 0) {
          return baseSkill + '\n\n---\n\n' + injectedParts.join('\n\n---\n\n')
        }
      } catch (e) {
        log.debug('[Skill] capabilities injection skipped:', e)
      }
      return baseSkill
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

  log.info('[Skill] handlers registered (CRUD only, v1.4 simplified)')
}
