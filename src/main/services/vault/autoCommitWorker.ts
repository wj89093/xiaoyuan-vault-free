/**
 * autoCommitWorker.ts — vault 自动 git commit worker (backport 2026-07-09)
 *
 * 来源: xiaoyuan-team 仓 cfcf54c (2026-07-08 W7+ 实现)
 *   → backport 到 free 仓 (commit 7-9)
 *
 * 触发链路:
 *   chokidar 监听 vault 根 (递归)
 *   ↓ 检测到文件 add/change/unlink
 *   5 min debounce (默认, 可调)
 *   ↓ 5 min 内无变更
 *   git add -A → commit (actor=auto-commit-worker)
 *
 * **Backport 简化 (vs team 仓)**:
 *   - 不接 daily backup.sh (free 仓本来就没这个机制)
 *   - 不接 post-commit hook → _log/ 审计 (free 仓 AuditNotice / LogPanel audit tab 待下次)
 *   - 因此 hook 写 _log/ 那段链路在这版**没有下游消费**, 暂不安装 hook
 *     (装 hook 本身没问题, 但 hook 写完的 _log/ 没人读 = 浪费, 留待 audit UI 一起做)
 *
 * 设计:
 *   - lastResortCommit on app shutdown (防数据丢失)
 *   - 临时切 user.name → 完成后恢复 (actor 区分, 不污染其他 commit)
 *   - exclude list: .git/ _log/ _state/ .xiaoyuan/ 系统文件不入 commit
 *   - ignoreInitial: true (启动时不触发初始扫描事件, 避免空 commit)
 *
 * 已知限制 (后续可优化):
 *   - chokidar 跨平台: mac fsevents / win ReadDirectoryChangesW / linux inotify
 *   - 大文件 (eg 1GB binary 拖入) 触发频繁 change event, 但 debounce 抹平
 *   - .git/hooks/post-commit 慢 (eg 30s) 会拖慢 commit (串行同步) — 当前未装 hook, 后续装时注意
 *
 * **跟 fileWatcher.ts 共存**:
 *   fileWatcher.ts 用 Node 内置 fs.watch (短 debounce 5s, emit file:changed 给 KnowledgeGraph)
 *   autoCommitWorker 用 chokidar (长 debounce 5min, 自动 commit)
 *   两者互不干扰, 在 vault 根并存
 */
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import * as path from 'path'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
import log from 'electron-log/main'

/** Debounce 时长 (ms). 默认 5 min, 跟 Obsidian Git 默认一致 */
export const AUTO_COMMIT_DEBOUNCE_MS = 5 * 60 * 1000

/** auto-commit 的 actor (跟 vault-auto-backup 同风格, 用 _grep "auto-" 一次找出所有自动 commit) */
export const AUTO_COMMIT_AUTHOR = 'auto-commit-worker'
export const AUTO_COMMIT_AUTHOR_EMAIL = 'auto-commit@local'

/** 默认 exclude paths (正则测试) — 系统文件不入 commit */
const EXCLUDED_PATH_PATTERNS: RegExp[] = [
  /(^|[\/\\])\.git([\/\\]|$)/,
  /(^|[\/\\])\.xiaoyuan([\/\\]|$)/,
  /(^|[\/\\])_log([\/\\]|$)/,
  /(^|[\/\\])_state([\/\\]|$)/,
  /(^|[\/\\])node_modules([\/\\]|$)/,
  /\.DS_Store$/,
  /\.swp$/,
  /~$/,
]

/** commit message 里最多列几个文件名 (避免 message spam) */
const MAX_FILE_NAMES_IN_MSG = 5

export type AutoCommitReason = 'debounced' | 'shutdown' | 'manual'

export interface AutoCommitEvent {
  type: 'change-pending' | 'committed'
  vaultPath: string
  /** For 'committed': */
  sha?: string
  message?: string
  filesChanged?: number
  timestamp?: string
}

export type AutoCommitListener = (event: AutoCommitEvent) => void

export interface AutoCommitWorkerOptions {
  /** 自定义 debounce (ms). 测试时传 100 等 */
  debounceMs?: number
}

export class AutoCommitWorker {
  private watcher: FSWatcher | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private originalUserName: string | null = null
  private originalUserEmail: string | null = null
  private isCommitting = false
  private listeners: AutoCommitListener[] = []
  private lastCommitSha: string | null = null
  private debounceMs: number

  constructor(
    private readonly vaultPath: string,
    options: AutoCommitWorkerOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? AUTO_COMMIT_DEBOUNCE_MS
  }

