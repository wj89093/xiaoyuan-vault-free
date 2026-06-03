/**
 * preload API — grouped by domain
 *
 * Renderer calls window.api.<namespace>.<method>() instead of flat window.api.<method>().
 * Grouping: vault | file | schema | autoAI | url | converter | ai | chat | enrich | auth | provider | graph | maintenance | clipboard | shortcuts | import | agent
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { ChatMessage, AskResult, ImportFileResult } from '../../shared/chat'

console.log('[preload] script started')

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */

// ─── Shared helpers ─────────────────────────────────────────────────

function handler<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...(args as any[])) as Promise<T>
}

function onEvent(channel: string, callback: (...args: unknown[]) => void): () => void {
  const sub = (...args: unknown[]) => {
    if (args.length === 0 || args[0] === undefined || args[0] === null) {
      console.warn('[preload] BAD payload on', channel, 'args:', args.length, 'first:', args[0])
    }
    try {
      callback(...args)
    } catch (e) {
      console.error(
        '[preload] handler crash on',
        channel,
        'args:',
        JSON.stringify(args).slice(0, 200),
        e
      )
    }
  }
  ipcRenderer.on(channel, sub)
  return () => ipcRenderer.removeListener(channel, sub)
}

// ─── API namespaces ──────────────────────────────────────────────────

const vault = {
  open: () => handler<string | null>('vault:open'),
  create: () => handler<string | null>('vault:create'),
  openFile: (filePath: string) =>
    handler<{ ok: boolean; path?: string }>('vault:openFile', filePath),

  getLast: () => handler<string | null>('vault:getLast'),
  clearLast: () => handler<boolean>('vault:clear'),
  refresh: () => handler<{ ok: boolean }>('vault:refresh'),
  list: () => handler<Array<{ path: string; name: string; lastOpened: number }>>('vault:list'),
  openPath: (path: string) => handler<string | null>('vault:openPath', path),
  selectDirectory: () => handler<string | null>('dialog:selectDirectory'),
  createAt: (path: string) => handler<string | null>('vault:createAt', path),
  remove: (path: string) => handler<boolean>('vault:remove', path),
  path: () => handler<string | null>('vault:path')
}

const file = {
  list: () => handler<any[]>('file:list'),
  search: (query: string) => handler<any[]>('file:search', query),
  read: (path: string) => handler<string>('file:read', path),
  render: (path: string) => handler<{ type: string }>('file:render', path),
  create: (path: string, title: string, type?: string) =>
    handler<boolean>('file:create', path, title, type),
  save: (path: string, content: string) => handler<boolean>('file:save', path, content),
  exists: (path: string) => handler<boolean>('file:exists', path),
  walkDir: (path: string) => handler<any>('file:walkDir', path),
  rename: (oldPath: string, newName: string) => handler<boolean>('file:rename', oldPath, newName),
  delete: (vaultPath: string, filePath: string) =>
    handler<boolean>('file:delete', vaultPath, filePath),
  move: (filePath: string, newParentDir: string) =>
    handler<boolean>('file:move', filePath, newParentDir),
  revealInFinder: (filePath: string) => handler<void>('file:revealInFinder', filePath),
  openExternal: (filePath: string) =>
    handler<{ ok: boolean; error?: string }>('file:openExternal', filePath),
  trashList: (vaultPath: string) => handler<any[]>('file:trashList', vaultPath),
  trashRestore: (vaultPath: string, originalPath: string) =>
    handler<boolean>('file:trashRestore', vaultPath, originalPath),
  trashDelete: (vaultPath: string, originalPath: string) =>
    handler<boolean>('file:trashDelete', vaultPath, originalPath),
  trashClean: (vaultPath: string) => handler<number>('file:trashClean', vaultPath),
  import: (vaultPath: string, filePaths: string[]) =>
    handler<ImportFileResult[]>('file:import', vaultPath, filePaths),
  listRaw: (vaultPath: string) => handler<any[]>('file:listRaw', vaultPath),

  convertRaw: (rawPath: string, vaultPath: string) =>
    handler<any>('file:convertRaw', rawPath, vaultPath),
  listSchemas: (vaultPath: string) => handler<any[]>('file:listSchemas', vaultPath),
  listBackups: (filePath: string) => handler<any[]>('file:listBackups', filePath),
  previewBackup: (filePath: string, timestamp: string) =>
    handler<string>('file:previewBackup', filePath, timestamp),
  restoreBackup: (filePath: string, timestamp: string) =>
    handler<boolean>('file:restoreBackup', filePath, timestamp),
  createFolder: (folderPath: string) => handler<boolean>('folder:create', folderPath),
  deleteFolder: (folderPath: string) => handler<boolean>('folder:delete', folderPath)
}

const schema = {
  list: () => handler<any[]>('lint:listSchemas'),
  getPending: () => handler<any[]>('lint:getPendingSchemas')
}

