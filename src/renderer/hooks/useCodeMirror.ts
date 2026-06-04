/**
 * useCodeMirror.ts — CM6 editor lifecycle
 *
 * Creates and manages the CodeMirror 6 EditorView.
 * Extensions are composed via editorExtensions() (useEditorExtensions.ts).
 */
import { useRef, useEffect } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { editorThemeExtension, editorDarkThemeExtension } from '../utils/editorTheme'
import { Compartment } from '@codemirror/state'
import { closeBrackets } from '@codemirror/autocomplete'
import { startEdit } from './useBlockEditor'
import { editorExtensions } from './useEditorExtensions'
import { editorNavigationExtension } from './useWikiLinks/wikiLinksNavigation'
import { setActiveView, setEditHandler, clearEditHandlers } from './editorRegistry'

export function useCodeMirror(
  containerRef: React.RefObject<HTMLDivElement | null>,
  value: string,
  onChange: (value: string) => void,
  onWikiLinkNavigate?: (target: string) => void
) {
  const _viewRef = useRef<EditorView | null>(null)
  const _onChangeRef = useRef(onChange)
  const _onWikiLinkNavigateRef = useRef(onWikiLinkNavigate)
  useEffect(() => {
    _onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    _onWikiLinkNavigateRef.current = onWikiLinkNavigate
  }, [onWikiLinkNavigate])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        editorThemeExtension(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) _onChangeRef.current(update.state.doc.toString())
        }),
        ...editorExtensions(),
        editorNavigationExtension((target: string) => _onWikiLinkNavigateRef.current?.(target))
      ]
    })

    const view = new EditorView({ state, parent: container })
    _viewRef.current = view

    // Theme switching: observe dataset.theme changes
    const themeCompartment = new Compartment()
    const updateTheme = () => {
      const isDark = document.documentElement.dataset.theme === 'dark'
      view.dispatch({
        effects: themeCompartment.reconfigure(
          isDark ? editorDarkThemeExtension() : editorThemeExtension()
        )
      })
    }
    const observer = new MutationObserver(() => updateTheme())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    updateTheme()
    ;(view as any).__themeObserver = observer

    // v1.5: 改为 registry (替代 window.__cmView / __XxxEdit)
    setActiveView(view)
    setEditHandler('frontmatter', (widget, dom, v) => {
      startEdit(widget, dom, v)
    })
    setEditHandler('table', (widget, dom, v) => {
      startEdit(widget, dom, v)
    })
    setEditHandler('mermaid', (widget, dom, v) => {
      startEdit(widget, dom, v)
    })

    return () => {
      view.destroy()
      _viewRef.current = null
      observer.disconnect() // v1.5: 断开 MutationObserver
      setActiveView(null) // v1.5: 清空 registry, 避免指向已 destroy 的 view
      clearEditHandlers() // v1.5: 清理 edit handlers
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = _viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value }
      })
    }
  }, [value])

  return { viewRef: _viewRef }
}
