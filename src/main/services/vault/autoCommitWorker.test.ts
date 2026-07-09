/**
 * autoCommitWorker.test.ts — 7-8 W7+ 实测 (替换 daily backup 后)
 *
 * 验证 7 个关键行为:
 *   1. start: 真 git repo, watcher ready
 *   2. start: 非 git repo, no-op + warn
 *   3. onChange: 写文件触发, debounce 后 commit
 *   4. commit: actor = auto-commit-worker (跟用户 git config 区分)
 *   5. commit: 恢复 user.name 到原值 (try/finally)
 *   6. exclude: _log/, .git/ 系统文件不入 commit
 *   7. lastResortCommit: 抢断 pending debounce timer 立即触发
 *
 * 测试用真 git (mkdtempSync + git init), 不 mock git
 * debounce 短 (200ms) 让测试快; 用 5min 默认 debounce 测 1 个 case 验证 (慢但真实)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, utimesSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

import {
  AutoCommitWorker,
  AUTO_COMMIT_AUTHOR,
  AUTO_COMMIT_DEBOUNCE_MS,
  startAutoCommitWorker,
} from './autoCommitWorker'

// mock electron-log 避免 vitest 控制台噪声
vi.mock('electron-log/main', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}))

function initGitRepo(dir: string): void {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  spawnSync('git', ['config', '--local', 'user.email', 'test@test.local'], {
    cwd: dir,
    stdio: 'ignore',
  })
  spawnSync('git', ['config', '--local', 'user.name', 'original-author'], {
    cwd: dir,
    stdio: 'ignore',
  })
  // 初始 commit (让 git 状态干净)
  writeFileSync(join(dir, 'README.md'), '# test')
  spawnSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' })
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: dir, stdio: 'ignore' })
}

function getLastCommit(dir: string): { author: string; message: string; sha: string } {
  const r = spawnSync(
    'git',
    ['-C', dir, 'log', '-1', '--format=%H%n%an%n%s'],
    { encoding: 'utf-8' },
  )
  const [sha, author, ...msgParts] = (r.stdout ?? '').split('\n')
  return { sha: sha.trim(), author: author.trim(), message: msgParts.join(' ').trim() }
}

describe('AutoCommitWorker (7-8 W7+ 实测)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'auto-commit-'))
    initGitRepo(tmpDir)
  })

  afterEach(async () => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('start: 真 git repo, watcher 启动成功', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()
    // chokidar ready emit 是异步; 这里的 start 已经 await 了 ready
    expect(worker.getLastCommitSha()).toBe(null)
  })

  it('start: 非 git repo → no-op 不崩', async () => {
    const noGitDir = mkdtempSync(join(tmpdir(), 'no-git-'))
    try {
      const worker = new AutoCommitWorker(noGitDir, { debounceMs: 200 })
      await worker.start()  // 不应抛
      expect(worker.getLastCommitSha()).toBe(null)
    } finally {
      rmSync(noGitDir, { recursive: true, force: true })
    }
  })

  it('onChange: 写文件 + 200ms debounce → auto-commit 触发', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()

    // 写新文件 (触发 chokidar 'add')
    writeFileSync(join(tmpDir, 'new-doc.md'), '# new')

    // 等 debounce + commit
    await new Promise((r) => setTimeout(r, 500))

    const last = getLastCommit(tmpDir)
    expect(last.author).toBe(AUTO_COMMIT_AUTHOR)
    expect(last.message).toMatch(/^auto\(debounced\):/)
    expect(last.message).toMatch(/new-doc\.md/)

    await worker.stop()
  })

  it('commit: actor = auto-commit-worker (跟用户 git config 区分)', async () => {
    // 初始化时已设 user.name = original-author
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()

    writeFileSync(join(tmpDir, 'agent-foo.md'), 'test')
    await new Promise((r) => setTimeout(r, 500))

    const last = getLastCommit(tmpDir)
    expect(last.author).toBe(AUTO_COMMIT_AUTHOR)
    expect(last.author).not.toBe('original-author')

    await worker.stop()
  })

  it('commit: 恢复 user.name 到原值 (防污染)', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()

    writeFileSync(join(tmpDir, 'restore.md'), 'test')
    await new Promise((r) => setTimeout(r, 500))

    // commit 后, user.name 应该恢复 original-author
    const r = spawnSync('git', ['-C', tmpDir, 'config', '--local', '--get', 'user.name'], {
      encoding: 'utf-8',
    })
    expect((r.stdout ?? '').trim()).toBe('original-author')

    await worker.stop()
  })

  it('exclude: _log/ 写入不应触发 commit', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()

    // 模拟 post-commit hook 行为: 写 _log/ 目录
    mkdirSync(join(tmpDir, '_log'), { recursive: true })
    writeFileSync(join(tmpDir, '_log', 'actor-test.jsonl'), '{}\n')
    await new Promise((r) => setTimeout(r, 500))

    // 应该没有 auto-commit 触发 (exclude 生效)
    expect(worker.getLastCommitSha()).toBe(null)

    await worker.stop()
  })

  it('exclude: .git/ 内部写入不应触发 commit', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()

    // 模拟 git 内部 (refs, hooks) 更新
    writeFileSync(join(tmpDir, '.git', 'test-marker'), 'test')
    await new Promise((r) => setTimeout(r, 500))

    expect(worker.getLastCommitSha()).toBe(null)
    await worker.stop()
  })

  it('lastResortCommit: 抢断 pending debounce timer, 立即触发', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 5000 })  // 5s
    await worker.start()

    writeFileSync(join(tmpDir, 'pending.md'), 'pending')

    // 不等 5s, 立即 lastResortCommit
    await new Promise((r) => setTimeout(r, 200))
    const sha = await worker.lastResortCommit()
    expect(sha).not.toBe(null)

    const last = getLastCommit(tmpDir)
    expect(last.author).toBe(AUTO_COMMIT_AUTHOR)
    expect(last.message).toMatch(/^auto\(shutdown\):/)  // reason = shutdown

    await worker.stop()
  })

  it('commit msg: 含 top-N 文件名 + 总数', async () => {
    const worker = new AutoCommitWorker(tmpDir, { debounceMs: 200 })
    await worker.start()

    writeFileSync(join(tmpDir, 'a.md'), 'a')
    writeFileSync(join(tmpDir, 'b.md'), 'b')
    writeFileSync(join(tmpDir, 'c.md'), 'c')
    await new Promise((r) => setTimeout(r, 500))

    const last = getLastCommit(tmpDir)
    // 至少包含 1 个文件名 (a.md 或 b.md 或 c.md)
    expect(last.message).toMatch(/[a-c]\.md/)
    // 显示文件数
    expect(last.message).toMatch(/3 files/)

    await worker.stop()
  })

  it('默认 debounce 是 5 min (跟 Obsidian Git 一致)', () => {
    expect(AUTO_COMMIT_DEBOUNCE_MS).toBe(5 * 60 * 1000)
  })

  it('startAutoCommitWorker 工厂返回 worker 实例 (注册 listener)', async () => {
    const events: string[] = []
    const worker = startAutoCommitWorker(
      tmpDir,
      (e) => events.push(e.type),
      { debounceMs: 200 },
    )

    writeFileSync(join(tmpDir, 'factory.md'), 'test')
    await new Promise((r) => setTimeout(r, 500))

    expect(events).toContain('change-pending')
    expect(events).toContain('committed')

    await worker.stop()
  })
})