const lint = {
  getReports: () => handler<any[]>('lint:getLintReports'),
  fixIssue: (issue: any) => handler<boolean>('lint:fixLintIssue', issue),
  run: () => handler<any>('lint:runLint')
}

const url = {
  fetch: (url: string) => handler<any>('url:fetch', url),
  save: (url: string, vaultPath: string) => handler<string>('url:save', url, vaultPath),
  fetchUrl: (url: string) => handler<{ title: string; content: string }>('import:fetchUrl', url),
  saveUrl: (vaultPath: string, title: string, content: string) =>
    handler<string>('import:saveUrl', vaultPath, title, content)
}

const converter = {
  convert: (filePath: string) => handler<any>('converter:convert', filePath),
  supported: () => handler<string[]>('converter:supported'),
  transcribe: (filePath: string) => handler<any>('converter:transcribe', filePath)
}

const chat = {
  ask: (question: string, history?: ChatMessage[]) =>
    handler<AskResult>('chat:ask', question, history ?? []),
  sessionAsk: (question: string, history: any[], vaultPath?: string) =>
    handler<any>('chat:sessionAsk', question, history, vaultPath),
  session: (params: { action: 'get' | 'reset' | 'delete' | 'abort'; vaultPath?: string }) =>
    handler<any>('chat:session', params),
  onStreamChunk: (cb: (data: { chunk: string }) => void) => onEvent('chat:streamChunk', cb as any),
  onGreeting: (cb: (data: { text: string }) => void) => onEvent('chat:greeting', cb as any),
  onStreamDone: (cb: (data: AskResult) => void) => onEvent('chat:streamDone', cb as any),
  onStreamError: (cb: (data: { error: string }) => void) => onEvent('chat:streamError', cb as any),
  onAborted: (cb: () => void) => onEvent('chat:aborted', cb as any),
  onToolUpdate: (
    cb: (data: { name: string; args: unknown; status: string; result?: string }) => void
  ) => onEvent('chat:toolUpdate', cb as any)
}

const query = {
  resolve: (content: string, title?: string) => handler<any>('resolver:classify', content, title),
  vault: (question: string) => handler<any>('query:vault', question)
}

const auth = {
  getToken: () => handler<string | null>('auth:getToken'),
  getEmail: () => handler<string | null>('auth:getEmail'),
  clear: () => handler<boolean>('auth:clear'),
  openLogin: () => handler<string>('auth:openLogin'),
  debugLogin: (email: string, code: string) =>
    handler<string, string>('auth:debugLogin', email, code),
  onTokenReceived: (cb: (data: { token: string; email: string }) => void) =>
    onEvent('auth:tokenReceived', cb as any)
}

const settings = {
  get: () => handler<{ theme: 'light' | 'dark' | 'system' }>('settings:get'),
  getTheme: () => handler<'light' | 'dark' | 'system'>('settings:getTheme'),
  setTheme: (theme: 'light' | 'dark' | 'system') => handler<string>('settings:setTheme', theme),
  getAgentPlugin: () =>
    handler<{
      enabled: boolean
      endpoint: string
      apiKey: string
      protocol: 'ws' | 'http'
      name: string
    }>('settings:getAgentPlugin'),
  setAgentPlugin: (config: {
    enabled: boolean
    endpoint: string
    apiKey: string
    protocol: 'ws' | 'http'
    name: string
  }) => handler<any>('settings:setAgentPlugin', config),
  setAgentPluginEnabled: (enabled: boolean) =>
    handler<boolean>('settings:setAgentPluginEnabled', enabled)
}

const provider = {
  get: () => handler<string>('provider:get'),
  set: (provider: string) => handler<boolean>('provider:set', provider)
}

const graph = {
  load: () => handler<any>('graph:load'),
  rebuild: () => handler<{ nodes: number; edges: number }>('graph:rebuild'),
  // P3-2026-06-02 (backport): 增量重建,只重算 changedFiles 相关的边
  rebuildIncremental: (changedFiles: string[]) =>
    handler<{ nodes: number; edges: number }>('graph:rebuildIncremental', changedFiles),
}

const maintenance = {
  run: () => handler<any>('maintain:run'),
  getTasks: () => handler<any[]>('scheduler:getTasks'),
  updateTasks: (tasks: unknown[]) => handler<boolean>('scheduler:updateTasks', tasks),
  generateBriefing: () => handler<any>('briefing:generate'),
  saveConversation: (params: {
    title: string
    topic: string
    decisions: string[]
    relatedFiles: string[]
    nextSteps: string[]
    discussion?: string
  }) => handler<{ path: string; ok: boolean; error?: string }>('briefing:saveConversation', params),
  getConversations: (date: string) => handler<any[]>('briefing:getConversations', date)
}

const clipboard = {
  start: (vaultPath: string) => handler<boolean>('clipboard:start', vaultPath),
  stop: () => handler<boolean>('clipboard:stop'),
  setVaultPath: (vaultPath: string) => handler<boolean>('clipboard:setVaultPath', vaultPath)
}

