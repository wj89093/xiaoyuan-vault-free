/**
 * skillHandlers — Skill.md 插件 IPC
 *
 * 提供 3 个能力:
 *   - skill:list             列出用户保存的 Skill.md
 *   - skill:loadDefault     返回预置默认 Skill.md 模板
 *   - skill:save            保存用户的 Skill.md (覆盖默认)
 *   - skill:read            读取指定 Skill.md
 *   - skill:delete          删除 Skill.md
 *
 * 存储位置: ~/Library/Application Support/xiaoyuan-vault/skills/{name}.md
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

export function registerSkillHandlers(): void {
  ipcMain.handle('skill:list', async (): Promise<Array<{ name: string; path: string }>> => {
    const dir = skillsDir()
    if (!existsSync(dir)) return []
    const files = await readdir(dir)
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f.replace(/\.md$/, ''), path: join(dir, f) }))
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
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
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

  log.info('[Skill] handlers registered')
}
