/**
 * index.ts — File Handlers 聚合导出
 *
 * Usage:
 *   registerFileHandlers()  // 在 main/index.ts 调用一次
 *
 * 拆分结构:
 *   crudHandlers.ts    — file:rename/move/delete + folder:create/delete + file:list/search/read/render
 *   importHandlers.ts  — file:import/convertRaw/listRaw/archiveQuery
 *   trashHandlers.ts   — file:openExternal/revealInFinder + trash list/restore/delete/clean
 *   miscHandlers.ts    — file:listSchemas/exists/walkDir
 */
import { registerCrudHandlers } from './crudHandlers'
import { registerImportHandlers } from './importHandlers'
import { registerTrashHandlers } from './trashHandlers'
import { registerMiscHandlers } from './miscHandlers'

export function registerFileHandlers(): void {
  registerCrudHandlers()
  registerImportHandlers()
  registerTrashHandlers()
  registerMiscHandlers()
}