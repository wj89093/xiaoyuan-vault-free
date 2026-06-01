import { writeFile, mkdir, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import log from 'electron-log/main'


// ── Save text to vault ─────────────────────────────────────────────────

export async function saveToVault(content: string): Promise<void> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return
  const collectDir = join(vaultPath, '_raw')
  if (!existsSync(collectDir)) await mkdir(collectDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const isURL = /^https?:\/\/[^\s]+$/i.test(content.trim())
  const prefix = isURL ? 'web' : 'clip'
  const filename = `${prefix}-${timestamp}.md`

  const title = content.split('\n')[0].slice(0, 50).replace(/["#*`\[\]]/g, '')
  const frontmatter = [
    '---', `title: "${title || '快速捕获'}"`,
    `type: ${isURL ? 'web-clip' : 'note'}`,
    `source: bubble-card`, `created: ${new Date().toISOString().slice(0, 10)}`,
    `tags: [quick-capture, ${isURL ? 'url' : 'note'}]`,
    '---', '', content,
  ].join('\n')

  const filePath = join(collectDir, filename)
  await writeFile(filePath, frontmatter, 'utf-8')
  log.info('[Bubble] Saved:', filename)
}

// ── Import files to vault ──────────────────────────────────────────────

export async function importFilesToVault(
  filePaths: string[],
  vaultPath?: string,
): Promise<{ imported: number; vaultPath: string; collectDir: string; errors: string[] }> {
  const effectiveVaultPath = vaultPath ?? getVaultPath()
  if (!effectiveVaultPath || !filePaths.length) {
    log.info('[Bubble] importFilesToVault: no vaultPath or empty filePaths', { vaultPath: effectiveVaultPath, filePaths })
    return { imported: 0, vaultPath: effectiveVaultPath, collectDir: '', errors: ['无 vaultPath 或文件列表为空'] }
  }

  log.info('[Bubble] importFilesToVault: starting', { vaultPath: effectiveVaultPath, filePaths })
  const collectDir = join(effectiveVaultPath, '_raw')
  try {
    if (!existsSync(collectDir)) await mkdir(collectDir, { recursive: true })
    const { basename } = await import('path')
    let imported = 0
    const errors: string[] = []
    for (const srcPath of filePaths) {
      if (!existsSync(srcPath)) {
        errors.push(basename(srcPath) + ': 文件不存在')
        continue
      }
      const dest = join(collectDir, basename(srcPath))
      try {
        await copyFile(srcPath, dest)
        imported++
        log.info('[Bubble] copied:', srcPath, '->', dest)
      } catch (e) {
        errors.push(basename(srcPath) + ': ' + String(e))
      }
    }
    log.info('[Bubble] Imported', imported, 'files to', collectDir)
    return { imported, vaultPath: effectiveVaultPath, collectDir, errors }
  } catch (e) {
    log.error('[Bubble] importFilesToVault error:', e)
    return { imported: 0, vaultPath: effectiveVaultPath, collectDir: '', errors: [String(e)] }
  }
}
