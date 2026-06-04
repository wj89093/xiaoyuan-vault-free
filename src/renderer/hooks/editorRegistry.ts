/**
 * editorRegistry.ts — EditorView 单例注册表
 *
 * 替代旧的 `(window as any).__cmView` / `__frontmatterEdit` / `__tableEdit` /
 * `__mermaidEdit` 全局变量模式。
 *
 * 好处:
 * - 强类型 (vs window as any)
 * - 不污染 window 全局
 * - 卸载时 setActiveView(null) 显式清空, 不会有"指向已 destroy view"的引用
 * - 编辑器只能有一个 active 实例, 避免多 mount 互相覆盖
 *
 * 替代 4 个 window 全局:
 *   window.__cmView           → getActiveView()
 *   window.__frontmatterEdit  → callEdit('frontmatter', widget, dom, view)
 *   window.__tableEdit        → callEdit('table', ...)
 *   window.__mermaidEdit      → callEdit('mermaid', ...)
 */
import type { EditorView } from '@codemirror/view'
import type { BlockWidget } from './useBlockEditor'

type EditKind = 'frontmatter' | 'table' | 'mermaid'
type EditHandler = (widget: BlockWidget, dom: HTMLElement, view: EditorView) => void

let activeView: EditorView | null = null
const editHandlers: Partial<Record<EditKind, EditHandler>> = {}

/** 设置当前活跃 EditorView (mount 时调, unmount 时传 null) */
export function setActiveView(view: EditorView | null): void {
  activeView = view
}

/** 取当前活跃 EditorView (无则 null) */
export function getActiveView(): EditorView | null {
  return activeView
}

/** 注册 block edit handler (mount 时调, 覆盖之前的) */
export function setEditHandler(kind: EditKind, handler: EditHandler): void {
  editHandlers[kind] = handler
}

/** 调用 block edit handler (widget 通过 window 回调时用) */
export function callEdit(
  kind: EditKind,
  widget: BlockWidget,
  dom: HTMLElement,
  view: EditorView
): void {
  editHandlers[kind]?.(widget, dom, view)
}

/** 卸载时清理所有 handlers (避免下次 mount 残留旧引用) */
export function clearEditHandlers(): void {
  delete editHandlers.frontmatter
  delete editHandlers.table
  delete editHandlers.mermaid
}
