/**
 * installPostCommitHook.test.ts — 端到端测试 (跟 team 仓 90c267d 同款风格)
 *
 * 验证 5 个关键行为:
 *   1. vault 不是 git repo → not-git-repo, 不报错
 *   2. vault 是 git repo, .git/hooks/post-commit 不存在 → installed=true
 *   3. vault 是 git repo, .git/hooks/post-commit 已存在 → already-installed (不覆盖)
 *   4. 装完验证 chmod 0o755 (git hook 必须 executable)
 *   5. 装的 hook 内容跟 template 一致 (copyFile 验证)
 *
 * 测试用真 git (mkdtempSync + git init), 不 mock git 二进制
 * TEMPLATE_HOOK_PATH 用 __dirname/../../templates/hooks/post-commit (dev: src/main/, build: out/)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawnSync } from 'child_process'

// mock electron-log 避免 vitest 控制台噪声
vi.mock('electron-log/main', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}))

import { installPostCommitHookIfMissing } from './installPostCommitHook'

function initGitRepo(dir: string): void {
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  spawnSync('git', ['config', '--local', 'user.email', 'test@test.local'], {
    cwd: dir,
    stdio: 'ignore',
  })
  spawnSync('git', ['config', '--local', 'user.name', 'test'], { cwd: dir, stdio: 'ignore' })
}

describe('installPostCommitHookIfMissing (W7+ free 仓版)', () => {
  let tmpVault: string

  beforeEach(() => {
    tmpVault = mkdtempSync(join(tmpdir(), 'install-hook-test-'))
  })

  afterEach(() => {
    if (existsSync(tmpVault)) rmSync(tmpVault, { recursive: true, force: true })
  })

  it('vault 不是 git repo → not-git-repo, 不报错', async () => {
    // tmpVault 是 mkdtempSync 出来的, 没 .git/
    const result = await installPostCommitHookIfMissing(
      tmpVault,
      // 测试用源码路径 (vitest 跑 ts 源码, __dirname = src/main/services/vault/)
      join(__dirname, '..', '..', 'templates', 'hooks', 'post-commit'),
    )
    expect(result.installed).toBe(false)
    expect(result.reason).toBe('not-git-repo')
    // 确保没误建 .git/hooks/post-commit
    expect(existsSync(join(tmpVault, '.git/hooks/post-commit'))).toBe(false)
  })

  it('vault 是 git repo, hook 不存在 → installed=true', async () => {
    initGitRepo(tmpVault)
    const result = await installPostCommitHookIfMissing(
      tmpVault,
      // 测试用源码路径 (vitest 跑 ts 源码, __dirname = src/main/services/vault/)
      join(__dirname, '..', '..', 'templates', 'hooks', 'post-commit'),
    )
    expect(result.installed).toBe(true)
    expect(result.reason).toBe('installed')
    expect(result.hookPath).toBe(join(tmpVault, '.git/hooks/post-commit'))
    expect(existsSync(join(tmpVault, '.git/hooks/post-commit'))).toBe(true)
  })

  it('vault 是 git repo, hook 已存在 → already-installed (不覆盖)', async () => {
    initGitRepo(tmpVault)
    // 手动写一个 "用户自定义" hook
    const hookPath = join(tmpVault, '.git/hooks/post-commit')
    writeFileSync(hookPath, '#!/bin/bash\necho "user-custom-hook"\n', 'utf-8')
    spawnSync('chmod', ['755', hookPath])

    const result = await installPostCommitHookIfMissing(
      tmpVault,
      // 测试用源码路径 (vitest 跑 ts 源码, __dirname = src/main/services/vault/)
      join(__dirname, '..', '..', 'templates', 'hooks', 'post-commit'),
    )
    expect(result.installed).toBe(false)
    expect(result.reason).toBe('already-installed')
    // 内容应保持用户版本, 不被 template 覆盖
    const content = readFileSync(hookPath, 'utf-8')
    expect(content).toContain('user-custom-hook')
    expect(content).not.toContain('vault git 提交后审计钩子') // template 头部注释
  })

  it('装完的 hook chmod 0o755 (git 必须 executable)', async () => {
    initGitRepo(tmpVault)
    const result = await installPostCommitHookIfMissing(
      tmpVault,
      // 测试用源码路径 (vitest 跑 ts 源码, __dirname = src/main/services/vault/)
      join(__dirname, '..', '..', 'templates', 'hooks', 'post-commit'),
    )
    expect(result.installed).toBe(true)

    const hookPath = join(tmpVault, '.git/hooks/post-commit')
    const stat = statSync(hookPath)
    // 0o755 = 493 (S_IXUSR | S_IXGRP | S_IXOTH)
    // mode & 0o111 应该非 0 (可执行位)
    expect(stat.mode & 0o111).not.toBe(0)
  })

  it('装的 hook 内容跟 app 包内 template 一致', async () => {
    initGitRepo(tmpVault)
    const result = await installPostCommitHookIfMissing(
      tmpVault,
      // 测试用源码路径 (vitest 跑 ts 源码, __dirname = src/main/services/vault/)
      join(__dirname, '..', '..', 'templates', 'hooks', 'post-commit'),
    )
    expect(result.installed).toBe(true)

    const installedContent = readFileSync(
      join(tmpVault, '.git/hooks/post-commit'),
      'utf-8',
    )
    // template 路径跟 source 一致 (验证 build 后路径)
    const templatePath = join(__dirname, '..', '..', 'templates', 'hooks', 'post-commit')
    expect(existsSync(templatePath)).toBe(true)
    const templateContent = readFileSync(templatePath, 'utf-8')
    expect(installedContent).toBe(templateContent)
  })
})
