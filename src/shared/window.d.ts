import type { ImportFileResult } from './chat'
// Type declarations for window.api (mirrors preload/index.ts API surface)
// This eliminates no-unsafe-* errors when calling window.api methods

export interface FileInfo {
  path: string
  name: string
  isDirectory: boolean
  modified: number
  children?: FileInfo[]
  title?: string
  tags?: string
}

// 2026-07-07 (Free 仓清理): 删 ChatMessage / ChatSession / AskResult / AskStreamChunk 4 个 chat 类型
//   - chat 是 Pro 专属功能, Free 仓不实现 (见 src/main/buildFeatures.ts)
//   - 配合删 preload/index.ts 的 chat namespace + shared/chat.ts 的 chat 类型

export interface URLFetchResult {
  title: string
  content: string
  author?: string
  date?: string
  url: string
  source: string
}

export interface ConvertResult {
  success: boolean
  markdown?: string
  error?: string
}

export interface TranscribeResult {
  success: boolean
  text?: string
  error?: string
}

export interface BubbleSaveResult {
  ok: boolean
  error?: string
}

export interface GraphLoadResult {
  nodes: number
  edges: number
  // Add more fields as needed
}

export interface AuthTokenReceived {
  token: string
  email: string
}

export interface StreamChunkData {
  chunk: string
  partial: string
}

export interface StreamErrorData {
  error: string
}

export interface AutoAISettings {
  enabled: boolean
  interval: number
  onClassify: boolean
  onTags: boolean
  onSummary: boolean
  provider?: string
}

export interface EnrichResult {
  // Define based on actual enrich result shape
  [key: string]: unknown
}

export interface QueryResult {
  // Define based on actual query result shape
  [key: string]: unknown
}

// The full window.api type
export interface XyVaultAPI {
  // Lifecycle
  onImportCompleted(callback: () => void): () => void
  onQuickSwitch(callback: () => void): () => void
  onGotoImport(callback: () => void): () => void

  // URL operations
  fetchURL(url: string): Promise<URLFetchResult>
  saveURLToVault(url: string, vaultPath: string): Promise<string>

  // Vault operations
  openVault(): Promise<string | null>
  createVault(): Promise<string | null>
  createVaultWithAI(name: string, basePath: string): Promise<string | null>
  getLastVault(): Promise<string | null>
  clearLastVault(): Promise<boolean>
  vaultRefresh(): Promise<{ ok: boolean }>
  vaultList(): Promise<Array<{ path: string; name: string; lastOpened: number }>>
  vaultOpenPath(path: string): Promise<string | null>
  vaultRemove(path: string): Promise<boolean>
  importFiles(vaultPath: string, filePaths: string[]): Promise<ImportFileResult[]>
  fetchUrl(url: string): Promise<{ title: string; content: string }>
  // Lint (migrated from autoAI)
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
  // convertFile
  getSupportedFormats(): Promise<string[]>
  transcribeAudio(filePath: string): Promise<TranscribeResult>
  saveUrlContent(vaultPath: string, title: string, content: string): Promise<string>

  // File operations
  listFiles(): Promise<FileInfo[]>
  searchFiles(query: string): Promise<FileInfo[]>
  readFile(filePath: string): Promise<string>
  renderFile(filePath: string): Promise<{ type: string; [key: string]: unknown }>
  createFile(filePath: string, title: string, type?: string): Promise<boolean>
  saveFile(filePath: string, content: string): Promise<boolean>
  createFolder(folderPath: string): Promise<boolean>
  renameFile(oldPath: string, newName: string): Promise<boolean>
  deleteFile(filePath: string): Promise<boolean>
  trashList(
    vaultPath: string
  ): Promise<Array<{ originalPath: string; trashPath: string; deletedAt: number; name: string }>>
  trashRestore(vaultPath: string, originalPath: string): Promise<boolean>
  trashDelete(vaultPath: string, originalPath: string): Promise<boolean>
  trashClean(vaultPath: string): Promise<number>
  listRawFiles(
    vaultPath: string
  ): Promise<
    Array<{ month: string; files: Array<{ name: string; path: string; converted: boolean }> }>
  >
  archiveRawFile(rawPath: string): Promise<{ success: boolean }>
  convertRawFile(
    rawPath: string,
    vaultPath: string
  ): Promise<{ success: boolean; mdPath?: string; error?: string }>
  deleteFolder(folderPath: string): Promise<boolean>
  moveFile(filePath: string, newParentDir: string): Promise<boolean>
  getVaultPath(): Promise<string | null>

  // Build info (Pro / Open-source detection)
  getBuildInfo(): Promise<{ isPro: boolean; isOpenSource: boolean; buildTarget: string }>

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

  // Clipboard watch
  clipboardStart(vaultPath: string): Promise<boolean>
  clipboardStop(): Promise<boolean>
  clipboardSetVaultPath(vaultPath: string): Promise<boolean>

  // 2026-07-08 backport from team 7d9c613: free 仓 importHandlers 链还活着 (Sidebar.tsx:207 用), 保留 openImportWindow, 删其他 7 个
  openImportWindow(): Promise<boolean>

