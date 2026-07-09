/**
 * auditHandlers.test.ts — backport from team ada72e9 (2026-07-07)
 * Original: xiaoyuan-team ada72e9 (vault:gitStatus/gitDiff/readAuditLog IPC tests)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

// ── Mock electron (验证 registerAuditHandlers 注册) ──
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    },
  },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => '/tmp/test' },
}))

// 必须在 mock 后 import
import { registerAuditHandlers, _gitStatusImpl, _readAuditLogImpl } from './auditHandlers'

describe('auditHandlers (7-7 新增, post-commit audit 配套)', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    registerAuditHandlers()
  })

  describe('IPC 注册', () => {
    it('注册 vault:gitStatus / vault:gitDiff / vault:readAuditLog', () => {
      expect(ipcHandlers.has('vault:gitStatus')).toBe(true)
      expect(ipcHandlers.has('vault:gitDiff')).toBe(true)
      expect(ipcHandlers.has('vault:readAuditLog')).toBe(true)
    })
  })

  describe('_gitStatusImpl (端到端, 真 git)', () => {
    it('空路径 → 返 isGitRepo: false', async () => {
      const result = await _gitStatusImpl('')
      expect(result.isGitRepo).toBe(false)
      expect(result.uncommittedCount).toBe(0)
      expect(result.files).toEqual([])
    })

    it('不存在的路径 → 返 isGitRepo: false (优雅降级)', async () => {
      const result = await _gitStatusImpl('/nonexistent/path/that/does/not/exist')
      expect(result.isGitRepo).toBe(false)
    })

    it('是 git repo 但没改动 → uncommittedCount: 0', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
      try {
        execSync('git init', { cwd: tmpDir, stdio: 'pipe' })
        execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' })
        execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: 'pipe' })
        writeFileSync(join(tmpDir, 'test.md'), '# hello')
        execSync('git add test.md', { cwd: tmpDir, stdio: 'pipe' })
        execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' })

        const result = await _gitStatusImpl(tmpDir)
        expect(result.isGitRepo).toBe(true)
        expect(result.uncommittedCount).toBe(0)
        expect(result.files).toEqual([])
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('有 uncommitted 改动 → 返 files 列表 + actor + diffLines', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
      try {
        execSync('git init', { cwd: tmpDir, stdio: 'pipe' })
        execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' })
        execSync('git config user.name "test-user"', { cwd: tmpDir, stdio: 'pipe' })
        writeFileSync(join(tmpDir, 'a.md'), '# original\n')
        execSync('git add a.md', { cwd: tmpDir, stdio: 'pipe' })
        execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' })

        // 改 3 个文件
        writeFileSync(join(tmpDir, 'a.md'), '# modified\n# new line\n')
        writeFileSync(join(tmpDir, 'b.md'), 'new file\n')
        writeFileSync(join(tmpDir, 'c.md'), 'untracked\n')

        const result = await _gitStatusImpl(tmpDir)
        expect(result.isGitRepo).toBe(true)
        expect(result.uncommittedCount).toBe(3)
        expect(result.files).toHaveLength(3)

        const paths = result.files.map((f: any) => f.path).sort()
        expect(paths).toEqual(['a.md', 'b.md', 'c.md'])

        const a = result.files.find((f: any) => f.path === 'a.md')!
        expect(a.status).toBe('modified')
        expect(a.author).toBe('test-user')
        expect(a.diffLines).toBeGreaterThan(0)

        const c = result.files.find((f: any) => f.path === 'c.md')!
        expect(c.status).toBe('untracked')
        expect(c.author).toBe(null)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('post-commit hook 未装 → hasPostCommitHook: false', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
      try {
        execSync('git init', { cwd: tmpDir, stdio: 'pipe' })
        const result = await _gitStatusImpl(tmpDir)
        expect(result.hasPostCommitHook).toBe(false)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })

  describe('_readAuditLogImpl (端到端, 读真 _log/ 目录)', () => {
    it('没 _log/ 目录 → 返空数组', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
      try {
        const result = await _readAuditLogImpl(tmpDir)
        expect(result).toEqual([])
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('读 _log/YYYY-MM-DD/*.jsonl, 倒序解析', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
      try {
        const logDir = join(tmpDir, '_log', '2026-07-07')
        mkdirSync(logDir, { recursive: true })
        writeFileSync(
          join(logDir, 'agent-xiaodao-143052.jsonl'),
          '{"ts":"2026-07-07T14:30:52+00:00","actor":"agent-xiaodao","sha":"abc1234","files_changed":3,"files":["a.md","b.md","c.md"]}\n' +
          '{"ts":"2026-07-07T14:31:00+00:00","actor":"alice","sha":"def5678","files_changed":1,"files":["d.md"]}\n'
        )

        const entries = await _readAuditLogImpl(tmpDir, 50)
        expect(entries).toHaveLength(2)
        // 倒序: 后写入的在文件靠后, 但文件本身按 HHMMSS 排序 = 时间序
        // 字典序逆序: 'agent-xiaodao-143052.jsonl' < 'agent-xiaodao-143100.jsonl' (如果存在)
        // 同一文件: 先解析的 (agent-xiaodao) 在前
        expect(entries[0].actor).toBe('agent-xiaodao')
        expect(entries[0].sha).toBe('abc1234')
        expect(entries[1].actor).toBe('alice')
        expect(entries[1].sha).toBe('def5678')
        expect(entries[0].source).toBe('log')
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })

    it('limit 参数生效', async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'audit-test-'))
      try {
        const logDir = join(tmpDir, '_log', '2026-07-07')
        mkdirSync(logDir, { recursive: true })
        // 3 个 commit
        for (let i = 0; i < 3; i++) {
          writeFileSync(
            join(logDir, `a-${100 + i}.jsonl`),
            `{"ts":"2026-07-07T14:30:${i}0+00:00","actor":"a${i}","sha":"s${i}","files_changed":1,"files":["f${i}.md"]}\n`
          )
        }
        const entries = await _readAuditLogImpl(tmpDir, 2)
        expect(entries).toHaveLength(2)
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
      }
    })
  })
})
