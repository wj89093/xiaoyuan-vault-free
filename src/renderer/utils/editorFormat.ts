/**
 * editorFormat.ts — CodeMirror 6 text-formatting utilities for context menu & keyboard shortcuts
 *
 * All format commands operate on the current selection and use CM6 transactions
 * so undo history is preserved. Callers pass the EditorView instance.
 */
import type { EditorView } from '@codemirror/view'

type FormatParams = Record<string, any>

function wrapSelection(view: EditorView, before: string, after: string = before): boolean {
  const { from, to } = view.state.selection.main
  if (from === to) {
    // No selection — cursor is between markers
    const insert = before + after
    view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + before.length } })
    return true
  }
  const selected = view.state.sliceDoc(from, to)
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: to + before.length }
  })
  return true
}

function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const lineText = line.text

  if (lineText.startsWith(prefix)) {
    // Remove prefix
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: '' }
    })
  } else {
    // Add prefix
    view.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix }
    })
  }
  return true
}

function insertBlock(view: EditorView, block: string, cursorOffset: number = 0): boolean {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  // Always insert on a new line before the current line, unless already empty
  const insertAt = line.from === 1 ? line.from : line.from - 1
  const text = (insertAt === 1 ? '' : '\n') + block + '\n'
  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert: text },
    selection: { anchor: insertAt + block.length + 1 + cursorOffset }
  })
  return true
}

export interface EditorFormatCommands {
  bold: () => boolean
  italic: () => boolean
  code: () => boolean
  link: () => boolean
  quote: () => boolean
  h1: () => boolean
  h2: () => boolean
  h3: () => boolean
  codeblock: () => boolean
  image: () => boolean
  table: () => boolean
  hr: () => boolean
}

export function createFormatCommands(view: EditorView): EditorFormatCommands {
  return {
    bold: () => wrapSelection(view, '**'),
    italic: () => wrapSelection(view, '_'),
    code: () => wrapSelection(view, '`'),
    link: () => {
      const { from, to } = view.state.selection.main
      const selected = view.state.sliceDoc(from, to)
      const url = prompt('输入链接 URL:', selected.startsWith('http') ? selected : 'https://')
      if (!url) return false
      const insert = selected ? `[${selected}](${url})` : `[链接文本](${url})`
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } })
      return true
    },
    quote: () => toggleLinePrefix(view, '> '),
    h1: () => toggleLinePrefix(view, '# '),
    h2: () => toggleLinePrefix(view, '## '),
    h3: () => toggleLinePrefix(view, '### '),
    codeblock: () =>
      insertBlock(
        view,
        '```\n\n```',
        -4 // cursor inside
      ),
    image: () => {
      const src = prompt('输入图片 URL:')
      if (!src) return false
      const alt = prompt('输入图片描述（可选）:', 'image') ?? 'image'
      const insert = `![${alt}](${src})`
      const { to } = view.state.selection.main
      view.dispatch({
        changes: { from: to, to, insert },
        selection: { anchor: to + insert.length }
      })
      return true
    },
    table: () =>
      insertBlock(view, '| 列1 | 列2 | 列3 |\n|------|------|------|\n| 内容 | 内容 | 内容 |', -2),
    hr: () => {
      const { from } = view.state.selection.main
      const line = view.state.doc.lineAt(from)
      const insertAt = line.from === 1 ? line.from : line.from - 1
      const text = (insertAt === 1 ? '' : '\n') + '---\n'
      view.dispatch({ changes: { from: insertAt, to: insertAt, insert: text } })
      return true
    }
  }
}

/**
 * Dispatch a format command by name (used by context menu & future shortcut system)
 */
export function dispatchFormat(view: EditorView, command: string, params?: FormatParams): boolean {
  const cmds = createFormatCommands(view)
  switch (command) {
    case 'bold':
      return cmds.bold()
    case 'italic':
      return cmds.italic()
    case 'code':
      return cmds.code()
    case 'link':
      return cmds.link()
    case 'quote':
      return cmds.quote()
    case 'heading':
      return params?.level === 1 ? cmds.h1() : params?.level === 2 ? cmds.h2() : cmds.h3()
    case 'h1':
      return cmds.h1()
    case 'h2':
      return cmds.h2()
    case 'h3':
      return cmds.h3()
    case 'codeblock':
      return cmds.codeblock()
    case 'image':
      return cmds.image()
    case 'table':
      return cmds.table()
    case 'hr':
      return cmds.hr()
    default:
      return false
  }
}
