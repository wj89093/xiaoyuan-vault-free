/**
 * useEditorContextMenu.ts — Right-click context menu for the Markdown editor
 *
 * Integrates with CodeMirror 6 via the EditorView exposed on window.
 * Shows a native-style context menu with edit/format/insert actions.
 *
 * Usage:
 *   const { contextMenu, showContextMenu, hideContextMenu } = useEditorContextMenu(viewRef, onFormat)
 *   <div onContextMenu={(e) => showContextMenu(e.nativeEvent)}>
 *     <EditorContextMenu {...contextMenu} onClose={hideContextMenu} />
 *   </div>
 */
import { useState, useEffect, useCallback } from 'react'
import { EditorView } from '@codemirror/view'
import log from 'electron-log/renderer'

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  viewRef: EditorView | null
}

export interface UseEditorContextMenuOptions {
  onFormat?: (command: string, params?: Record<string, any>) => void
}

/**
 * Hook: useEditorContextMenu
 *
 * Returns menu state + show/hide handlers.
 * Integrates with CodeMirror via window.__cmView ref.
 */
export function useEditorContextMenu(
  viewRef: React.MutableRefObject<EditorView | null>,
  options: UseEditorContextMenuOptions = {},
) {
  const {  } = options
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    viewRef: null,
  })

  // Always read from window (viewRef may not update on every render)
  const getView = useCallback((): EditorView | null => {
    const w = (window as any)
    if (w.__cmView instanceof EditorView) return w.__cmView
    return viewRef.current
  }, [viewRef])

  const showContextMenu = useCallback((e: React.MouseEvent) => {
    // Prevent native context menu immediately
    e.preventDefault()
    e.stopPropagation()

    const view = getView()
    if (!view) return

    setMenuState({ visible: true, x: e.clientX, y: e.clientY, viewRef: view })
  }, [getView])

  const hideContextMenu = useCallback(() => {
    setMenuState(s => ({ ...s, visible: false }))
  }, [])

  // Close on outside click or Escape
  useEffect(() => {
    if (!menuState.visible) return

    let willClose = false
    const close = (_e: MouseEvent) => {
      willClose = true
      setTimeout(() => {
        if (willClose) setMenuState(s => ({ ...s, visible: false }))
      }, 150)
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { willClose = true; setMenuState(s => ({ ...s, visible: false })) }
    }

    // Use capture phase to catch clicks outside
    document.addEventListener('mousedown', close, { capture: true })
    document.addEventListener('keydown', keydown)
    return () => {
      willClose = false
      document.removeEventListener('mousedown', close, { capture: true })
      document.removeEventListener('keydown', keydown)
    }
  }, [menuState.visible])

  log.debug('[EditorContextMenu] menuState:', menuState.visible, 'at', menuState.x, menuState.y)

  return {
    contextMenu: menuState,
    showContextMenu,
    hideContextMenu,
  }
}