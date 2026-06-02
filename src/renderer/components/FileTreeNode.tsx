/* eslint-disable react-hooks/refs, react-hooks/immutability */
import React from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { FileInfo } from '../types'

interface FileTreeNodeProps {
  file: FileInfo
  depth: number
  flatIdx: number
  expandedFolders: Set<string>
  selectedFile: string | null
  focusedIndex: number
  dropTarget: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
  onContextMenu: (e: React.MouseEvent, file: FileInfo) => void
  onMouseEnter: (e: React.MouseEvent, file: FileInfo) => void
  onMouseLeave: () => void
  onDragStart: (e: React.DragEvent, path: string) => void
  onDropOnFolder: (e: React.DragEvent, folderPath: string) => void
  onDropOnFile: (e: React.DragEvent, filePath: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  itemRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
  flatItemsRef: React.MutableRefObject<{ path: string; isDirectory: boolean }[]>
}

export function FileTreeNode({
  file,
  depth,
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
  flatItemsRef
}: FileTreeNodeProps): JSX.Element | null {
  if (!file?.path) return null

  const isExpanded = expandedFolders.has(file.path)
  const isSelected = selectedFile === file.path
  const isDropTarget = dropTarget === file.path
  const isFocused = focusedIndex === flatIdx

  const depthIndent = Math.min(depth * 16, 80)

  return (
    <div key={file.path}>
      <div
        ref={(el) => {
          itemRefs.current[flatIdx] = el
        }}
        className={[
          'file-tree-item',
          isSelected ? 'selected' : '',
          isDropTarget ? 'drop-target' : '',
          isFocused ? 'keyboard-focused' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: depthIndent }}
        tabIndex={0}
        onClick={() => (file.isDirectory ? onToggle(file.path) : onSelect(file.path))}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(e, file)
        }}
        onMouseEnter={(e) => onMouseEnter(e, file)}
        onMouseLeave={onMouseLeave}
        onDragOver={(e) => onDragOver(e)}
        onDragLeave={onDragLeave}
        onDrop={(e) =>
          file.isDirectory ? onDropOnFolder(e, file.path) : onDropOnFile(e, file.path)
        }
        onDragStart={(e) => onDragStart(e, file.path)}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={file.isDirectory ? isExpanded : undefined}
      >
        <span title={isExpanded ? '折叠' : '展开'}>
          {file.isDirectory ? (
            isExpanded ? (
              <ChevronDown className="file-tree-chevron" size={12} />
            ) : (
              <ChevronRight className="file-tree-chevron" size={12} />
            )
          ) : (
            <span style={{ width: 12, display: 'inline-block' }} />
          )}
        </span>
        <span className="file-tree-name">{file.name}</span>
      </div>
      {file.isDirectory &&
        isExpanded &&
        file.children?.map((child, i) => {
          const childFlatIdx = flatItemsRef.current.findIndex((item) => item.path === child.path)
          return (
            <FileTreeNode
              key={child.path}
              file={child}
              depth={depth + 1}
              flatIdx={childFlatIdx >= 0 ? childFlatIdx : flatIdx + i + 1}
              expandedFolders={expandedFolders}
              selectedFile={selectedFile}
              focusedIndex={focusedIndex}
              dropTarget={dropTarget}
              onToggle={onToggle}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onDragStart={onDragStart}
              onDropOnFolder={onDropOnFolder}
              onDropOnFile={onDropOnFile}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              itemRefs={itemRefs}
              flatItemsRef={flatItemsRef}
            />
          )
        })}
      {isDropTarget && (
        <div className="file-tree-drop-indicator" style={{ paddingLeft: depthIndent + 16 }}>
          释放在此处
        </div>
      )}
    </div>
  )
}