  /** 注册 listener (chokidar 触发时 UI 可监听) */
  on(listener: AutoCommitListener): void {
    this.listeners.push(listener)
  }

  off(listener: AutoCommitListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }

  /** 拿最近一次 auto-commit SHA (UI 显示用) */
  getLastCommitSha(): string | null {
    return this.lastCommitSha
  }

  /** 启动 watcher. vault 不是 git repo → no-op + warn */
  async start(): Promise<void> {
    const gitDir = path.join(this.vaultPath, '.git')
    if (!existsSync(gitDir)) {
      log.warn('[autoCommitWorker] vault 不是 git repo, 跳过启动:', this.vaultPath)
      return
    }

    // 1. 备份原 user.name / user.email (本地 git config)
    const origName = this.gitConfigLocal('user.name')
    const origEmail = this.gitConfigLocal('user.email')
    this.originalUserName = origName.ok && origName.value ? origName.value : null
    this.originalUserEmail = origEmail.ok && origEmail.value ? origEmail.value : null
    log.info(
      `[autoCommitWorker] 备份 user.name=${this.originalUserName ?? '(未设)'} for ${this.vaultPath}`,
    )

    // 2. 启 chokidar watcher (自己 debounce, 不用 awaitWriteFinish 避免 1s+5min 双重延迟)
    this.watcher = chokidar.watch(this.vaultPath, {
      ignored: (path: string) => EXCLUDED_PATH_PATTERNS.some((re) => re.test(path)),
      ignoreInitial: true,
      persistent: true,
      ignorePermissionErrors: true,
    })
    this.watcher.on('add', () => this.onChange())
    this.watcher.on('change', () => this.onChange())
    this.watcher.on('unlink', () => this.onChange())

    // 等 ready
    await new Promise<void>((resolve) => {
      if (!this.watcher) return resolve()
      this.watcher.once('ready', () => resolve())
    })
    log.info('[autoCommitWorker] watcher ready, debounce =', this.debounceMs, 'ms')
  }

