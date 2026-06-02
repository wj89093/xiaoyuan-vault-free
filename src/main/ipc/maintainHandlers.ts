/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { ipcMain } from 'electron'
import log from 'electron-log/main'
import { runMaintenance } from '../services/lint/maintain'
import {
  generateBriefing,
  saveConversationSummary,
  getConversationSummaries
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

ipcMain.handle('briefing:getConversations', async (_event, date: string) => {
  return getConversationSummaries(date)
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
