import { db, scanDirectory } from '../database/database'
import { getVaultPath } from '../database/database'
import { extractTitle, simpleHash } from '../database/database'
import type { FileRecord } from '../database/database'
import { join, dirname, basename, extname } from 'path'
import { readFile, writeFile, mkdir, rename as fsRename, unlink, stat } from 'fs/promises'
import log from 'electron-log/main'
import { parseFrontmatter } from '../frontmatter/index'
import { ensureInVault } from '../../ipc/fileHandlers/utils'

// 2026-07-16 (Free 仓 backport from team 37a8b15): DbRow type 替 as any, no-explicit-any 删 (unused)
type DbRow = Record<string, unknown>

export { getVaultPath }

export async function getFileContent(filePath: string): Promise<string> {
  const vp = getVaultPath()
  const fullPath = filePath.startsWith(vp) ? filePath : join(vp, filePath)
  const content = await readFile(fullPath, 'utf-8')
  return content
}

export async function saveFile(filePath: string, content: string): Promise<boolean> {
  try {
    const vp = getVaultPath()
    const fullPath = filePath.startsWith(vp) ? filePath : join(vp, filePath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')

    // Re-index
    if (db) {
      const relPath = filePath.startsWith(vp) ? filePath.replace(vp + '/', '') : filePath
      const stats = await stat(fullPath)
      const name = basename(relPath)
      const { frontmatter } = parseFrontmatter(content)
      const title = frontmatter.title ?? extractTitle(content) ?? name.replace(/\.md$/, '')
      const hash = simpleHash(content)
      const folder = relPath.includes('/') ? relPath.split('/').slice(0, -1).join('/') : ''

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO files (path, name, title, content, tags, frontmatter, modified_at, content_hash, folder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        relPath,
        name,
        title,
        content,
        frontmatter.tags?.join(', ') ?? '',
        JSON.stringify(frontmatter),
        stats.mtimeMs,
        hash,
        folder
      )
    }

    return true
  } catch (err) {
    log.error('Save error:', err)
    return false
  }
}

export async function renameFile(oldPath: string, newName: string): Promise<boolean> {
  ensureInVault(oldPath)
  try {
    const vp = getVaultPath()
    const oldFullPath = oldPath.startsWith(vp) ? oldPath : join(vp, oldPath)
    const parentDir = dirname(oldFullPath)
    const newFullPath = join(parentDir, newName)

    // Check if target already exists
    try {
      await stat(newFullPath)
      return false // Target exists, can't rename
    } catch {
      /* target doesn't exist (expected) */
    }

    await fsRename(oldFullPath, newFullPath)

    // Update database
    if (db) {
      const oldRelPath = oldPath.startsWith(vp) ? oldPath.replace(vp + '/', '') : oldPath
      const newRelPath = join(dirname(oldRelPath), newName)

      const existing = db.prepare('SELECT * FROM files WHERE path = ?').get(oldRelPath) as DbRow | undefined
      if (existing) {
        // Update file record
        db.prepare(
          `
          UPDATE files SET path = ?, name = ? WHERE path = ?
        `
        ).run(newRelPath, newName, oldRelPath)

        // Also update FTS by re-indexing
        const content = await readFile(newFullPath, 'utf-8')
        const stats = await stat(newFullPath)
        const { frontmatter } = parseFrontmatter(content)
        const title = frontmatter.title ?? extractTitle(content) ?? newName.replace(/\.md$/, '')
        const hash = simpleHash(content)
        const folder = newRelPath.includes('/') ? newRelPath.split('/').slice(0, -1).join('/') : ''

        db.prepare(
          `
          UPDATE files SET content = ?, title = ?, tags = ?, frontmatter = ?, modified_at = ?, content_hash = ?, folder = ? WHERE path = ?
        `
        ).run(
          content,
          title,
          frontmatter.tags?.join(', ') ?? '',
          JSON.stringify(frontmatter),
          stats.mtimeMs,
          hash,
          folder,
          newRelPath
        )
      }
    }

    return true
  } catch (err) {
    log.error('Rename error:', err)
    return false
  }
}

export async function moveFile(oldPath: string, newParentDir: string): Promise<boolean> {
  ensureInVault(oldPath)
  ensureInVault(newParentDir)
  try {
    const vp = getVaultPath()
    const oldFullPath = oldPath.startsWith(vp) ? oldPath : join(vp, oldPath)
    const newFullPath = join(vp, newParentDir, basename(oldFullPath))

    // Check if source exists
    try {
      await stat(oldFullPath)
    } catch {
      return false
    }

    // Check if target already exists
    try {
      await stat(newFullPath)
      return false
    } catch {
      /* OK */
    }

    // Ensure parent dir exists
    await mkdir(dirname(newFullPath), { recursive: true })

    await fsRename(oldFullPath, newFullPath)

    // Update database
    if (db) {
      const oldRelPath = oldPath.startsWith(vp + '/') ? oldPath.slice(vp.length + 1) : oldPath
      const newRelPath = join(newParentDir, basename(oldRelPath))

      const existing = db.prepare('SELECT * FROM files WHERE path = ?').get(oldRelPath) as DbRow | undefined
      if (existing) {
        db.prepare('UPDATE files SET path = ?, folder = ? WHERE path = ?').run(
          newRelPath,
          newParentDir,
          oldRelPath
        )

        // Re-index content
        const content = await readFile(newFullPath, 'utf-8')
        const stats = await stat(newFullPath)
        const { frontmatter } = parseFrontmatter(content)
        const title =
          frontmatter.title ?? extractTitle(content) ?? basename(oldRelPath).replace(/\.md$/, '')
        const hash = simpleHash(content)
        db.prepare(
          `
          UPDATE files SET content = ?, title = ?, tags = ?, frontmatter = ?, modified_at = ?, content_hash = ? WHERE path = ?
        `
        ).run(
          content,
          title,
          frontmatter.tags?.join(', ') ?? '',
          JSON.stringify(frontmatter),
          stats.mtimeMs,
          hash,
          newRelPath
        )
      }
    }
    return true
  } catch (err) {
    log.error('Move error:', err)
    return false
  }
}

export async function deleteFile(filePath: string): Promise<boolean> {
  ensureInVault(filePath)
  try {
    const vp = getVaultPath()
    const fullPath = filePath.startsWith(vp) ? filePath : join(vp, filePath)
    await unlink(fullPath)

    // Remove from database
    if (db) {
      const relPath = filePath.startsWith(vp) ? filePath.replace(vp + '/', '') : filePath
      db.prepare('DELETE FROM files WHERE path = ?').run(relPath)
    }

    return true
  } catch (err) {
    log.error('Delete error:', err)
    return false
  }
}

export async function deleteFolder(folderPath: string): Promise<boolean> {
  try {
    const vp = getVaultPath()
    const fullPath = folderPath.startsWith(vp) ? folderPath : join(vp, folderPath)

    // Remove all files in this folder from DB first
    if (db) {
      const relPath = folderPath.startsWith(vp) ? folderPath.replace(vp + '/', '') : folderPath
      db.prepare('DELETE FROM files WHERE folder LIKE ?').run(`${relPath}%`)
    }

    // Remove the directory recursively from filesystem
    const { fsDeleteRecursive } = await import('../database/database')
    await fsDeleteRecursive(fullPath)
    return true
  } catch (err) {
    log.error('Delete folder error:', err)
    return false
  }
}

export async function createFolder(folderPath: string): Promise<boolean> {
  try {
    const vp = getVaultPath()
    const fullPath = folderPath.startsWith(vp) ? folderPath : join(vp, folderPath)
    await mkdir(fullPath, { recursive: true })
    return true
  } catch (err) {
    log.error('Create folder error:', err)
    return false
  }
}

export async function listVaultFiles(): Promise<FileRecord[]> {
  const vp = getVaultPath()
  if (!vp) return []
  const files = await scanDirectory(vp)
  // Phase 2: _state/FS_CACHE.json (Obsidian 模式, 2026-06-11)
  // 实时快照, 外部 AI read 一下就能看到 vault 文件树, 不需递归 ls
  writeFsCache(vp, files).catch(() => {})
  return files
}

// 写入 _state/FS_CACHE.json (Phase 2)
async function writeFsCache(vaultPath: string, files: FileRecord[]): Promise<void> {
  try {
    const { mkdir, writeFile } = await import('fs/promises')
    const { join } = await import('path')
    const stateDir = join(vaultPath, '_state')
    await mkdir(stateDir, { recursive: true })
    // 只取一级 root 概况 (子文件 count), 减少 JSON 体积
    const roots = files
      .filter(f => !f.path.includes('/'))
      .map(f => ({
        path: f.path,
        name: f.name,
        isDirectory: f.isDirectory,
        count: f.isDirectory ? files.filter(c => c.path.startsWith(f.path + '/')).length : undefined,
        modified: f.isDirectory ? undefined : f.modified,
      }))
    const cache = JSON.stringify({
      updatedAt: new Date().toISOString(),
      totalFiles: files.filter(f => !f.isDirectory).length,
      totalDirs: files.filter(f => f.isDirectory).length,
      roots,
    }, null, 2)
    await writeFile(join(stateDir, 'FS_CACHE.json'), cache, 'utf-8')
  } catch {
    // silent — 外部 AI 看到旧 cache 也够用
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared low-level file operations — pure fs only, no logging, no IPC, no DB.
// ─────────────────────────────────────────────────────────────────────────────

export async function renameFileInVault(
  _vaultPath: string,
  oldPath: string,
  newName: string
): Promise<string> {
  const ext = extname(oldPath)
  const finalName = newName.endsWith(ext) ? newName : newName + ext
  const ok = await renameFile(oldPath, finalName)
  if (!ok) throw new Error(`rename failed: ${oldPath} → ${finalName}`)
  const dir = dirname(oldPath)
  return join(dir, finalName)
}

export async function moveFileInVault(
  _vaultPath: string,
  filePath: string,
  newParentDir: string
): Promise<string> {
  const ok = await moveFile(filePath, newParentDir)
  if (!ok) throw new Error(`move failed: ${filePath} → ${newParentDir}`)
  return join(newParentDir, basename(filePath))
}

export async function createFolderInVault(
  _vaultPath: string,
  parentDir: string,
  folderName: string
): Promise<string> {
  const ok = await createFolder(join(parentDir, folderName))
  if (!ok) throw new Error(`create folder failed: ${folderName}`)
  return join(parentDir, folderName)
}

export async function deleteFolderInVault(_vaultPath: string, folderPath: string): Promise<void> {
  const ok = await deleteFolder(folderPath)
  if (!ok) throw new Error(`delete folder failed: ${folderPath}`)
}