  /** chokidar 触发时调用. 启 debounce timer */
  private onChange(): void {
    this.emit({ type: 'change-pending', vaultPath: this.vaultPath })
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.commit('debounced').catch((err) => {
        log.error('[autoCommitWorker] commit failed:', err)
      })
    }, this.debounceMs)
  }

  /**
   * 执行 auto-commit. 临时设 user.name → 完成后恢复
   * @returns SHA 或 null (无改动 / 失败)
   */
  async commit(reason: AutoCommitReason): Promise<string | null> {
    if (this.isCommitting) {
      log.warn('[autoCommitWorker] commit already in progress, skip')
      return null
    }
    this.isCommitting = true
    try {
      // 1. 检查 uncommitted changes
      const fileLines = this.gitStatusPorcelain()
      if (fileLines.length === 0) return null

      // 2. 临时切 actor
      this.gitConfigLocalSet('user.name', AUTO_COMMIT_AUTHOR)
      this.gitConfigLocalSet('user.email', AUTO_COMMIT_AUTHOR_EMAIL)

      try {
        // 3. add -A
        const addR = this.gitCmd(['add', '-A'])
        if (!addR.ok) {
          log.warn('[autoCommitWorker] git add failed:', addR.stderr)
          return null
        }

        // 4. 构造 commit message
        const fileNames = fileLines
          .map((line) => line.replace(/^[ MADRCU?!]{2} /, '').trim())
          .filter(Boolean)
        const fileCount = fileNames.length
        const topFiles = fileNames.slice(0, MAX_FILE_NAMES_IN_MSG)
        const fileSummary =
          fileCount === 1
            ? '1 file'
            : `${fileCount} files`
        const namesPreview =
          fileCount === 0
            ? ''
            : `: [${topFiles.join(', ')}${fileCount > MAX_FILE_NAMES_IN_MSG ? ', ...' : ''}]`
        const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
        const message = `auto(${reason}): ${ts} - ${fileSummary}${namesPreview}`

        // 5. commit
        const commitR = this.gitCmd(['commit', '-m', message])
        if (!commitR.ok) {
          // 常见原因: nothing to commit (race condition)
          if (commitR.stderr.includes('nothing to commit')) {
            log.info('[autoCommitWorker] nothing to commit (race)')
            return null
          }
          log.warn('[autoCommitWorker] commit failed:', commitR.stderr)
          return null
        }

        // 6. 拿 SHA
        const shaR = this.gitCmdOutput(['rev-parse', '--short', 'HEAD'])
        if (!shaR.ok) {
          log.warn('[autoCommitWorker] rev-parse failed:', shaR.stderr)
          return null
        }
        const sha = shaR.output.trim()
        this.lastCommitSha = sha

        log.info(
          `[autoCommitWorker] ✓ auto-commit ${sha}: ${fileSummary}${namesPreview} (actor=${AUTO_COMMIT_AUTHOR})`,
        )
        this.emit({
          type: 'committed',
          vaultPath: this.vaultPath,
          sha,
          message,
          filesChanged: fileCount,
          timestamp: ts,
        })
        return sha
      } finally {
        // 7. 恢复原 actor
        this.restoreOriginalAuthor()
      }
    } finally {
      this.isCommitting = false
    }
  }

  /**
   * App 退出 / 切换 vault 前的兜底 commit.
   * B 方案要求: 防数据丢失 (用户改完 → quit 前被 worker debounce 挡住的)
   */
  async lastResortCommit(): Promise<string | null> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
      log.info('[autoCommitWorker] lastResortCommit 抢断 pending debounce timer')
    }
    return this.commit('shutdown')
  }

  /** 关闭 watcher + lastResortCommit. app before-quit 调用 */
  async stop(): Promise<void> {
    try {
      await this.lastResortCommit()
    } finally {
      if (this.watcher) {
        await this.watcher.close()
        this.watcher = null
      }
      log.info('[autoCommitWorker] stopped for', this.vaultPath)
    }
  }

  /** 恢复原 user.name / user.email */
  private restoreOriginalAuthor(): void {
    if (this.originalUserName !== null) {
      this.gitConfigLocalSet('user.name', this.originalUserName)
    } else {
      // 没备份 = 原本就没设, 删 auto-commit-worker 设置
      this.gitConfigLocalUnset('user.name')
    }
    if (this.originalUserEmail !== null) {
      this.gitConfigLocalSet('user.email', this.originalUserEmail)
    } else {
      this.gitConfigLocalUnset('user.email')
    }
  }

  private emit(e: AutoCommitEvent): void {
    for (const l of this.listeners) {
      try {
        l(e)
      } catch (err) {
        log.warn('[autoCommitWorker] listener error:', err)
      }
    }
  }

  // === git helpers (spawnSync, 不引入 isomorphic-git) ===

  private gitCmd(args: string[]): { ok: boolean; stdout: string; stderr: string } {
    const r = spawnSync('git', ['-C', this.vaultPath, ...args], { encoding: 'utf-8' })
    return {
      ok: r.status === 0,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    }
  }

  private gitCmdOutput(args: string[]): { ok: boolean; output: string; stderr: string } {
    const r = spawnSync('git', ['-C', this.vaultPath, ...args], { encoding: 'utf-8' })
    return {
      ok: r.status === 0,
      output: r.stdout ?? '',
      stderr: r.stderr ?? '',
    }
  }

  private gitConfigLocal(key: string): { ok: boolean; value: string } {
    const r = spawnSync(
      'git',
      ['-C', this.vaultPath, 'config', '--local', '--get', key],
      { encoding: 'utf-8' },
    )
    return {
      ok: r.status === 0,
      value: (r.stdout ?? '').trim(),
    }
  }

  private gitConfigLocalSet(key: string, value: string): { ok: boolean } {
    const r = spawnSync(
      'git',
      ['-C', this.vaultPath, 'config', '--local', key, value],
      { encoding: 'utf-8' },
    )
    return { ok: r.status === 0 }
  }

  private gitConfigLocalUnset(key: string): { ok: boolean } {
    const r = spawnSync(
      'git',
      ['-C', this.vaultPath, 'config', '--local', '--unset', key],
      { encoding: 'utf-8' },
    )
    // exit 5 = key not found (already unset, OK)
    return { ok: r.status === 0 || r.status === 5 }
  }

  private gitStatusPorcelain(): string[] {
    const r = spawnSync(
      'git',
      ['-C', this.vaultPath, 'status', '--porcelain'],
      { encoding: 'utf-8' },
    )
    if (r.status !== 0) return []
    return (r.stdout ?? '').split('\n').filter((line) => line.trim())
  }
}

/**
 * 工厂: 启 worker + 注册 listener
 * @param onCommit UI 监听: auto-commit 触发后 push notification / Toast
 */
export function startAutoCommitWorker(
  vaultPath: string,
  onEvent?: AutoCommitListener,
  options: AutoCommitWorkerOptions = {},
): AutoCommitWorker {
  const worker = new AutoCommitWorker(vaultPath, options)
  if (onEvent) worker.on(onEvent)
  void worker.start().catch((err) => {
    log.error('[autoCommitWorker] start failed:', err)
  })
  return worker
}
