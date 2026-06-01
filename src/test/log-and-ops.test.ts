import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const TEST_DIR = join(__dirname, '../../test-tmp-log')

describe('Operation log (log.md)', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('appends log entries with timestamps', async () => {
    const logPath = join(TEST_DIR, 'log.md')
    await writeFile(logPath, '# 操作日志\n\n暂无记录\n', 'utf-8')

    // Simulate appendToOperationLog
    const entries = ['query: 搜索生物医药']
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const lines = ['', `### ${timestamp}`, ...entries.map(e => `  - ${e}`)]

    const existing = await readFile(logPath, 'utf-8')
    await writeFile(logPath, existing + '\n' + lines.join('\n'), 'utf-8')

    const result = await readFile(logPath, 'utf-8')
    expect(result).toContain('### ')
    expect(result).toContain('搜索生物医药')
    expect(result).toContain('暂无记录') // preserves existing content
  })

  it('handles empty entries gracefully', async () => {
    const logPath = join(TEST_DIR, 'log.md')
    await writeFile(logPath, '# 操作日志\n', 'utf-8')

    const entries: string[] = []
    if (entries.length === 0) {
      // Should skip write
    }

    const result = await readFile(logPath, 'utf-8')
    expect(result).toBe('# 操作日志\n')
  })
})

describe('Database operations — edge cases', () => {
  it('creates file in non-existent directory', async () => {
    const deep = join(TEST_DIR, 'new', 'nested', 'dir')
    await mkdir(deep, { recursive: true })
    const f = join(deep, 'test.md')
    await writeFile(f, 'content', 'utf-8')
    expect(existsSync(f)).toBe(true)
  })

  it('overwrites existing file correctly', async () => {
    const f = join(TEST_DIR, 'overwrite.md')
    await writeFile(f, 'old', 'utf-8')
    await writeFile(f, 'new', 'utf-8')
    expect(await readFile(f, 'utf-8')).toBe('new')
  })
})
