/**
 * useTableWidget.ts — Atomic Table Architecture
 *
 * WYSIWYG table editing via CM6 BlockWidget + Tab navigation.
 *
 * Pattern: WidgetType.toDOM(view) receives EditorView from CM6 automatically.
 * No globalThis needed — atomic-editor pattern.
 */
import { syntaxTree } from '@codemirror/language'
import { type EditorState, StateField, type Range, type Extension, Facet } from '@codemirror/state'
import { EditorView, Decoration, WidgetType, type DecorationSet } from '@codemirror/view'
import { treeGrowthEffect } from './useInlinePreview'

// ── Table Model ─────────────────────────────────────────────────────────────

interface TableModel {
  header: string[]
  rows: string[][]
}

/**
 * Find the Table node by walking up from any position inside a table.
 * resolveInner() often returns TableDelimiter / TableCell / etc.
 * We walk up until we hit Table or run out of parents.
 */
function findTableNode(state: EditorState, pos: number): any | null {
  try {
    let node: any = syntaxTree(state).resolveInner(pos, 1)
    for (let depth = 0; depth < 20 && node; depth++) {
      if (node.name === 'Table') return node
      if (!node.parent || node.name === 'Document') break
      node = node.parent
    }
  } catch (err) {
    console.warn('[findTableNode] error:', err)
  }
  return null
}

function collectCells(state: EditorState, cursor: any): string[] {
  const { doc } = state
  const cells: string[] = []
  const inner = cursor.node.cursor()
  if (!inner.firstChild()) return cells
  do {
    if (inner.name === 'TableCell') cells.push(doc.sliceString(inner.from, inner.to).trim())
  } while (inner.nextSibling())
  return cells
}

function parseTableModel(state: EditorState, tableNode: any): TableModel | null {
  // tableNode is guaranteed to be a Table node
  const header: string[] = []
  const rows: string[][] = []
  const cursor = tableNode.cursor()
  if (!cursor.firstChild()) {
    console.warn('[parseTableModel] Table has no children')
    return null
  }
  do {
    if (cursor.name === 'TableHeader') header.push(...collectCells(state, cursor))
    else if (cursor.name === 'TableRow') rows.push(collectCells(state, cursor))
  } while (cursor.nextSibling())

  // Promote first data row to header when header row is missing
  if (!header.length && rows.length) {
    header.push(...rows.shift()!)
  }
  if (!header.length) {
    console.warn('[parseTableModel] no header after promotion, rows:', rows.length)
    return null
  }
  return { header, rows }
}

/** Regex-based fallback parser when syntax tree fails. */
function parseTableFromRaw(raw: string): TableModel | null {
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return null
  const headerCells = lines[0]
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean)
  const sep = lines[1].replace(/\s/g, '')
  if (!/^\|?(:?-{3,}:?\|?)+$/.test(sep)) return null // not a separator line
  if (!headerCells.length) return null
  const rows = lines
    .slice(2)
    .map((line) =>
      line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean)
    )
    .filter((r) => r.length > 0)
  // Pad rows to match header column count
  for (const row of rows) {
    while (row.length < headerCells.length) row.push('')
  }
  return { header: headerCells, rows }
}

function serializeTable(model: TableModel): string {
  const colCount = model.header.length
  const lines: string[] = []
  lines.push('| ' + model.header.join(' | ') + ' |')
  lines.push('| ' + model.header.map(() => '---').join(' | ') + ' |')
  for (const row of model.rows) {
    const padded: string[] = []
    for (let c = 0; c < colCount; c++) padded.push(row[c] ?? '')
    lines.push('| ' + padded.join(' | ') + ' |')
  }
  return lines.join('\n')
}

// ── Tab Navigation ──────────────────────────────────────────────────────────

function getCellAtIndex(
  cells: HTMLElement[],
  rowIdx: number,
  colIdx: number,
  colCount: number
): HTMLElement | null {
  const idx = rowIdx * colCount + colIdx
  return cells[idx] ?? null
}

