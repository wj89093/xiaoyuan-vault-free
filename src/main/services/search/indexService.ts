/**
 * indexService — wiki index rebuild
 * Pure fs, no Agent dependency.
 * Replaced by Agent's writeWiki tool in normal operation;
 * exposed here for manual/triggered rebuilds.
 */

// import log from 'electron-log/main'
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { join } from 'path'
import { existsSync, readFile, writeFile, readdir, stat } from 'fs/promises'

export async function rebuildIndexFile(vaultPath: string, changedFiles?: string[]): Promise<void> {
  const wikiDir = join(vaultPath, '_wiki')
  const logPath = join(wikiDir, 'log.md')

  const wikiFiles = await scanWikiFiles(wikiDir)
  const byFolder: Record<string, string[]> = {}

  for (const f of wikiFiles) {
    const relPath = f.startsWith(wikiDir) ? f.slice(wikiDir.length + 1) : f
    const folder = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '.'
    if (!byFolder[folder]) byFolder[folder] = []
    byFolder[folder].push(relPath)
  }

  const lines: string[] = [
    '# 页面索引',
    '',
    `> 自动生成 (${new Date().toISOString().slice(0, 10)})`,
    ''
  ]
  for (const [folder, entries] of Object.entries(byFolder).sort()) {
    lines.push(`## ${folder === '.' ? '根目录' : folder}`, '')
    for (const e of entries.filter((f) => f.endsWith('.md'))) {
      const name = e.split('/').pop()?.replace('.md', '') ?? e
      lines.push(`- [[${name}]]`)
    }
    lines.push('')
  }

  const content = lines.join('\n')
  const indexPath = join(wikiDir, 'index.md')
  const existing = await readFile(indexPath, 'utf-8').catch(() => '')
  if (existing !== content) {
    await writeFile(indexPath, content, 'utf-8')
  }

  if (changedFiles?.length) {
    const diff = [
      '',
      `### ${new Date().toISOString().slice(0, 19)}`,
      ...changedFiles.map((f) => `  - ${f}`)
    ].join('\n')
    await writeFile(
      logPath,
      (await readFile(logPath, 'utf-8').catch(() => '')) + '\n' + diff,
      'utf-8'
    )
  }
}

async function scanWikiFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  if (!existsSync(dir)) return results
  async function walk(currentDir: string): Promise<void> {
    for (const name of (await readdir(currentDir)).sort()) {
      if (name.startsWith('.')) continue
      const full = join(currentDir, name)
      if ((await stat(full)).isDirectory()) await walk(full)
      else if (name.endsWith('.md')) results.push(full)
    }
  }
  await walk(dir)
  return results
}
