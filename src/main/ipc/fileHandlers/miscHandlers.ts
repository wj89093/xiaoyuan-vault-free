/**
 * miscHandlers — Schema listing, file existence check, directory walk
 *
 * Channels: file:listSchemas, file:exists, file:walkDir
 */
import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { createBackup, listBackups, previewBackup, restoreBackup } from '../../services/backupManager'

import { getVaultPath } from '../../services/database/database'

export function registerMiscHandlers(): void {
  ipcMain.handle('file:listSchemas', async (_, vaultPath: string) => {
    const { readdir, readFile } = await import('fs/promises')
    const { join } = await import('path')
    const schemaDir = join(vaultPath, '_wiki')
    if (!existsSync(schemaDir)) return []
    const schemaEntries = await readdir(schemaDir, { withFileTypes: true })
    const domains = new Set<string>()
    for (const entry of schemaEntries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) domains.add(entry.name)
    }
    const schemas: Array<{
      folder: string; title: string; description: string; body: string; confirmed: boolean
    }> = []
    for (const domain of domains) {
      const confirmedPath = join(schemaDir, domain, 'confirmed.md')
      if (existsSync(confirmedPath)) {
        try {
          const content = await readFile(confirmedPath, 'utf-8')
          const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
          let title = domain
          if (fmMatch) {
            const t = fmMatch[1].match(/^title:\s*(.+)/m)
            if (t) title = t[1].replace(/['"]/g, '')
          }
          const bodyStart = fmMatch ? fmMatch[0].length : 0
          const rest = content.slice(bodyStart).trim()
          schemas.push({ folder: domain, title, description: '', body: rest, confirmed: true })
        } catch { /* skip */ }
      } else {
        schemas.push({ folder: domain, title: domain, description: '', body: '', confirmed: false })
      }
    }
    return schemas
  })

  ipcMain.handle('file:exists', async (_, filePath: string) => {
    return existsSync(filePath)
  })

  ipcMain.handle('file:walkDir', async (_, dirPath: string) => {
    const { readdir } = await import('fs/promises')
    const entities = new Set<string>()
    const concepts = new Set<string>()
    const sources = new Set<string>()
    let totalMarkdown = 0
    try {
      const entries = await readdir(dirPath, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const name = entry.name.toLowerCase()
          if (name.startsWith('_entities')) entities.add(entry.name)
          else if (name.startsWith('_concepts')) concepts.add(entry.name)
          else if (name.startsWith('_sources')) sources.add(entry.name)
        } else if (entry.name.endsWith('.md')) {
          totalMarkdown++
        }
      }
    } catch { /* ignore */ }
    return { entities: entities.size, concepts: concepts.size, sources: sources.size, totalMarkdown }
  })

  // ── Backup / version history ─────────────────────────────────
  ipcMain.handle('file:listBackups', async (_, filePath: string) => {
    const vaultPath = getVaultPath()
    if (!vaultPath) return []
    const relPath = filePath.startsWith(vaultPath) ? filePath.replace(vaultPath + '/', '') : filePath
    const backups = await listBackups(vaultPath, relPath)
    return backups
  })

  ipcMain.handle('file:previewBackup', async (_, filePath: string, timestamp: string) => {
    const vaultPath = getVaultPath()
    if (!vaultPath) return ''
    const relPath = filePath.startsWith(vaultPath) ? filePath.replace(vaultPath + '/', '') : filePath
    return await previewBackup(vaultPath, relPath, timestamp)
  })

  ipcMain.handle('file:restoreBackup', async (_, filePath: string, timestamp: string) => {
    const vaultPath = getVaultPath()
    if (!vaultPath) return false
    const relPath = filePath.startsWith(vaultPath) ? filePath.replace(vaultPath + '/', '') : filePath
    return await restoreBackup(vaultPath, relPath, timestamp)
  })
}