function getRowColIndex(cell: HTMLElement, _colCount: number): { row: number; col: number } | null {
  const tr = cell.closest<HTMLElement>('tr')
  const tbody = tr?.closest<HTMLElement>('tbody')
  if (!tr || !tbody) return null
  const row = Array.from(tbody.querySelectorAll<HTMLElement>('tr')).indexOf(tr)
  const col = Array.from(tr.querySelectorAll<HTMLElement>('th, td')).indexOf(cell)
  return { row, col }
}

function placeCaretAtEnd(el: HTMLElement): void {
  el.focus()
  const range = document.createRange()
  const sel = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function moveCellFocus(view: EditorView, cell: HTMLElement, dir: -1 | 1): void {
  const wrap = cell.closest<HTMLElement>('.cm-atomic-table')
  if (!wrap) return
  const cells = Array.from(wrap.querySelectorAll<HTMLElement>('th, td'))
  const colCount = parseInt(wrap.dataset.colCount ?? '0', 10)
  if (!colCount) return
  const pos = getRowColIndex(cell, colCount)
  if (!pos) return
  const { row, col } = pos
  const totalCols = colCount
  const totalRows = Math.floor(cells.length / totalCols)
  let nextCol = col + dir
  let nextRow = row
  if (nextCol < 0) {
    nextCol = totalCols - 1
    nextRow = row - 1
    if (nextRow < 0) return
  } else if (nextCol >= totalCols) {
    nextCol = 0
    nextRow = row + 1
    if (nextRow >= totalRows) {
      appendRow(view, wrap)
      return
    }
  }
  const nextCell = getCellAtIndex(cells, nextRow, nextCol, totalCols)
  if (nextCell) {
    nextCell.focus()
    placeCaretAtEnd(nextCell)
  }
}

function appendRow(view: EditorView, wrap: HTMLElement): void {
  const range = findTableRange(view, wrap)
  if (!range) return
  const model = readModelFromDom(wrap)
  model.rows.push(model.header.map(() => ''))
  const next = serializeTable(model)
  view.dispatch({ changes: { from: range.from, to: range.to, insert: next } })
  const { from } = range
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const tables = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-atomic-table'))
      let target: HTMLElement | null = null
      for (const el of tables) {
        try {
          if (view.posAtDOM(el) === from) {
            target = el
            break
          }
        } catch {
          /* posAtDOM throws on detached */
        }
      }
      if (!target) return
      const rows = target.querySelectorAll<HTMLElement>('tbody tr')
      const newRow = rows[rows.length - 1]
      const firstCell = newRow?.querySelector<HTMLElement>('td')
      if (firstCell) {
        firstCell.focus()
        placeCaretAtEnd(firstCell)
      }
    })
  })
}

function findTableRange(view: EditorView, wrap: HTMLElement): { from: number; to: number } | null {
  try {
    const from = view.posAtDOM(wrap)
    if (from < 0) return null
    let node = syntaxTree(view.state).resolveInner(from, 1)
    while (node && node.name !== 'Table' && node.name !== 'Document') {
      node = node.parent ?? null
    }
    if (node?.name !== 'Table') return null
    return { from: node?.from, to: node?.to }
  } catch {
    return null
  }
}

