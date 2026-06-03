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

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  pagesUsed?: Array<{ file: string; title: string }>
  sourceMode?: 'knowledge_base' | 'mixed' | 'ai_only'
  saved?: boolean
  timestamp?: number
}

export interface ChatSession {
  id: string
  title: string
  updatedAt: string
  createdAt?: number
}

export interface AskResult {
  answer: string
  sources: Array<{ file: string; title: string; snippet: string }>
  confidence: number
}

export interface AskStreamChunk {
  chunk: string
  partial: string
}

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

  // AI operations (flat API — legacy, prefer window.api.chat.* / window.api.agent.*)
  aiReason(question: string, context: string[]): Promise<string>
  aiClassify(content: string, folders: string[]): Promise<string>
  aiTags(content: string): Promise<string[]>
  aiSummary(content: string): Promise<string>
  aiWrite(outline: string): Promise<string>
  resolveContent(content: string, title?: string): Promise<unknown>
  openImportWindow(): Promise<boolean>
  queryVault(question: string): Promise<unknown>

  // Nested chat API
  chat: {
    // Legacy non-streaming ask
    ask(question: string, history?: ChatMessage[]): Promise<AskResult>
    // Main entry: single-session streaming chat
    sessionAsk(question: string, history: any[], vaultPath?: string): Promise<any>
    session(params: { action: string; vaultPath?: string }): Promise<any>
    // Event listeners (used by useChat hook)
    onStreamChunk(cb: (data: { chunk: string; partial: string }) => void): () => void
    onStreamDone(cb: (data: AskResult) => void): () => void
    onStreamError(cb: (data: { error: string }) => void): () => void
    onToolUpdate(
      cb: (data: { name: string; args: unknown; status: string; result?: string }) => void
    ): () => void
  }

  // Auth
  authGetToken(): Promise<string | null>
  authGetEmail(): Promise<string | null>
  authClear(): Promise<boolean>
  authOpenLogin(): Promise<string>
  onAuthTokenReceived(callback: (data: AuthTokenReceived) => void): () => void

  // Provider
  providerGet(): Promise<string>
  providerSet(provider: string): Promise<boolean>

  // Agent Plugin (open-source build)
  settingsGetAgentPlugin(): Promise<{
    enabled: boolean
    endpoint: string
    apiKey: string
    protocol: 'ws' | 'http'
    name: string
  }>
  settingsSetAgentPlugin(config: {
    enabled: boolean
    endpoint: string
    apiKey: string
    protocol: 'ws' | 'http'
    name: string
  }): Promise<void>
  settingsSetAgentPluginEnabled(enabled: boolean): Promise<boolean>

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
    cb: (data: { path: string; type: 'modified' | 'created' | 'deleted' }[]) => void,
  ): () => void

  // Vault namespace (P3-2026-06-03: 补 renderer 用的命名空间 API)
  vault: {
    open(): Promise<string | null>
    create(): Promise<string | null>
    openFile(filePath: string): Promise<{ ok: boolean; path?: string }>
    getLast(): Promise<string | null>
    clearLast(): Promise<boolean>
    refresh(): Promise<{ ok: boolean }>
    list(): Promise<Array<{ path: string; name: string; lastOpened: number }>>
    openPath(path: string): Promise<string | null>
    selectDirectory(): Promise<string | null>
    createAt(path: string): Promise<string | null>
    remove(path: string): Promise<boolean>
    path(): Promise<string | null>
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
  }
  // Settings namespace
  settings: {
    get(): Promise<{ theme: 'light' | 'dark' | 'system' }>
    getTheme(): Promise<'light' | 'dark' | 'system'>
    setTheme(theme: 'light' | 'dark' | 'system'): Promise<string>
    getAgentPlugin(): Promise<{
      enabled: boolean
      endpoint: string
      apiKey: string
      protocol: 'ws' | 'http'
      name: string
    }>
    setAgentPlugin(config: {
      enabled: boolean
      endpoint: string
      apiKey: string
      protocol: 'ws' | 'http'
      name: string
    }): Promise<void>
    setAgentPluginEnabled(enabled: boolean): Promise<boolean>
  }
  // Graph namespace
  graph: {
    load(): Promise<unknown>
    rebuild(): Promise<GraphLoadResult>
    rebuildIncremental(changedFiles: string[]): Promise<GraphLoadResult>
    onFileChange(
      cb: (data: { path: string; type: 'modified' | 'created' | 'deleted' }[]) => void,
    ): () => void
  }

  // Pre-existing missing methods (TODO: integrate with Pro 仓 or remove renderer calls)
  bubbleExpand?: (...args: unknown[]) => unknown
  openInDefaultApp?: (filePath: string) => Promise<void>
  getPathForFile?: (file: File) => string
  listSchemas?: (vaultPath: string) => Promise<unknown[]>
  fileExists?: (path: string) => Promise<boolean>

  // Maintenance
  runMaintenance(): Promise<unknown>

  // Agent namespace (bash events forwarded from main process tools.ts)
  agent: {
    onBashChunk(cb: (data: { chunk: string }) => void): () => void
    onBashDone(cb: (data: { result: string }) => void): () => void
  }

  agentCallTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; result?: string; error?: string }>

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
