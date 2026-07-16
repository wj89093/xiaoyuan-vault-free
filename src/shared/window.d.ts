/**
 * window.d.ts — mirrors preload/index.ts API surface
 *
 * 维护规则: preload/index.ts 加方法 → 同步加到这里 (namespace 结构跟 preload `const api` 完全一致)
 *
 * 2026-07-16 (Free 仓 P0 backport — team 49c6b8e):
 *   - 删旧的 flat+namespace 混合声明, 改为纯 namespace (对齐 preload 实际 expose)
 *   - 加缺失的 6 个 namespace: url / converter / query / clipboard / import / skill
 *   - 加 free 特有的 maintenance.saveConversation / getTopicSummaries / briefing 系列
 *   - 保留 flat aliases 类型 (向后兼容, Phase 2 改 renderer 后删)
 *   - 加全局变量 __vaultPath / __cmView / toast
 */
import type { ImportFileResult } from './chat'

// ─── Shared types ────────────────────────────────────────────────────

export interface FileInfo {
  path: string
  name: string
  isDirectory: boolean
  modified: number
  children?: FileInfo[]
  title?: string
  tags?: string
}

export interface URLFetchResult {
  title: string
  content: string
  author?: string
  date?: string
  url: string
  source: string
}

// ─── window.api — namespace 结构, 跟 preload/index.ts `const api` 对齐 ──

export interface XyVaultAPI {
  // ── vault ──
  vault: {
    open(): Promise<string | null>
    create(): Promise<string | null>
    openFile(filePath: string): Promise<{ ok: boolean; path?: string }>
    getLast(): Promise<string | null>
    getLastVault(): Promise<string | null>
    clearLast(): Promise<boolean>
    getLastFile(vaultPath: string): Promise<string | null>
    setLastFile(vaultPath: string, filePath: string): Promise<boolean>
    refresh(): Promise<{ ok: boolean }>
    list(): Promise<Array<{ path: string; name: string; lastOpened: number }>>
    openPath(path: string): Promise<string | null>
    selectDirectory(): Promise<string | null>
    createAt(path: string): Promise<string | null>
    remove(path: string): Promise<boolean>
    path(): Promise<string | null>
    gitStatus(vaultPath: string): Promise<{
      uncommittedCount: number
      files: Array<{
        path: string
        status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
        author: string | null
        mtime: number
        diffLines: number
      }>
      isGitRepo: boolean
      hasPostCommitHook: boolean
    }>
    gitDiff(vaultPath: string, filePath: string): Promise<string>
    readAuditLog(
      vaultPath: string,
      limit?: number
    ): Promise<
      Array<{
        ts: string
        actor: string
        sha: string
        files_changed: number
        files: string[]
        source: string
      }>
    >
  }

  // ── file ──
  file: {
    list(vaultPath?: string): Promise<unknown[]>
    search(query: string): Promise<unknown[]>
    read(path: string): Promise<string>
    render(path: string): Promise<{ type: string; [key: string]: unknown }>
    save(path: string, content: string): Promise<boolean>
    exists(path: string): Promise<boolean>
    walkDir(path: string): Promise<unknown>
    rename(oldPath: string, newName: string): Promise<boolean>
    delete(vaultPath: string, filePath: string): Promise<boolean>
    move(filePath: string, newParentDir: string): Promise<boolean>
    revealInFinder(filePath: string): Promise<void>
    openExternal(filePath: string): Promise<{ ok: boolean; error?: string }>
    trashList(vaultPath: string): Promise<unknown[]>
    trashRestore(vaultPath: string, originalPath: string): Promise<boolean>
    trashDelete(vaultPath: string, originalPath: string): Promise<boolean>
    trashClean(vaultPath: string): Promise<number>
    import(vaultPath: string, filePaths: string[]): Promise<ImportFileResult[]>
    listRaw(vaultPath: string): Promise<unknown[]>
    convertRaw(rawPath: string, vaultPath: string): Promise<unknown>
    listSchemas(vaultPath: string): Promise<unknown[]>
    listBackups(filePath: string): Promise<unknown[]>
    previewBackup(filePath: string, timestamp: string): Promise<string>
    restoreBackup(filePath: string, timestamp: string): Promise<boolean>
    createFolder(folderPath: string): Promise<boolean>
    deleteFolder(folderPath: string): Promise<boolean>
    writeFsCache?(vaultPath: string, files: unknown[]): Promise<boolean>
    getPreview?(filePath: string, maxChars?: number): Promise<{
      success: boolean
      preview: string
      error?: string
    }>
    listDir?(path: string): Promise<Array<{ name: string; isDirectory: boolean }> | null>
  }

  // ── schema ──
  schema: {
    list(): Promise<unknown[]>
    getPending(): Promise<unknown[]>
  }

  // ── lint ──
  lint: {
    getReports(): Promise<unknown[]>
    fixIssue(issue: {
      type: string
      pagePath?: string
      deadTarget?: string
      orphanTarget?: string
    }): Promise<boolean>
    run(): Promise<unknown>
  }