  // Auth
  authGetToken(): Promise<string | null>
  authGetEmail(): Promise<string | null>
  authClear(): Promise<boolean>
  authOpenLogin(): Promise<string>
  onAuthTokenReceived(callback: (data: AuthTokenReceived) => void): () => void

  // Folder map
  folderMapLoad(): Promise<Record<string, string>>
  folderMapSave(map: Record<string, string>): Promise<boolean>

  // Graph
  graphLoad(): Promise<unknown>
  graphRebuild(): Promise<GraphLoadResult>
  // P3-2026-06-02 (backport): 增量重建,只重算 changedFiles 相关的边
  graphRebuildIncremental(changedFiles: string[]): Promise<GraphLoadResult>
  // P1-2026-06-03 (Free 仓): 订阅 vault 文件变化事件(由 fileWatcher emit)
  graphOnFileChange(
    cb: (data: { path: string; type: 'modified' | 'created' | 'deleted' }[]) => void
  ): () => void

  // Vault namespace (P3-2026-06-03: 补 renderer 用的命名空间 API)
  vault: {
    open(): Promise<string | null>
    create(): Promise<string | null>
    openFile(filePath: string): Promise<{ ok: boolean; path?: string }>
    getLast(): Promise<string | null>
    clearLast(): Promise<boolean>
    // v1.5: 上次打开文件记忆 (per-vault)
    getLastFile(vaultPath: string): Promise<string | null>
    setLastFile(vaultPath: string, filePath: string): Promise<boolean>
    refresh(): Promise<{ ok: boolean }>
    list(): Promise<Array<{ path: string; name: string; lastOpened: number }>>
    openPath(path: string): Promise<string | null>
    selectDirectory(): Promise<string | null>
    createAt(path: string): Promise<string | null>
    remove(path: string): Promise<boolean>
    path(): Promise<string | null>
    // 2026-07-09 backport: post-commit audit (App 启动检查 uncommitted + 读 _log/)
    gitStatus(vaultPath: string): Promise<{
      uncommittedCount: number
      files: Array<{ path: string; status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'; author: string | null; mtime: number; diffLines: number }>
      isGitRepo: boolean
      hasPostCommitHook: boolean
    }>
    gitDiff(vaultPath: string, filePath: string): Promise<string>
    readAuditLog(vaultPath: string, limit?: number): Promise<Array<{
      ts: string
      actor: string
      sha: string
      files_changed: number
      files: string[]
      source: string
    }>>
  }
  // File namespace
  file: {
    list(): Promise<unknown[]>
    search(query: string): Promise<unknown[]>
    read(path: string): Promise<string>
    render(path: string): Promise<{ type: string }>
    create(path: string, title: string, type?: string): Promise<boolean>
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
    /** P3-2026-06-03: Pro 仓备份系统, Free 仓暂用 any cast */
    listBackups?(filePath: string): Promise<unknown[]>
    previewBackup?(backupId: string): Promise<string>
    restoreBackup?(backupId: string): Promise<boolean>
  }
  // Settings namespace
  settings: {
    get(): Promise<{ theme: 'light' | 'dark' | 'system' }>
    getTheme(): Promise<'light' | 'dark' | 'system'>
    setTheme(theme: 'light' | 'dark' | 'system'): Promise<string>
  }
  // Graph namespace
  graph: {
    load(): Promise<unknown>
    rebuild(): Promise<GraphLoadResult>
    rebuildIncremental(changedFiles: string[]): Promise<GraphLoadResult>
    onFileChange(
      cb: (data: { path: string; type: 'modified' | 'created' | 'deleted' }[]) => void
    ): () => void
  }

  // Pre-existing missing methods (TODO: integrate with Pro 仓 or remove renderer calls)
  bubbleExpand?: (...args: unknown[]) => unknown
  openInDefaultApp?: (filePath: string) => Promise<void>
  getPathForFile?: (file: File) => string
  listSchemas?: (vaultPath: string) => Promise<unknown[]>
  fileExists?: (path: string) => Promise<boolean>

  // Settings (flat namespace aliases)
  settingsGetTheme(): Promise<'light' | 'dark' | 'system'>
  settingsSetTheme(theme: 'light' | 'dark' | 'system'): Promise<string>

  // v1.5: lastFile aliases (flat — called by useVaultState)
  getLastFile(vaultPath: string): Promise<string | null>
  setLastFile(vaultPath: string, filePath: string): Promise<boolean>

  // v1.4: writeFile (called by SettingsSections)
  writeFile?(filePath: string, content: string): Promise<void>

  // Maintenance
  runMaintenance(): Promise<unknown>

  // Briefing
  generateBriefing(): Promise<unknown>
  getConversations(date: string, options?: { topic?: string; maxResults?: number }): Promise<unknown[]>

  // ─── Skill.md 用户 CRUD (v1.4 精简：仅用户写自己的 Skill) ───
  skillList(): Promise<Array<{ name: string; path: string }>>
  skillLoadDefault(): Promise<string>
  skillRead(name: string): Promise<string>
  skillSave(name: string, content: string): Promise<boolean>
  skillDelete(name: string): Promise<boolean>
}

declare global {
  interface Window {
    api: XyVaultAPI
    toast: (...args: unknown[]) => unknown
  }
}

export {}
