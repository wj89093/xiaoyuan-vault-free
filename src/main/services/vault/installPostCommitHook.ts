/**
 * installPostCommitHook.ts — 启动自动装 post-commit hook (W7+ free 仓版)
 *
 * 来源: xiaoyuan-team 仓 90c267d (2026-07-08 09:27 feat(template): applyTeamTemplate 自动安装 git hooks)
 *   → free 仓独立实现 (无 applyTeamTemplate)
 *
 * 触发链路:
 *   vault 创建 (createVaultAtPath) 或 App 启动 (vault:getLast) 末尾
 *   ↓ 调 installPostCommitHookIfMissing(vaultPath)
 *   ↓ 检测 vault 是否 git repo (有 .git/)
 *   ↓ 检测 .git/hooks/post-commit 是否存在
 *   ↓ copyFile(app 包内 template) + chmod 0o755
 *   ↓ 用户 commit 时自动写 _log/YYYY-MM-DD/{actor}-{ts}.jsonl
 *
 * 跟 team 仓差异 (设计同源):
 *   - team 仓 source: vault/hooks/<hook> (vault 内部, 由 applyTeamTemplate 拷入)
 *   - free 仓 source: src/main/templates/hooks/post-commit (app 包内, build 复制到 out/templates/hooks/)
 *   - 调用点: vaultHandlers.ts createVaultAtPath + vault:getLast 末尾
 *
 * 设计原则 (跟 team 仓 installGitHooks 一致):
 *   - 跳过条件:
 *     1. vault 不是 git repo (.git/ 不存在) → log.info, skip
 *     2. .git/hooks/post-commit 已存在 → log.info, 不覆盖用户自定义
 *     3. app 包内 template 缺失 → log.warn, skip (应该不会发生)
 *   - chmod 0o755 (git hook 必须 executable)
 *   - 任何 fs 错误 log.warn, 不 throw (不影响 vault 创建 / App 启动主流程)
 *
 * 已知限制 (跟 team 仓一致):
 *   - 老 vault (.git/hooks/ 只有 .sample) 第一次 App 启动会自动装
 *   - 已有 hook 的 vault (用户自定义) 不会被覆盖
 *   - 没 git init 的 vault 跳过 (用户后续 git init 后下次启动会装)
 */
import { copyFile, stat, mkdir, chmod, access } from 'fs/promises'
import { join } from 'path'
import log from 'electron-log/main'

/** app 包内 hook template 路径
 *  electron-vite dev + build 都把 main 代码打包到 out/main/index.js 一个文件
 *  所以 __dirname = out/main/, ../templates/hooks/post-commit = out/templates/hooks/post-commit ✓
 *
 *  vitest 跑源码时 __dirname = src/main/services/vault/, 需要显式传模板路径
 *  (installPostCommitHookIfMissing 第 2 参数 templatePath)
 *
 *  跟 src/main/ipc/vaultHandlers.ts 用 ../templates/ 一致 (那个函数 test 不存在, 不会踩坑)
 */
const DEFAULT_TEMPLATE_HOOK_PATH = join(__dirname, '..', 'templates', 'hooks', 'post-commit')

/** 安装结果 (用于测试 / 未来 UI 反馈) */
export type InstallReason =
  | 'installed'           // 成功装
  | 'not-git-repo'        // .git/ 不存在
  | 'already-installed'   // .git/hooks/post-commit 已存在
  | 'template-missing'    // app 包内 template 缺失
  | 'error'               // fs 错误 (mkdir/copy/chmod 失败)

export interface InstallResult {
  installed: boolean
  reason: InstallReason
  hookPath?: string
}

/**
 * 检测 vault 是否是 git repo, 不存在 .git/hooks/post-commit 就装一个
 * 跳过条件见模块顶部注释
 *
 * @param vaultPath vault 根路径
 * @returns InstallResult (installed 标志 + reason)
 */
export async function installPostCommitHookIfMissing(
  vaultPath: string,
  /** 测试时可选覆盖 template 路径 (vitest 跑源码时 __dirname 不是 out/main/) */
  templatePath: string = DEFAULT_TEMPLATE_HOOK_PATH,
): Promise<InstallResult> {
  if (!vaultPath || typeof vaultPath !== 'string') {
    log.warn('[installHook] vaultPath 无效:', vaultPath)
    return { installed: false, reason: 'error' }
  }

  const gitDir = join(vaultPath, '.git')
  const gitHooksDir = join(gitDir, 'hooks')
  const dst = join(gitHooksDir, 'post-commit')

  // 1. vault 不是 git repo (.git/ 不存在或不是目录) → 跳过
  try {
    const s = await stat(gitDir)
    if (!s.isDirectory()) {
      log.info('[installHook] .git 不是目录, 跳过 hook 安装:', vaultPath)
      return { installed: false, reason: 'not-git-repo' }
    }
  } catch {
    log.info('[installHook] vault 不是 git repo, 跳过 hook 安装:', vaultPath)
    return { installed: false, reason: 'not-git-repo' }
  }

  // 2. .git/hooks/post-commit 已存在 → 不覆盖 (用户自定义优先)
  try {
    await access(dst)
    log.info('[installHook] .git/hooks/post-commit 已存在, 跳过 (不覆盖):', vaultPath)
    return { installed: false, reason: 'already-installed' }
  } catch {
    // 不存在, 继续装
  }

  // 3. app 包内 template 缺失 (防御, build 流程应该保证)
  try {
    await access(templatePath)
  } catch {
    log.warn('[installHook] app 包内 template 缺失:', templatePath)
    return { installed: false, reason: 'template-missing' }
  }

  // 4. mkdir + copyFile + chmod 0o755
  try {
    await mkdir(gitHooksDir, { recursive: true })
    await copyFile(templatePath, dst)
    await chmod(dst, 0o755)
    log.info('[installHook] ✓ 已装 .git/hooks/post-commit:', vaultPath)
    return { installed: true, reason: 'installed', hookPath: dst }
  } catch (err) {
    log.warn('[installHook] 装失败 (跳过, 不影响主流程):', err)
    return { installed: false, reason: 'error' }
  }
}
