/**
 * auditHandlers — git audit IPC (backport 2026-07-09)
 *
 * 来源: xiaoyuan-team 仓 ada72e9 (2026-07-07 23:09 实现)
 *   → backport 到 free 仓 (commit 7-9)
 *
 * 配合 templates/hooks/post-commit 设计:
 *   - post-commit 钩子写 _log/YYYY-MM-DD/*.jsonl 审计
 *   - App 启动时调这些 IPC 检查 uncommitted + 显示最近审计
 *   - 双层审计: pre-commit (拦截) + post-commit (记录) + app 启动 (通知)
 *
 * 3 个 IPC:
 *   - vault:gitStatus      → 改了什么文件 + actor + 时间
 *   - vault:gitDiff        → 完整 diff (可选, 给 "查看 diff" 按钮用)
 *   - vault:readAuditLog   → 读 _log/YYYY-MM-DD/*.jsonl 最近 N 条
 *
 * 设计原则:
 *   - 用 git CLI (spawnSync), 不引入 isomorphic-git 等大依赖
 *   - cwd = vault 路径, 全部基于 `git status` / `git diff` / `git log`
 *   - 没装 git 或不是 git repo → 返 null (UI 优雅降级, 不报错)
 *   - IPC 在 registerAuditHandlers() 函数里注册 (不在模块顶层), 便于测试
 *
 * Backport 简化 (vs team 仓):
 *   - free 仓没 `applyTeamTemplate` 自动装 hook, hook 装好靠 startup 检测

 *     (由 auditHandlers 检测 vault 的 .git/hooks/post-commit 是否存在)
 *   - hasPostCommitHook 字段保留, UI 可提示用户手动装
 */

import { ipcMain } from 'electron'
import { spawnSync } from 'child_process'
import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import log from 'electron-log/main'

/** 单个 uncommitted 文件信息 */
export interface UncommittedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  author: string | null      // 来自 git log -1 author (committed) 或 unknown (untracked)
  mtime: number              // 文件最后修改时间 (ms epoch)
  diffLines: number          // 改动行数 (modified/added 才有)
}

/** git status 完整结果 */
export interface GitStatus {
  uncommittedCount: number
  files: UncommittedFile[]
  isGitRepo: boolean          // false → UI 隐藏整个审计 tab
  hasPostCommitHook: boolean  // .git/hooks/post-commit 是否装
}

/** 单条审计记录 (来自 _log/YYYY-MM-DD/*.jsonl) */
export interface AuditEntry {
  ts: string
  actor: string
  sha: string
  files_changed: number
  files: string[]
  source: 'log'                // 来源标记 (后续可加 'os-fswatch' 等)
}

/**
 * 安全执行 git 命令, 返 { ok: boolean, output: string }
 *   - ok=true:  git exit 0 (包括输出为空, 表 "是 git repo, 没改动")
 *   - ok=false: git exit non-0 或 spawnSync 抛错 (git 不可用 / 不是 git repo)
 *
 * 区别于单返 string: 让调用方区分 "git 成功空输出" vs "git 失败"
 */
function gitExec(cwd: string, args: string[]): { ok: boolean; output: string } {
  try {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,            // 5s 超时, 防止 git 卡死阻塞 IPC
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (result.status === 0) {
      return { ok: true, output: result.stdout || '' }
    }
    return { ok: false, output: '' }
  } catch (err) {
    log.warn('[auditHandlers] git exec failed:', args[0], String(err))
    return { ok: false, output: '' }
  }
}

/**
 * vault:gitStatus 的内部实现
 */
