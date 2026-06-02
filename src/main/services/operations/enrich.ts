import log from 'electron-log/main'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getVaultPath } from '../database/database'
import { parseFrontmatter, applyFrontmatter, extractTypedLinks } from '../frontmatter/index'

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const FOLDER_MAP_DEFAULTS: Record<string, string> = {
  person: '1-人物',
  company: '2-公司',
  project: '3-项目',
  meeting: '4-会议',
  deal: '5-交易',
  concept: '6-概念',
  research: '7-研究',
  collection: '0-收集'
}
let _folderMap: Record<string, string> | null = null

export async function loadFolderMap(): Promise<Record<string, string>> {
  if (_folderMap) return _folderMap
  const vaultPath = getVaultPath()
  if (!vaultPath) return { ...FOLDER_MAP_DEFAULTS }
  const dir = join(vaultPath, '.xiaoyuan')
  try {
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    const mapPath = join(dir, 'folder-map.json')
    if (existsSync(mapPath)) {
      const raw = await readFile(mapPath, 'utf-8')
      _folderMap = JSON.parse(raw)
      return _folderMap
    }
  } catch {
    /* use defaults */
  }
  _folderMap = { ...FOLDER_MAP_DEFAULTS }
  return _folderMap
}

export async function saveFolderMap(map: Record<string, string>): Promise<void> {
  _folderMap = { ...map }
  const vaultPath = getVaultPath()
  if (!vaultPath) return
  const dir = join(vaultPath, '.xiaoyuan')
  try {
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'folder-map.json'), JSON.stringify(map, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
}

// ─── Bidirectional Links ────────────────────────────────────────────

/**
 * Scan all markdown files in vault (recursive)
 */
export async function scanAllMarkdownFiles(vaultPath: string): Promise<string[]> {
  const results: string[] = []
  const seen = new Set<string>()

  async function scan(dir: string) {
    const { readdir, stat } = await import('fs/promises')
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const name of entries.sort()) {
      if (name.startsWith('.')) continue
      const fullPath = join(dir, name)
      try {
        const fstat = await stat(fullPath)
        if (fstat.isDirectory()) {
          await scan(fullPath)
        } else if (name.endsWith('.md')) {
          if (!seen.has(fullPath)) {
            seen.add(fullPath)
            results.push(fullPath)
          }
        }
      } catch (e) {
        log.warn(`[scanAllMarkdownFiles] `, e)
      }
    }
  }

  await scan(vaultPath)
  return results
}

/**
 * Find all files that mention a given entity name (case-insensitive)
 */
async function findFilesMentioningEntity(vaultPath: string, entityName: string): Promise<string[]> {
  const files = await scanAllMarkdownFiles(vaultPath)
  const results: string[] = []

  for (const filePath of files) {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const plainRe = new RegExp(entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&'), 'i')
      const typedRe = /\[\[[^\]:]+:/g
      if (plainRe.test(raw) || typedRe.test(raw)) {
        results.push(filePath)
      }
    } catch (e) {
      log.warn(`[findFilesMentioningEntity] `, e)
    }
  }
  return results
}

/**
 * Add a backlink to target file's seeAlso field
 */
async function addBacklink(
  targetPath: string,
  sourceTitle: string,
  sourcePath: string
): Promise<boolean> {
  if (targetPath === sourcePath) return false
  try {
    const raw = await readFile(targetPath, 'utf-8')
    const { frontmatter } = parseFrontmatter(raw)
    const seeAlso: string[] = Array.isArray(frontmatter.seeAlso) ? frontmatter.seeAlso : []

    const alreadyLinked = seeAlso.some((s) => {
      const norm = s.replace(/\s+/g, '').toLowerCase()
      return (
        norm === sourceTitle.replace(/\s+/g, '').toLowerCase() ||
        norm === sourcePath.replace(/\s+/g, '').toLowerCase()
      )
    })
    if (alreadyLinked) return false

    seeAlso.push(sourceTitle)
    const newFrontmatter = { ...frontmatter, seeAlso }
    const newContent = applyFrontmatter(raw, newFrontmatter)
    const { writeFile } = await import('fs/promises')
    await writeFile(targetPath, newContent, 'utf-8')
    return true
  } catch (err) {
    log.warn(
      '[enrich] writeFile failed, returning false',
      targetPath,
      err instanceof Error ? err.message : String(err)
    )
    return false
  }
}

/**
 * Update all backlinks for a file's typed links.
 */
export async function updateBacklinksForFile(filePath: string, fileTitle: string): Promise<number> {
  const vaultPath = getVaultPath()
  if (!vaultPath) return 0

  const raw = await readFile(filePath, 'utf-8')
  const { content } = parseFrontmatter(raw)
  const typedLinks = extractTypedLinks(content)
  if (typedLinks.length === 0) return 0

  let added = 0
  for (const rel of typedLinks) {
    const targetName = rel.target
    const mentioning = await findFilesMentioningEntity(vaultPath, targetName)
    for (const targetPath of mentioning) {
      const added_one = await addBacklink(targetPath, fileTitle, filePath)
      if (added_one) {
        added++
        log.info(`[Backlink] ${fileTitle} → ${targetName} (via ${targetPath})`)
      }
    }
  }
  return added
}
