/**
 * FileTreeRow — react-window 行渲染包装
 *
 * P3-2026-06-03 (Free 仓): FixedSizeList 的行渲染组件
 * 接受 react-window 的 ListChildComponentProps (index + style + data),
 * 渲染 FileTreeFlatRow (单行拍平组件)。
 *
 * 性能:
 * - memo + style 由 react-window 注入(避免重排)
 * - itemData 变化时才 re-render (通过 useMemo 在 FileTree 派生)
 */
import { memo } from 'react'
import { type ListChildComponentProps } from 'react-window'
import { FileTreeFlatRow } from './FileTreeFlatRow'
import type { FlatTreeItem } from '../utils/flattenTree'

export interface FileTreeRowData {
  items: FlatTreeItem[]
  expandedFolders: Set<string>
  selectedFile: string | null
  focusedIndex: number
  dropTarget: string | null
  callbacks: {
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
  }
  itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  flatItemsRef: React.MutableRefObject<{ path: string; isDirectory: boolean }[]>
}

export const Row = memo(function Row({
  index,
  style,
  data
}: ListChildComponentProps<FileTreeRowData>) {
  const item = data.items[index]
  if (!item?.path) return null
  const c = data.callbacks
  return (
    <div style={style}>
      <FileTreeFlatRow
        item={item}
        flatIdx={index}
        expandedFolders={data.expandedFolders}
        selectedFile={data.selectedFile}
        focusedIndex={data.focusedIndex}
        dropTarget={data.dropTarget}
        onToggle={c.onToggle}
        onSelect={c.onSelect}
        onContextMenu={c.onContextMenu}
        onMouseEnter={c.onMouseEnter}
        onMouseLeave={c.onMouseLeave}
        onDragStart={c.onDragStart}
        onDropOnFolder={c.onDropOnFolder}
        onDropOnFile={c.onDropOnFile}
        onDragOver={c.onDragOver}
        onDragLeave={c.onDragLeave}
        itemRefs={data.itemRefs}
        flatItemsRef={data.flatItemsRef}
      />
    </div>
  )
})