function readModelFromDom(wrap: HTMLElement): TableModel {
  const header = Array.from(wrap.querySelectorAll<HTMLElement>('thead th')).map(
    (el) => el.textContent ?? ''
  )
  const rows = Array.from(wrap.querySelectorAll<HTMLElement>('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll<HTMLElement>('td')).map((td) => td.textContent ?? '')
  )
  return { header, rows }
}

// ── Table Context Menu ─────────────────────────────────────────────────────────

type TableMenuItem = { label: string; action: () => void } | 'separator'

function cellRowIndex(cell: HTMLElement): number {
  const tr = cell.closest<HTMLElement>('tr')
  const tbody = tr?.closest<HTMLElement>('tbody')
  if (!tr || !tbody) return -1
  return Array.from(tbody.querySelectorAll<HTMLElement>('tr')).indexOf(tr)
}

function cellColIndex(cell: HTMLElement): number {
  const tr = cell.closest<HTMLElement>('tr')
  if (!tr) return -1
  return Array.from(tr.querySelectorAll<HTMLElement>('th, td')).indexOf(cell)
}

function dispatchTableModel(
  view: EditorView,
  wrap: HTMLElement,
  from: number,
  to: number,
  nextModel: TableModel
): void {
  const next = serializeTable(nextModel)
  view.dispatch({ changes: { from, to, insert: next } })
}

function openCellMenu(
  view: EditorView,
  cell: HTMLElement,
  tableFrom: number,
  tableTo: number,
  x: number,
  y: number
): void {
  const existing = document.querySelector('.cm-atomic-table-menu')
  if (existing) existing.remove()

  const wrap = cell.closest<HTMLElement>('.cm-atomic-table')
  if (!wrap) return
  const isHeader = cell.tagName === 'TH'
  const row = cellRowIndex(cell)
  const col = cellColIndex(cell)

  const menu = document.createElement('div')
  menu.className = 'cm-atomic-table-menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  document.body.appendChild(menu)

  const items: TableMenuItem[] = []

  if (!isHeader) {
    items.push({
      label: '在上方插入行',
      action: () => {
        const m = readModelFromDom(wrap)
        m.rows.splice(
          row,
          0,
          m.header.map(() => '')
        )
        dispatchTableModel(view, wrap, tableFrom, tableTo, m)
      }
    })
    items.push({
      label: '在下方插入行',
      action: () => {
        const m = readModelFromDom(wrap)
        m.rows.splice(
          row + 1,
          0,
          m.header.map(() => '')
        )
        dispatchTableModel(view, wrap, tableFrom, tableTo, m)
      }
    })
    items.push({
      label: '删除行',
      action: () => {
        const m = readModelFromDom(wrap)
        if (row >= 0 && row < m.rows.length) m.rows.splice(row, 1)
        dispatchTableModel(view, wrap, tableFrom, tableTo, m)
      }
    })
    items.push('separator')
  }

  items.push({
    label: '在左侧插入列',
    action: () => {
      const m = readModelFromDom(wrap)
      m.header.splice(col, 0, '')
      for (const r of m.rows) r.splice(col, 0, '')
      dispatchTableModel(view, wrap, tableFrom, tableTo, m)
    }
  })
  items.push({
    label: '在右侧插入列',
    action: () => {
      const m = readModelFromDom(wrap)
      m.header.splice(col + 1, 0, '')
      for (const r of m.rows) r.splice(col + 1, 0, '')
      dispatchTableModel(view, wrap, tableFrom, tableTo, m)
    }
  })
  items.push({
    label: '删除列',
    action: () => {
      const m = readModelFromDom(wrap)
      if (m.header.length <= 1 || col < 0) return
      m.header.splice(col, 1)
      for (const r of m.rows) r.splice(col, 1)
      dispatchTableModel(view, wrap, tableFrom, tableTo, m)
    }
  })

  const dismiss = () => {
    menu.remove()
    document.removeEventListener('mousedown', onDocDown, true)
    document.removeEventListener('keydown', onDocKey, true)
  }
  const onDocDown = (event: MouseEvent) => {
    if (!menu.contains(event.target as Node)) {
      event.preventDefault()
      dismiss()
    }
  }
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss()
  }

  for (const item of items) {
    if (item === 'separator') {
      const sep = document.createElement('div')
      sep.className = 'cm-atomic-table-menu-sep'
      menu.appendChild(sep)
    } else {
      const btn = document.createElement('button')
      btn.className = 'cm-atomic-table-menu-item'
      btn.textContent = item.label
      btn.addEventListener('click', () => {
        item.action()
        dismiss()
      })
      menu.appendChild(btn)
    }
  }

  setTimeout(() => {
    document.addEventListener('mousedown', onDocDown, true)
    document.addEventListener('keydown', onDocKey, true)
  }, 0)
}

// ── Table Widget (atomic pattern: view in toDOM) ────────────────────────────

