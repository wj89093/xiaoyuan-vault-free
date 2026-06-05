/* eslint-disable @typescript-eslint/no-unsafe-return */
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { runMaintenance } from '../services/lint/maintain'
import {
  generateBriefing,
  saveConversationSummary,
  getConversationSummaries,
  getTopicSummaries
} from '../services/briefing/briefing'
import { getLintReports, fixLintIssue, runLintTask } from '../services/lint/lintReports'
import { listFolderSchemas, getPendingFolderSchemas } from '../services/schema/schemaStorage'

// briefing IPC
ipcMain.handle('briefing:generate', async () => {
  return generateBriefing()
})

// conversation summary IPC
ipcMain.handle(
  'briefing:saveConversation',
  async (
    _event,
    params: {
      title: string
      topic: string
      decisions: string[]
      relatedFiles: string[]
      nextSteps: string[]
      discussion?: string
    }
  ) => {
    return saveConversationSummary(params)
  }
)

ipcMain.handle(
  'briefing:getConversations',
  async (
    _event,
    date: string,
    options?: { topic?: string; maxResults?: number }
  ) => {
    return getConversationSummaries(date, options)
  }
)

// v1.7 (P1-2): 读 topic 累积文件 (跨日聚合)
ipcMain.handle('briefing:getTopicSummaries', async (_event, topic: string) => {
  return getTopicSummaries(topic)
})

export function registerMaintainHandlers(): void {
  // Lint IPC (migrated from autoAIHandlers)
  ipcMain.handle('lint:listSchemas', async () => {
    return listFolderSchemas()
  })

  ipcMain.handle('lint:getPendingSchemas', async () => {
    return getPendingFolderSchemas()
  })

  ipcMain.handle('lint:getLintReports', async () => {
    return getLintReports()
  })

  ipcMain.handle(
    'lint:fixLintIssue',
    async (
      _,
      issue: { type: string; pagePath?: string; deadTarget?: string; orphanTarget?: string }
    ) => {
      return fixLintIssue(issue)
    }
  )

  ipcMain.handle('lint:runLint', async () => {
    const { getVaultPath } = await import('../services/database/database')
    const vaultPath = getVaultPath()
    if (!vaultPath) return { ok: false, error: 'No vault open' }
    const report = await runMaintenance()
    await runLintTask(vaultPath)
    return report
  })

  // Maintain run (original)
  ipcMain.handle('maintain:run', async () => {
    return runMaintenance()
  })

  // Scheduler tasks (stored in .xiaoyuan/tasks.json — no background scheduler)
  ipcMain.handle('scheduler:getTasks', async () => {
    try {
      const { getVaultPath } = await import('../services/database/database')
      const vaultPath = getVaultPath()
      if (!vaultPath) return []
      const tasksFile = join(vaultPath, '.xiaoyuan', 'tasks.json')
      if (!existsSync(tasksFile)) return []
      return JSON.parse(await readFile(tasksFile, 'utf-8'))
    } catch {
      return []
    }
  })

  ipcMain.handle('scheduler:updateTasks', async (_, tasks: unknown[]) => {
    try {
      const { getVaultPath } = await import('../services/database/database')
      const vaultPath = getVaultPath()
      if (!vaultPath) return false
      const dir = join(vaultPath, '.xiaoyuan')
      if (!existsSync(dir)) await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'tasks.json'), JSON.stringify(tasks, null, 2), 'utf-8')
      return true
    } catch (e) {
      log.warn('[scheduler] updateTasks failed:', e)
      return false
    }
  })
}
