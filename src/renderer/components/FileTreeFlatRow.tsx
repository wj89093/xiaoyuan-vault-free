/**
 * FileTreeFlatRow — FileTree 拍平后的单行渲染组件
 *
 * P3-2026-06-02: 替代 FileTreeNode 的递归渲染
 * 拍平后的 flatItems 数组,每个元素用 FileTreeFlatRow 渲染单行
 * 不递归,子项通过 flatItems 中后续的元素体现(已经按 DFS 拍平)
 *
 * 收益:
 * - DOM 不嵌套(500 文件从 500 嵌套节点 → 500 平级节点)
 * - React 渲染开销从 O(depth) → O(1) per item
 * - 后续接 react-window FixedSizeList 时,只需替换外层 .map
 */
import React, { memo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { FlatTreeItem } from '../utils/flattenTree'

export interface FileTreeFlatRowProps {
  item: FlatTreeItem
  flatIdx: number
  expandedFolders: Set<string>
  selectedFile: string | null
  focusedIndex: number
  dropTarget: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onContextMenu: (e: React.MouseEvent, item: FlatTreeItem) => void
  onMouseEnter: (e: React.MouseEvent, item: FlatTreeItem) => void
  onMouseLeave: () => void
  onDragStart: (e: React.DragEvent, path: string) => void
  onDropOnFolder: (e: React.DragEvent, folderPath: string) => void
  onDropOnFile: (e: React.DragEvent, filePath: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
}

export const FileTreeFlatRow = memo(function FileTreeFlatRow({
  item,
  flatIdx,
  expandedFolders,
  selectedFile,
  focusedIndex,
  dropTarget,
  onToggle,
  onSelect,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDropOnFolder,
  onDropOnFile,
  onDragOver,
  onDragLeave,
  itemRefs,
}: FileTreeFlatRowProps): JSX.Element | null {
  if (!item?.path) return null

  const isExpanded = expandedFolders.has(item.path)
  const isSelected = selectedFile === item.path
  const isDropTarget = dropTarget === item.path
  const isFocused = focusedIndex === flatIdx

  const depthIndent = Math.min(item.depth * 16, 80)

  return (
    <div
      ref={el => { itemRefs.current[flatIdx] = el }}
      className={[
        'file-tree-item',
        isSelected ? 'selected' : '',
        isDropTarget ? 'drop-target' : '',
        isFocused ? 'keyboard-focused' : '',
      ].filter(Boolean).join(' ')}
      style={{ paddingLeft: depthIndent }}
      tabIndex={0}
      onClick={() => item.isDirectory ? onToggle(item.path) : onSelect(item.path)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(e, item)
      }}
      onMouseEnter={(e) => onMouseEnter(e, item)}
      onMouseLeave={onMouseLeave}
      onDragOver={(e) => onDragOver(e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => item.isDirectory ? onDropOnFolder(e, item.path) : onDropOnFile(e, item.path)}
      onDragStart={(e) => onDragStart(e, item.path)}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={item.isDirectory ? isExpanded : undefined}
    >
      <span title={isExpanded ? '折叠' : '展开'}>
        {item.isDirectory
          ? (isExpanded ? <ChevronDown className="file-tree-chevron" size={12} /> : <ChevronRight className="file-tree-chevron" size={12} />)
          : <span style={{ width: 12, display: 'inline-block' }} />}
      </span>
      <span className="file-tree-name">{item.name}</span>
    </div>
  )
})