export async function _gitStatusImpl(vaultPath: string): Promise<GitStatus> {
  // 0. 校验 vaultPath
  if (!vaultPath?.trim() || !existsSync(vaultPath)) {
    return { uncommittedCount: 0, files: [], isGitRepo: false, hasPostCommitHook: false }
  }

  // 1. 检查是否 git repo
  const gitDir = join(vaultPath, '.git')
  if (!existsSync(gitDir)) {
    return { uncommittedCount: 0, files: [], isGitRepo: false, hasPostCommitHook: false }
  }

  // 2. 检查 post-commit hook 是否装了
  const hookPath = join(gitDir, 'hooks', 'post-commit')
  const hasPostCommitHook = existsSync(hookPath)

  // 3. 跑 git status --porcelain
  //    ok=true:  是 git repo (空输出 = 没改动)
  //    ok=false: 不是 git repo / git 不可用
  const statusResult = gitExec(vaultPath, ['status', '--porcelain', '-uall'])
  if (!statusResult.ok) {
    return { uncommittedCount: 0, files: [], isGitRepo: false, hasPostCommitHook }
  }
  const statusOutput = statusResult.output

  const files: UncommittedFile[] = []
  const lines = statusOutput.split('\n').filter(Boolean)

  for (const line of lines) {
    const statusChar = line.substring(0, 2)
    const filenameRaw = line.substring(3)

    let filePath: string
    let status: UncommittedFile['status']
    if (statusChar === '??') {
      filePath = filenameRaw
      status = 'untracked'
    } else if (statusChar.includes('R')) {
      filePath = filenameRaw.split(' -> ')[1] ?? filenameRaw
      status = 'renamed'
    } else if (statusChar.includes('A')) {
      filePath = filenameRaw
      status = 'added'
    } else if (statusChar.includes('D')) {
      filePath = filenameRaw
      status = 'deleted'
    } else if (statusChar.includes('M')) {
      filePath = filenameRaw
      status = 'modified'
    } else {
      continue
    }

    // 4. 算 diffLines
    let diffLines = 0
    if (status === 'modified' || status === 'added' || status === 'renamed') {
      const numstatResult = gitExec(vaultPath, ['diff', '--numstat', '--', filePath])
      const match = numstatResult.output.match(/^(\d+)\s+(\d+)\s+/)
      if (match) {
        const add = parseInt(match[1] ?? '0', 10)
        const del = parseInt(match[2] ?? '0', 10)
        diffLines = add + del
      }
    }

    // 5. 拿 mtime
    let mtime = 0
    try {
      const fullPath = join(vaultPath, filePath)
      if (existsSync(fullPath)) {
        mtime = statSync(fullPath).mtimeMs
      }
    } catch {
      // 文件可能已删
    }

    // 6. 拿 author (untracked 拿不到)
    let author: string | null = null
    if (status !== 'untracked') {
      const authorResult = gitExec(vaultPath, ['log', '-1', '--format=%an', '--', filePath])
      author = authorResult.output.trim() || null
    }

    files.push({ path: filePath, status, author, mtime, diffLines })
  }

  return {
    uncommittedCount: files.length,
    files,
    isGitRepo: true,
    hasPostCommitHook,
  }
}

/**
 * vault:readAuditLog 的内部实现
 */
export async function _readAuditLogImpl(vaultPath: string, limit: number = 50): Promise<AuditEntry[]> {
  if (!vaultPath?.trim() || !existsSync(vaultPath)) return []

  const logDir = join(vaultPath, '_log')
  if (!existsSync(logDir)) return []

  let dateDirs: string[]
  try {
    dateDirs = readdirSync(logDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
      .map(d => d.name)
      .sort()
      .reverse()
  } catch {
    return []
  }

  const entries: AuditEntry[] = []
  for (const dateDir of dateDirs) {
    if (entries.length >= limit) break
    const datePath = join(logDir, dateDir)
    let files: string[]
    try {
      files = readdirSync(datePath)
        .filter(f => f.endsWith('.jsonl'))
        .sort()
    } catch {
      continue
    }

    for (const file of files) {
      if (entries.length >= limit) break
      const filePath = join(datePath, file)
      try {
        const content = readFileSync(filePath, 'utf-8')
        for (const line of content.split('\n').filter(Boolean)) {
          if (entries.length >= limit) break
          try {
            const obj = JSON.parse(line) as Omit<AuditEntry, 'source'>
            entries.push({ ...obj, source: 'log' })
          } catch {
            log.warn('[auditHandlers] parse failed:', filePath)
          }
        }
      } catch (err) {
        log.warn('[auditHandlers] read failed:', filePath, String(err))
      }
    }
  }

  return entries
}

/**
 * registerAuditHandlers — 入口函数 (给 main/index.ts 调)
 * 保持函数名跟其他 handlers 一致 (prHandlers / inviteHandlers 等)
 * 设计: 3 个 IPC 在这里注册 (不在模块顶层), 避免测试时模块加载时 ipcMain 还未 mock
 */
export function registerAuditHandlers(): void {
  ipcMain.handle('vault:gitStatus', async (_event, vaultPath: string): Promise<GitStatus> => {
    return _gitStatusImpl(vaultPath)
  })
  ipcMain.handle('vault:gitDiff', async (_event, vaultPath: string, filePath: string): Promise<string> => {
    if (!vaultPath?.trim() || !filePath?.trim()) return ''
    return gitExec(vaultPath, ['diff', '--', filePath]).output
  })
  ipcMain.handle('vault:readAuditLog', async (_event, vaultPath: string, limit: number = 50): Promise<AuditEntry[]> => {
    return _readAuditLogImpl(vaultPath, limit)
  })
  log.info('[auditHandlers] registered (vault:gitStatus / vault:gitDiff / vault:readAuditLog)')
}
