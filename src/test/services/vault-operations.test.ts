import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, readFile, rm, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const TEST_DIR = join(__dirname, '../../test-tmp-db2')

describe('Vault file system operations', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    await mkdir(join(TEST_DIR, '_raw'), { recursive: true })
    await mkdir(join(TEST_DIR, '_wiki'), { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('lists files correctly', async () => {
    await writeFile(join(TEST_DIR, 'a.md'), '# A', 'utf-8')
    await writeFile(join(TEST_DIR, 'b.md'), '# B', 'utf-8')
    await writeFile(join(TEST_DIR, '_wiki', 'c.md'), '# C', 'utf-8')
    
    const all = await readdir(TEST_DIR, { recursive: true })
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it('detects file existence after write', async () => {
    const f = join(TEST_DIR, '_wiki', 'new-page.md')
    expect(existsSync(f)).toBe(false)
    await writeFile(f, '# New', 'utf-8')
    expect(existsSync(f)).toBe(true)
  })

  it('deletes a file and removes it from listing', async () => {
    const f = join(TEST_DIR, 'temp.md')
    await writeFile(f, 'temp', 'utf-8')
    expect(existsSync(f)).toBe(true)
    const { unlink } = await import('fs/promises')
    await unlink(f)
    expect(existsSync(f)).toBe(false)
  })

  it('creates wiki page with frontmatter', async () => {
    const frontmatter = [
      '---',
      'title: "Test Page"',
      'tags: [a, b]',
      'created: 2026-05-11',
      '---',
      '',
      '# Test Page',
      '',
      'Content here'
    ].join('\n')
    
    const f = join(TEST_DIR, '_wiki', 'test-page.md')
    await writeFile(f, frontmatter, 'utf-8')
    
    const content = await readFile(f, 'utf-8')
    expect(content).toContain('title: "Test Page"')
    expect(content).toContain('tags: [a, b]')
    expect(content).toContain('# Test Page')
  })

  it('appends to an existing log file', async () => {
    const logPath = join(TEST_DIR, 'log.md')
    await writeFile(logPath, '# 操作日志\n\n', 'utf-8')
    
    // Append 3 entries
    const entries = ['query: test1', 'write: test2', 'ingest: test3']
    for (const e of entries) {
      const existing = await readFile(logPath, 'utf-8')
      const ts = new Date().toISOString()
      await writeFile(logPath, existing + `\n### ${ts}\n  - ${e}\n`, 'utf-8')
    }
    
    const result = await readFile(logPath, 'utf-8')
    expect(result).toContain('query: test1')
    expect(result).toContain('write: test2')
    expect(result).toContain('ingest: test3')
  })
  it('same content produces same hash', async () => {
    const { createHash } = await import('crypto')
    await writeFile(join(TEST_DIR, 'hash1.md'), 'same content', 'utf-8')
    await writeFile(join(TEST_DIR, 'hash2.md'), 'same content', 'utf-8')
    const h1 = createHash('sha256').update(await readFile(join(TEST_DIR, 'hash1.md'))).digest('hex')
    const h2 = createHash('sha256').update(await readFile(join(TEST_DIR, 'hash2.md'))).digest('hex')
    expect(h1).toBe(h2)
  })

  it('different content produces different hash', async () => {
    const { createHash } = await import('crypto')
    await writeFile(join(TEST_DIR, 'hash3.md'), 'A', 'utf-8')
    await writeFile(join(TEST_DIR, 'hash4.md'), 'B', 'utf-8')
    const h1 = createHash('sha256').update(await readFile(join(TEST_DIR, 'hash3.md'))).digest('hex')
    const h2 = createHash('sha256').update(await readFile(join(TEST_DIR, 'hash4.md'))).digest('hex')
    expect(h1).not.toBe(h2)
  })
})

describe('File type detection', () => {
  it('identifies markdown files', () => {
    const files = ['test.md', 'doc.markdown', 'note.mdown', 'readme.mkd']
    const isMD = (f: string) => ['md', 'markdown', 'mdown', 'mkd'].includes(f.split('.').pop()!)
    for (const f of files) expect(isMD(f)).toBe(true)
  })

  it('excludes non-markdown files', () => {
    const files = ['doc.docx', 'sheet.xlsx', 'image.png', 'data.json']
    const isMD = (f: string) => ['md', 'markdown', 'mdown', 'mkd'].includes(f.split('.').pop()!)
    for (const f of files) expect(isMD(f)).toBe(false)
  })

  it('detects binary file types', () => {
    const binaries = new Set(['docx', 'pdf', 'doc', 'xlsx', 'pptx', 'png', 'jpg'])
    const isBinary = (ext: string) => binaries.has(ext)
    expect(isBinary('docx')).toBe(true)
    expect(isBinary('md')).toBe(false)
  })
})