class TableWidget extends WidgetType {
  constructor(
    private _from: number,
    private _to: number
  ) {
    super()
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'cm-atomic-table'
    wrap.setAttribute('contenteditable', 'false')

    const state = view.state

    // Step 1: Try to find the Table node via syntax tree
    let tableNode = findTableNode(state, this._from)

    // Step 2: If that fails, try at the middle of the range
    if (!tableNode) {
      const mid = Math.floor((this._from + this._to) / 2)
      tableNode = findTableNode(state, mid)
    }

    // Step 3: Parse model
    let tableData: TableModel | null = null
    if (tableNode) {
      tableData = parseTableModel(state, tableNode)
    }

    // Step 4: Regex fallback
    if (!tableData) {
      const raw = state.doc.sliceString(this._from, this._to)
      tableData = parseTableFromRaw(raw)
      if (!tableData) {
        wrap.innerHTML = '<span class="cm-atomic-table-error">Invalid table</span>'
        return wrap
      }
    }

    wrap.dataset.colCount = String(tableData.header.length)

    const table = document.createElement('table')
    wrap.appendChild(table)
    this._renderTable(table, tableData, view)
    return wrap
  }

  private _renderTable(table: HTMLTableElement, data: TableModel, view: EditorView): void {
    table.innerHTML = ''
    const thead = table.createTHead()
    const hrow = thead.insertRow()
    for (const h of data.header) {
      const th = document.createElement('th')
      th.setAttribute('contenteditable', 'true')
      th.textContent = h
      this._attachCellHandlers(th, view)
      hrow.appendChild(th)
    }
    const tbody = table.createTBody()
    for (const row of data.rows) {
      const tr = tbody.insertRow()
      for (let i = 0; i < data.header.length; i++) {
        const td = tr.insertCell()
        td.setAttribute('contenteditable', 'true')
        td.textContent = row[i] ?? ''
        this._attachCellHandlers(td, view)
      }
    }
  }

  private _attachCellHandlers(cell: HTMLElement, view: EditorView): void {
    const tableFrom = this._from,
      tableTo = this._to

    const inputHandler = () => {
      const model = readModelFromDom(cell.closest<HTMLElement>('.cm-atomic-table')!)
      const md = serializeTable(model)
      view.dispatch({ changes: { from: tableFrom, to: tableTo, insert: md } })
    }
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        moveCellFocus(view, cell, e.shiftKey ? -1 : 1)
      }
    }
    const contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      openCellMenu(view, cell, tableFrom, tableTo, e.clientX, e.clientY)
    }
    cell.addEventListener('input', inputHandler)
    cell.addEventListener('keydown', keydownHandler)
    cell.addEventListener('contextmenu', contextMenuHandler)
  }

  eq(_other: TableWidget): boolean {
    // Always return false to force CM6 to call toDOM on every update.
    // Since updateDOM returns false, this is the only way to get fresh content.
    return false
  }

  updateDOM(): boolean {
    return false
  }
}

// ── StateField ──────────────────────────────────────────────────────────────

const tableDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state)
  },
  update(deco, tr) {
    if (tr.docChanged || tr.selectionSet) return buildTableDecorations(tr.state)
    for (const e of tr.effects) {
      if (e.is(treeGrowthEffect)) return buildTableDecorations(tr.state)
    }
    return deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f)
})

function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = []
  syntaxTree(state).iterate({
    from: 0,
    to: state.doc.length,
    enter(node) {
      if (node.name !== 'Table') return
      const widget = new TableWidget(node.from, node.to)
      ranges.push(Decoration.replace({ widget, block: true }).range(node.from, node.to))
    }
  })
  return Decoration.set(
    ranges.sort((a, b) => a.from - b.from),
    true
  )
}

// ── Extension ──────────────────────────────────────────────────────────────

/**
 * Per-view facet so any widget's pointerdown handler can look up the
 * current link-click callback without threading config through constructors.
 * Based on atomic-editor's tableLinkClickFacet.
 */
export const tableLinkClickFacet = Facet.define<(url: string) => void, (url: string) => void>({
  combine: (values) => values[0] ?? defaultLinkOpener
})

function defaultLinkOpener(url: string): void {
  window.open(url, '_blank', 'noopener')
}

export function tableWidgetExtension(): Extension {
  return [tableDecorationField]
}
