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

export function registerSkillHandlers(): void {
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

  log.info('[Skill] handlers registered (CRUD only, v1.4 simplified)')
}
