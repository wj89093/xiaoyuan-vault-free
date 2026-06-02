/**
 * flattenTree — 把 FileTree 递归树拍平为线性列表
 *
 * P3-2026-06-02: 为 FileTree 虚拟化做的基础工具。
 * 配合 react-window FixedSizeList,可在 500+ 文件的 vault 下流畅渲染。
 *
 * 当前状态: 工具已写好,FileTree 已 useMemo 派生 flatItems,
 * 但未接入 FixedSizeList(下次会话接)。
 *
 * 用法:
 *   const flat = flattenTree(roots, expandedFolders, { maxDepth: 10 })
 *   // flat = [{ path, name, depth, isDirectory, hasChildren }, ...]
 */

import type { FileInfo } from '../types'

export interface FlatTreeItem {
  path: string
  name: string
  depth: number
  isDirectory: boolean
  hasChildren: boolean
}

export interface FlattenTreeOptions {
  /** 最大深度(防止恶意超深目录) */
  maxDepth?: number
}

const DEFAULT_OPTIONS: Required<FlattenTreeOptions> = {
  maxDepth: 12,
}

/**
 * 深度优先拍平树。
 * 父节点先出现,子节点后出现(根据 expandedFolders 决定)。
 * 文件夹未展开时,只出现父节点本身,不包含子项。
 */
export function flattenTree(
  roots: FileInfo[],
  expandedFolders: Set<string>,
  options: FlattenTreeOptions = {},
): FlatTreeItem[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const out: FlatTreeItem[] = []

  function walk(items: FileInfo[], depth: number): void {
    if (depth > opts.maxDepth) return
    for (const item of items) {
      const hasChildren = Boolean(item.isDirectory && item.children && item.children.length > 0)
      out.push({
        path: item.path,
        name: item.name,
        depth,
        isDirectory: Boolean(item.isDirectory),
        hasChildren,
      })
      // 展开时才拍平子项
      if (item.isDirectory && item.children && expandedFolders.has(item.path)) {
        walk(item.children, depth + 1)
      }
    }
  }

  walk(roots, 0)
  return out
}
