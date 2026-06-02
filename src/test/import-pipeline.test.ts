import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, readFile, copyFile, unlink, rm, readdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { createHash } from 'crypto'

const TEST_DIR = join(__dirname, '../../test-tmp-import')

describe('Import pipeline', () => {
  beforeEach(async () => {
    await mkdir(join(TEST_DIR, '_raw'), { recursive: true })
    await mkdir(join(TEST_DIR, '_wiki'), { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('copies md file without corruption', async () => {
    const src = join(TEST_DIR, 'source.md')
    const dest = join(TEST_DIR, '_raw', 'source.md')
    const content = '# Test\n\nHello World\n'
    await writeFile(src, content, 'utf-8')
    await copyFile(src, dest)
    const copied = await readFile(dest, 'utf-8')
    expect(copied).toBe(content)
    expect(existsSync(src)).toBe(true) // source preserved
  })

  it('copies binary file without corruption (simulating docx)', async () => {
    const src = join(TEST_DIR, 'document.docx')
    const dest = join(TEST_DIR, '_raw', 'document.docx')
    const data = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(1000).fill(0xab)])
    await writeFile(src, data)
    await copyFile(src, dest)

    const origHash = createHash('sha256')
      .update(await readFile(src))
      .digest('hex')
    const copyHash = createHash('sha256')
      .update(await readFile(dest))
      .digest('hex')
    expect(origHash).toBe(copyHash)
    expect(existsSync(src)).toBe(true)
  })

  it('copies multiple files in sequence', async () => {
    const files = ['a.md', 'b.md', 'c.docx']
    for (const f of files) {
      const src = join(TEST_DIR, f)
      const dest = join(TEST_DIR, '_raw', f)
      await writeFile(src, f + ' content', 'utf-8')
      await copyFile(src, dest)
    }
    const imported = await readdir(join(TEST_DIR, '_raw'))
    expect(imported.length).toBe(3)
    expect(imported.sort()).toEqual(files.sort())
  })

  it('source file is NOT deleted after copy', async () => {
    const src = join(TEST_DIR, 'keep-me.md')
    await writeFile(src, 'important', 'utf-8')
    const dest = join(TEST_DIR, '_raw', 'keep-me.md')
    await copyFile(src, dest)

    expect(existsSync(src)).toBe(true)
    expect(existsSync(dest)).toBe(true)
    // Both should be identical
    const s1 = await readFile(src, 'utf-8')
    const s2 = await readFile(dest, 'utf-8')
    expect(s1).toBe(s2)
  })

  it('handles files with special characters in names', async () => {
    const name = '关于组织前往无限公园学习交流的通知(1).docx'
    const src = join(TEST_DIR, name)
    const dest = join(TEST_DIR, '_raw', name)
    await writeFile(src, 'test', 'utf-8')
    await copyFile(src, dest)
    expect(existsSync(dest)).toBe(true)
  })
})

describe('Wiki file enrichment safety', () => {
  beforeEach(async () => {
    await mkdir(join(TEST_DIR, '_wiki'), { recursive: true })
  })

  it('reads md file without modification', async () => {
    const f = join(TEST_DIR, '_wiki', 'test.md')
    const content = '---\ntitle: Test\n---\n\n# Body\n'
    await writeFile(f, content, 'utf-8')
    const read = await readFile(f, 'utf-8')
    expect(read).toBe(content)
  })

  it('binary files produce garbage when read as UTF-8', async () => {
    const f = join(TEST_DIR, '_wiki', 'not-real.docx')
    const bin = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    await writeFile(f, bin)
    const readAsUtf8 = await readFile(f, 'utf-8')
    expect(readAsUtf8).not.toBe('PK')
  })
})
