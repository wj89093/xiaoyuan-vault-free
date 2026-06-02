/**
 * useBlockEditor.ts — Shared block-level WYSIWYG edit manager for CM6
 *
 * Flow:
 *   1. Widget dblclick → startEdit(widget, dom, view)
 *   2. BlockEditor injects textarea+buttons as DOM siblings (no innerHTML wipe)
 *  3. widget._editing = true → updateDOM returns true (CM6 keeps DOM, skips toDOM)
 *   4. User: Ctrl+Enter / Save → doConfirm() → DOM cleanup → dispatch replace
 *   5. User: ESC / Cancel → cancelEdit() → DOM cleanup → no-op dispatch → rebuild
 */
import { type EditorView } from '@codemirror/view'

export interface BlockWidget {
  from: number
  to: number
  getValue(): string
}

interface EditingState {
  widget: BlockWidget
  dom: HTMLElement
  view: EditorView
  ta: HTMLTextAreaElement
  btns: HTMLDivElement
}

let _editing: EditingState | null = null

// ── Public API ────────────────────────────────────────────────────────────────

export function startEdit(widget: BlockWidget, dom: HTMLElement, view: EditorView): void {
  if (_editing) abortEdit()
  _startEdit(widget, dom, view)
}

export function cancelEdit(): void {
  abortEdit()
}

export function isEditing(): boolean {
  return _editing !== null
}

function _startEdit(widget: BlockWidget, dom: HTMLElement, view: EditorView): void {
  // Refresh positions from CURRENT doc state
  const docLen = view.state.doc.length
  const from = Math.min(widget.from, docLen)
  const to = Math.min(Math.max(widget.from, 0) + (widget.to - widget.from), docLen)
  const currentValue = from < to ? view.state.sliceDoc(from, to) : widget.getValue()

  // Mark widget as editing (blocks CM6 from rebuilding it during edit)
  ;(widget as any)._editing = true

  // Create textarea
  const ta = document.createElement('textarea')
  ta.value = currentValue
  ta.className = 'block-editor-textarea'
  Object.assign(ta.style, {
    width: '100%',
    minHeight: '100px',
    display: 'block',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-mono,monospace)',
    fontSize: '13px',
    padding: '12px',
    border: '2px solid var(--color-primary,#1a56a8)',
    borderRadius: '6px',
    background: 'var(--color-bg-primary,#fff)',
    color: 'var(--color-text-primary,#1d1d1f)',
    resize: 'vertical',
    outline: 'none',
    lineHeight: '1.6'
  })

  // Create buttons
  const btns = document.createElement('div')
  btns.className = 'block-editor-buttons'
  Object.assign(btns.style, {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    justifyContent: 'flex-end'
  })

  const save = document.createElement('button')
  save.textContent = '保存'
  Object.assign(save.style, {
    padding: '4px 16px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-primary,#1a56a8)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px'
  })

  const cancel = document.createElement('button')
  cancel.textContent = '取消'
  Object.assign(cancel.style, {
    padding: '4px 16px',
    borderRadius: '6px',
    border: '1px solid var(--color-border,#e5e5ea)',
    background: 'var(--color-surface,#f5f5f7)',
    color: 'var(--color-text-secondary,#6e6e73)',
    cursor: 'pointer',
    fontSize: '13px'
  })

  btns.appendChild(cancel)
  btns.appendChild(save)
  dom.appendChild(ta)
  dom.appendChild(btns)
  ta.focus()

  // Key handlers on textarea
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      abortEdit()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.stopPropagation()
      confirmEdit(from, to)
    }
  })

  save.addEventListener('click', (e) => {
    e.stopPropagation()
    confirmEdit(from, to)
  })
  cancel.addEventListener('click', (e) => {
    e.stopPropagation()
    abortEdit()
  })

  _editing = { widget, dom, view, ta, btns }
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Dispatch content change and exit edit mode */
function confirmEdit(from: number, to: number): void {
  if (!_editing) return
  const { widget, view, dom, ta, btns } = _editing
  const newContent = ta.value

  // DOM cleanup FIRST (synchronously, before any CM6 callbacks)
  dom.removeChild(ta)
  if (btns.parentNode) dom.removeChild(btns)
  for (const child of Array.from(dom.children) as unknown as HTMLElement[]) {
    child.style.display = ''
  }

  // Mark not editing
  ;(widget as any)._editing = false
  _editing = null

  // Validate positions against CURRENT doc
  const docLen = view.state.doc.length
  if (from < 0 || to < 0 || from > docLen || to > docLen || from > to) {
    view.requestMeasure({ read: () => undefined })
    return
  }

  // Replace widget range with new content
  view.dispatch({ changes: { from, to, insert: newContent } })
}

/** Abort edit (cancel) and exit edit mode */
function abortEdit(): void {
  if (!_editing) return
  const { widget, view, dom, ta, btns } = _editing

  // DOM cleanup
  if (ta.parentNode) dom.removeChild(ta)
  if (btns.parentNode) dom.removeChild(btns)
  for (const child of Array.from(dom.children) as unknown as HTMLElement[]) {
    child.style.display = ''
  }

  // Mark not editing
  ;(widget as any)._editing = false
  _editing = null

  // Force StateField rebuild via no-op transaction at widget range
  // This fires docChanged=true → full decoration rebuild
  const docLen = view.state.doc.length
  const wfrom = (widget as any).from,
    wto = (widget as any).to
  if (wfrom !== undefined && wto !== undefined && wfrom >= 0 && wto <= docLen && wfrom <= wto) {
    view.dispatch({
      changes: { from: wfrom, to: wto, insert: view.state.sliceDoc(wfrom, wto) }
    })
  } else {
    view.requestMeasure({ read: () => undefined })
  }
}
