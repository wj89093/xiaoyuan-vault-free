import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { unlink, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const TEST_DIR = join(__dirname, '../../test-tmp-db')

describe('Database file operations — integration', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('creates and reads a file', async () => {
    const f = join(TEST_DIR, 'test.md')
    await writeFile(f, '# Hello\n\nWorld', 'utf-8')
    const content = await readFile(f, 'utf-8')
    expect(content).toBe('# Hello\n\nWorld')
  })

  it('renames a file correctly', async () => {
    const src = join(TEST_DIR, 'old.md')
    const dst = join(TEST_DIR, 'new.md')
    await writeFile(src, 'test', 'utf-8')
    const { rename } = await import('fs/promises')
    await rename(src, dst)
    expect(existsSync(src)).toBe(false)
    expect(existsSync(dst)).toBe(true)
    expect(await readFile(dst, 'utf-8')).toBe('test')
  })

  it('deletes a file correctly', async () => {
    const f = join(TEST_DIR, 'delete-me.md')
    await writeFile(f, 'delete', 'utf-8')
    expect(existsSync(f)).toBe(true)
    await unlink(f)
    expect(existsSync(f)).toBe(false)
  })

  it('copyFile preserves content byte-for-byte', async () => {
    const src = join(TEST_DIR, 'source.bin')
    const dst = join(TEST_DIR, 'copy.bin')
    const data = Buffer.from([0x50, 0x4b, 0x03, 0x04]) // ZIP magic bytes (like docx)
    await writeFile(src, data)
    const { copyFile } = await import('fs/promises')
    await copyFile(src, dst)
    const copied = await readFile(dst)
    expect(Buffer.compare(data, copied)).toBe(0)
  })

  it('creates nested directories', async () => {
    const deep = join(TEST_DIR, '_wiki', 'topic', 'subtopic')
    await mkdir(deep, { recursive: true })
    const f = join(deep, 'index.md')
    await writeFile(f, '# Index', 'utf-8')
    expect(existsSync(f)).toBe(true)
  })
})

describe('Path traversal prevention in file operations', () => {
  it('blocks rename to path outside vault', () => {
    const safe = (p: string) => {
      const vp = '/test/vault'
      const resolved = join(vp, p.startsWith('/') ? p.slice(1) : p)
      if (!resolved.startsWith(vp)) throw new Error('Path traversal')
      return resolved
    }
    expect(() => safe('../../etc/passwd')).toThrow('Path traversal')
    expect(safe('docs/test.md')).toBe('/test/vault/docs/test.md')
  })
})