const shortcuts = {
  onImportCompleted: (cb: (filePaths?: string[]) => void) => onEvent('import:completed', cb as any),
  onQuickSwitch: (cb: () => void) => onEvent('shortcut:quick-switch', cb as any),
  onGotoImport: (cb: () => void) => onEvent('shortcut:goto-import', cb as any)
}

const import_ = {
  openWindow: () => handler<boolean>('import:open'),
  autoTrigger: (filePaths: string[]) => handler<boolean>('import:autoTrigger', filePaths)
}

const skill = {
  list: () => handler<Array<{ name: string; path: string }>>('skill:list'),
  loadDefault: () => handler<string>('skill:loadDefault'),
  read: (name: string) => handler<string>('skill:read', name),
  save: (name: string, content: string) => handler<boolean>('skill:save', name, content),
  delete: (name: string) => handler<boolean>('skill:delete', name)
}

// ─── Agent namespace (bash event forwarding from main process) ─────────
// bash:chunk / bash:done are sent by tools.ts via webContents.send()
const _agent = {
  onBashChunk: (cb: (data: { chunk: string }) => void) => onEvent('bash:chunk', cb as any),
  onBashDone: (cb: (data: { result: string }) => void) => onEvent('bash:done', cb as any),
  onVaultFileOpened: (cb: (data: { path: string }) => void) =>
    onEvent('vault:fileOpened', cb as any)
}

// ─── Main export (flat + namespace for new code) ──────────────────────

const api = {
  // Namespaces (new pattern — renderer should migrate to these)
  vault,
  file,
  schema,
  lint,
  url,
  converter,
  chat,
  query,
  auth,
  settings,
  provider,
  graph,
  maintenance,
  clipboard,
  shortcuts,
  import: import_,
  skill,

  // Legacy flat aliases — kept for backward compat during migration
  // (These are the exact same 28 methods renderer actually uses)
  listFiles: () => file.list(),
  readFile: (path: string) => file.read(path),
  renderFile: (path: string) => file.render(path),
  saveFile: (path: string, content: string) => file.save(path, content),
  searchFiles: (query: string) => file.search(query),
  moveFile: (filePath: string, newParentDir: string) => file.move(filePath, newParentDir),
  deleteFile: (vaultPath: string, filePath: string) => file.delete(vaultPath, filePath),
  trashList: (vaultPath: string) => file.trashList(vaultPath),
  trashRestore: (vaultPath: string, originalPath: string) =>
    file.trashRestore(vaultPath, originalPath),
  trashDelete: (vaultPath: string, originalPath: string) =>
    file.trashDelete(vaultPath, originalPath),
  deleteFolder: (folderPath: string) => file.deleteFolder(folderPath),
  renameFile: (oldPath: string, newName: string) => file.rename(oldPath, newName),
  revealInFinder: (filePath: string) => file.revealInFinder(filePath),
  openImportWindow: () => import_.openWindow(),
  listSchemas: (vaultPath: string) => file.listSchemas(vaultPath),
  fileExists: (filePath: string) => file.exists(filePath),
  getLastVault: () => vault.getLast(),
  generateBriefing: () => maintenance.generateBriefing(),
  getConversations: (date: string) => maintenance.getConversations(date),
  graphLoad: () => graph.load(),
  graphRebuild: () => graph.rebuild(),
  authGetToken: () => auth.getToken(),
  authGetEmail: () => auth.getEmail(),
  authClear: () => auth.clear(),
  authOpenLogin: () => auth.openLogin(),
  authDebugLogin: (email: string, code: string) => auth.debugLogin(email, code),
  selectDirectory: () => handler<string | null>('dialog:selectDirectory'),
  getBuildInfo: () =>
    handler<{ isPro: boolean; isOpenSource: boolean; buildTarget: string }>('app:buildInfo'),
  settingsGetTheme: () => settings.getTheme(),
  settingsGetTheme: () => settings.getTheme(),
  settingsSetTheme: (theme: 'light' | 'dark' | 'system') => settings.setTheme(theme),
  onImportCompleted: (cb: (filePaths?: string[]) => void) => shortcuts.onImportCompleted(cb),
  onQuickSwitch: (cb: () => void) => shortcuts.onQuickSwitch(cb),
  onGotoImport: (cb: () => void) => shortcuts.onGotoImport(cb),
  getVaultPath: () => vault.path(),
  skillList: () => skill.list(),
  skillLoadDefault: () => skill.loadDefault(),
  skillRead: (name: string) => skill.read(name),
  skillSave: (name: string, content: string) => skill.save(name, content),
  skillDelete: (name: string) => skill.delete(name)
}

console.log('[preload] exposing api to window.api')
contextBridge.exposeInMainWorld('api', api)
export type XyVaultAPI = typeof api
