/**
 * wikiLinksClickHandler.ts — Click handling keybinding (optional)
 *
 * Note: Click-to-follow is implemented via ViewPlugin eventHandlers in wikiLinksPlugin.ts.
 * This module provides keyboard-based link following (Ctrl+Alt+Enter).
 */
import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { WikiLinksConfig } from './types'
import { findLinkAtPos } from './wikiLinksParser'

/**
 * Build click handler extension for wiki links.
 * Primary click handling is in wikiLinksPlugin.ts.
 * This provides keyboard shortcut: Ctrl+Alt+Enter to jump to link at cursor.
 */
export function wikiLinksClickHandlerExtension(
  config: WikiLinksConfig,
  getDecorationState: () => { resolved: Map<string, unknown>; decorations: unknown }
): Extension {
  const followLinkKeymap = keymap.of([
    {
      key: 'Ctrl-Alt-Enter',
      run: (view: EditorView): boolean => {
        const pos = view.state.selection.main.head
        const link = findLinkAtPos(view.state.doc, pos)
        if (!link) return false

        const state = getDecorationState()
        const resolved = state.resolved.get(link.target) as {
          target: string
          label: string
          status: string
        } | null
        config.onClick?.(
          link.target,
          resolved as Parameters<typeof config.onClick>[1],
          new MouseEvent('click') as unknown as MouseEvent
        )
        return true
      }
    }
  ])

  return [followLinkKeymap] as unknown as Extension
}
