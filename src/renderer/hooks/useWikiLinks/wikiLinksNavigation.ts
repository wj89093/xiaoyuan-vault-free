/**
 * wikiLinksNavigation.ts — Wiki link click → navigate
 *
 * atomic-editor pattern: listen for cm-wikilink-click custom event
 * dispatched from WikiLinkWidget, then call the navigate callback.
 */
import { EditorView } from '@codemirror/view'

/**
 * Build an extension that calls `onNavigate(target)` when a wiki link is clicked.
 *
 * @param onNavigate - called with the link target string (e.g. "target" from [[target]])
 * @returns CM6 Extension
 */
export function editorNavigationExtension(onNavigate?: (target: string) => void) {
  if (!onNavigate) return EditorView.extension

  return EditorView.domEventHandlers({
    click(event, view) {
      const el = event.target as Element | null
      if (!el) return false

      // atomic-editor pattern: widget dispatches cm-wikilink-click on the DOM
      const linkEl = el.closest<HTMLElement>('[data-wiki-link-target]')
      if (linkEl?.closest('.cm-editor') === view.dom) {
        event.preventDefault()
        event.stopPropagation()
        const target = linkEl.dataset.wikiLinkTarget ?? ''
        if (target) onNavigate(target)
        return true
      }
      return false
    }
  })
}