  // ── url (Free 仓特有: URL 导入 + fetch) ──
  url: {
    fetch(url: string): Promise<unknown>
    save(url: string, vaultPath: string): Promise<string>
    fetchUrl(url: string): Promise<{ title: string; content: string }>
    saveUrl(vaultPath: string, title: string, content: string): Promise<string>
  }

  // ── converter (Free 仓特有: 文件格式转换) ──
  converter: {
    convert(filePath: string): Promise<unknown>
    supported(): Promise<string[]>
    transcribe(filePath: string): Promise<unknown>
  }

  // ── query (Free 仓特有: 主题解析 + AI 问答) ──
  query: {
    resolve(content: string, title?: string): Promise<unknown>
    vault(question: string, vaultPath?: string): Promise<unknown>
  }

  // ── auth ──
  auth: {
    getToken(): Promise<string | null>
    getEmail(): Promise<string | null>
    clear(): Promise<boolean>
    openLogin(): Promise<string>
    debugLogin(email: string, code: string): Promise<string>
    onTokenReceived(cb: (data: { token: string; email: string }) => void): () => void
  }

  // ── settings ──
  settings: {
    get(): Promise<{ theme: 'light' | 'dark' | 'system' }>
    getTheme(): Promise<'light' | 'dark' | 'system'>
    setTheme(theme: 'light' | 'dark' | 'system'): Promise<string>
  }

  // ── graph ──
  graph: {
    load(): Promise<unknown>
    rebuild(): Promise<{ nodes: number; edges: number }>
    rebuildIncremental(changedFiles: string[]): Promise<{ nodes: number; edges: number }>
    queryTopics(
      name?: string,
      options?: { maxNeighbors?: number; maxResults?: number }
    ): Promise<{ query: string; nodes: unknown[]; edges: unknown[] }>
    onFileChange(
      cb: (data: { path: string; type: 'modified' | 'created' | 'deleted' }[]) => void
    ): () => void
  }

  // ── maintenance ──
  maintenance: {
    run(): Promise<unknown>
    getTasks(): Promise<unknown[]>
    updateTasks(tasks: unknown[]): Promise<boolean>
    generateBriefing(): Promise<{
      date: string
      period: string
      newPages: number
      updatedPages: number
      entities: string[]
      highlights: string[]
      health: string
      raw: string
    }>
    saveConversation(params: {
      title: string
      topic: string
      decisions: string[]
      relatedFiles: string[]
      nextSteps: string[]
      discussion?: string
    }): Promise<{ path: string; ok: boolean; error?: string }>
    getConversations(
      date: string,
      options?: { topic?: string; maxResults?: number }
    ): Promise<unknown[]>
    getTopicSummaries(topic: string): Promise<unknown>
  }

  // ── clipboard (Free 仓特有: 剪贴板监听) ──
  clipboard: {
    start(vaultPath: string): Promise<boolean>
    stop(): Promise<boolean>
    setVaultPath(vaultPath: string): Promise<boolean>
  }

  // ── shortcuts ──
  shortcuts: {
    onImportCompleted(cb: (filePaths?: string[]) => void): () => void
    onQuickSwitch(cb: () => void): () => void
    onGotoImport(cb: () => void): () => void
  }

  // ── import (Free 仓特有: 导入窗口) ──
  import: {
    openWindow(): Promise<boolean>
    autoTrigger(filePaths: string[]): Promise<boolean>
  }

  // ── skill (Free 仓特有: Skill.md 用户 CRUD) ──
  skill: {
    list(): Promise<Array<{ name: string; path: string }>>
    loadDefault(skills?: string[]): Promise<string>
    read(name: string): Promise<string>
    save(name: string, content: string): Promise<boolean>
    delete(name: string): Promise<boolean>
  }

  // ── build (Free 仓特有: 构建信息) ──
  build: {
    getInfo(): Promise<{
      isPro: boolean
      isOpenSource: boolean
      buildTarget: string
    }>
  }

  // ── Legacy flat aliases (Phase 2 改完 renderer 后删除) ──
  listFiles(): Promise<FileInfo[]>
  searchFiles(query: string): Promise<FileInfo[]>
  readFile(filePath: string): Promise<string>
  renderFile(filePath: string): Promise<{ type: string; [key: string]: unknown }>
  saveFile(filePath: string, content: string): Promise<boolean>
  moveFile(filePath: string, newParentDir: string): Promise<boolean>
  deleteFile(filePath: string, vaultPath?: string): Promise<boolean>
  renameFile(oldPath: string, newName: string): Promise<boolean>
  deleteFolder(folderPath: string): Promise<boolean>
  trashList(vaultPath: string): Promise<unknown[]>
  trashRestore(vaultPath: string, originalPath: string): Promise<boolean>
  trashDelete(vaultPath: string, originalPath: string): Promise<boolean>
  openImportWindow(): Promise<boolean>
  listSchemas(vaultPath: string): Promise<unknown[]>
  fileExists(filePath: string): Promise<boolean>
  getLastVault(): Promise<string | null>
  generateBriefing(): Promise<unknown>
  getConversations(
    date: string,
    options?: { topic?: string; maxResults?: number }
  ): Promise<unknown[]>
  getTopicSummaries(topic: string): Promise<unknown>
  graphLoad(): Promise<unknown>
  graphRebuild(): Promise<{ nodes: number; edges: number }>
  graphOnFileChange(
    cb: (data: { path: string; type: 'modified' | 'created' | 'deleted' }[]) => void
  ): () => void
  authGetToken(): Promise<string | null>
  authGetEmail(): Promise<string | null>
  authClear(): Promise<boolean>
  authOpenLogin(): Promise<string>
  authDebugLogin(email: string, code: string): Promise<string>
  selectDirectory(): Promise<string | null>
  vaultRefresh(): Promise<{ ok: boolean }>
  vaultOpenPath(path: string): Promise<string | null>
  getBuildInfo(): Promise<{ isPro: boolean; isOpenSource: boolean; buildTarget: string }>
  settingsGetTheme(): Promise<'light' | 'dark' | 'system'>
  settingsSetTheme(theme: 'light' | 'dark' | 'system'): Promise<string>
  onImportCompleted(cb: (filePaths?: string[]) => void): () => void
  onQuickSwitch(cb: () => void): () => void
  onGotoImport(cb: () => void): () => void
  getVaultPath(): Promise<string | null>
  skillList(): Promise<Array<{ name: string; path: string }>>
  skillLoadDefault(skills?: string[]): Promise<string>
  skillRead(name: string): Promise<string>
  skillSave(name: string, content: string): Promise<boolean>
  skillDelete(name: string): Promise<boolean>

  // ── Free 仓特有但 namespace 未覆盖的 (遗留 flat) ──
  fetchUrl(url: string): Promise<{ title: string; content: string }>
  saveUrlContent(vaultPath: string, title: string, content: string): Promise<string>
  openVault(): Promise<string | null>
  createVault(): Promise<string | null>
  createVaultWithAI(name: string, basePath: string): Promise<string | null>
  clearLastVault(): Promise<boolean>
  vaultList(): Promise<Array<{ path: string; name: string; lastOpened: number }>>
  vaultRemove(path: string): Promise<boolean>
  importFiles(vaultPath: string, filePaths: string[]): Promise<ImportFileResult[]>
  fetchURL(url: string): Promise<URLFetchResult>
  saveURLToVault(url: string, vaultPath: string): Promise<string>
  createFile(filePath: string, title: string, type?: string): Promise<boolean>
  createFolder(folderPath: string): Promise<boolean>
  runMaintenance(): Promise<unknown>
  getSupportedFormats(): Promise<string[]>
  transcribeAudio(filePath: string): Promise<{ success: boolean; text?: string; error?: string }>
  clipboardStart(vaultPath: string): Promise<boolean>
  clipboardStop(): Promise<boolean>
  clipboardSetVaultPath(vaultPath: string): Promise<boolean>
  onAuthTokenReceived(cb: (data: { token: string; email: string }) => void): () => void
  folderMapLoad(): Promise<Record<string, string>>
  folderMapSave(map: Record<string, string>): Promise<boolean>
  graphRebuildIncremental(changedFiles: string[]): Promise<{ nodes: number; edges: number }>
  writeFile?(filePath: string, content: string): Promise<void>
  bubbleExpand?: (...args: unknown[]) => unknown
  openInDefaultApp?: (filePath: string) => Promise<void>
  getPathForFile?: (file: File) => string
  getLastFile(vaultPath: string): Promise<string | null>
  setLastFile(vaultPath: string, filePath: string): Promise<boolean>

  // ── Legacy autoAI (lint 前身) flat ──
  autoAIListSchemas(): Promise<unknown[]>
  autoAIGetPendingSchemas(): Promise<unknown[]>
  autoAIGetLintReports(): Promise<unknown[]>
  autoAIFixLintIssue(issue: {
    type: string
    pagePath?: string
    deadTarget?: string
    orphanTarget?: string
  }): Promise<boolean>
  autoAIRunLint(): Promise<unknown>
  getLintReports(): Promise<unknown[]>
}

// ── 全局非-preload 变量 (运行时注入, 不走 contextBridge) ──────────────

declare global {
  interface Window {
    api: XyVaultAPI
    /** 运行时注入: 当前 vault 路径 */
    __vaultPath?: string | null
    /** CodeMirror EditorView 实例 (Editor.tsx 注入) */
    __cmView?: unknown
    /** Toast 通知 (renderer 内部注入, 非 preload) */
    toast?: { error(msg: string): void; success(msg: string): void; info(msg: string): void }
  }
}

export {}