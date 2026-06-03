/**
 * useFrontmatterWidget.ts — Frontmatter Form UI (Noteriv-inspired)
 *
 * Replaces contentEditable divs with type-aware form controls:
 * - string  → text input
 * - number  → number input
 * - date    → date input
 * - boolean → checkbox
 * - tags    → pill editor
 * - enum    → select dropdown
 */
import { Decoration, type EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import {
  parseFrontmatter as parseFm,
  serializeFrontmatter as fmSerialize,
  getFieldSchema,
  COMMON_PROPERTIES,
  type ParsedField,
  type FrontmatterMatch
} from './frontmatter-utils'
import { registerFrontmatterBuilder } from './blockDecorationsField'

// ── Detection ─────────────────────────────────────────────────────────

function findFrontmatter(state: EditorState): FrontmatterMatch | null {
  const doc = state.doc
  if (doc.length < 8 || doc.sliceString(0, 3) !== '---') return null
  let close = -1
  for (let p = 3; p < doc.length - 3; p++)
    if (doc.sliceString(p, p + 4) === '\n---') {
      close = p + 4
      break
    }
  if (close < 0) return null
  const raw = doc.sliceString(3, close - 4)
  const fields = parseFm(raw)
  // Allow empty fields (new document with just ---\n---)
  if (!raw.trim()) return { from: 0, to: close, raw: '', fields: [] }
  return { from: 0, to: close, raw, fields }
}

// ── Autocompletion ────────────────────────────────────────────────────

export function frontmatterCompletion(context: CompletionContext): CompletionResult | null {
  const node = syntaxTree(context.state).resolveInner(context.pos)
  if (!node.name.includes('frontmatter') && node.name !== 'Document') {
    const match = findFrontmatter(context.state)
    if (!match) return null
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    if (!before.match(/^\s*\w*:?\s*$/) && !before.match(/^\s*$/)) return null
  }

  const word = context.matchBefore(/\w*/)
  if (!word) return null

  const match = findFrontmatter(context.state)
  const existingKeys = new Set(match?.fields.map((f) => f.key) ?? [])

  return {
    from: word.from,
    options: COMMON_PROPERTIES.filter((k) => !existingKeys.has(k)).map((k) => ({
      label: k,
      type: 'property' as const,
      detail: 'frontmatter'
    })),
    validFor: /^\w*$/
  }
}

// ── Widget ─────────────────────────────────────────────────────────────

class FrontmatterWidget extends WidgetType {
  private collapsed = false

  constructor(
    private fields: ParsedField[],
    private range: { from: number; to: number }
  ) {
    super()
  }

  eq(o: FrontmatterWidget): boolean {
    return o.range.from === this.range.from && o.range.to === this.range.to
  }

  updateDOM(): boolean {
    return false
  }

  toDOM(view: EditorView): HTMLElement {
    (this as any).view = view
    const root = el('div', 'cm-fm-card')
    const titleF = this.fields.find((f) => f.key === 'title')
    const others = this.fields.filter((f) => f.key !== 'title')
    // Complex fields (nested objects) are preserved but not editable in form
    const editable = others.filter((f) => f.type !== 'complex')
    const complex = others.filter((f) => f.type === 'complex')

    // ── Title Block (above the card) ──
    const titleBlock = el('div', 'cm-fm-title-block')
    if (titleF) {
      const titleInput = el('input', 'cm-fm-title-input') as HTMLInputElement
      titleInput.type = 'text'
      titleInput.value = String(titleF.value ?? '')
      titleInput.placeholder = 'Untitled'
      titleInput.addEventListener('change', () =>
        this.sync(titleBlock.closest<HTMLElement>('.cm-fm-card')!)
      )
      titleInput.addEventListener('blur', () =>
        this.sync(titleBlock.closest<HTMLElement>('.cm-fm-card')!)
      )
      titleBlock.append(titleInput)
    }

    // ── Card Header ──
    const hdr = el('div', 'cm-fm-header')
    const startMrk = el('span', 'cm-fm-marker', '---')
    const lbl = el('span', 'cm-fm-label', 'Properties')
    const totalCount = editable.length + complex.length
    const countBadge = totalCount ? el('span', 'cm-fm-count', `(${totalCount})`) : null
    const endMrk = el('span', 'cm-fm-marker', '---')
    const ch = el('span', 'cm-fm-chevron', '▾')
    hdr.append(startMrk, lbl)
    if (countBadge) hdr.append(countBadge)
    hdr.append(endMrk, ch)

    // ── Card Body ──
    const body = el('div', 'cm-fm-body')
    if (this.collapsed) body.style.display = 'none'

    // Divider between title and fields
    if (editable.length || complex.length) body.append(el('div', 'cm-fm-divider'))

    // Read-only complex fields (relationships, openThreads, etc.)
    for (const f of complex) {
      body.append(this.buildComplexFieldRow(f))
    }

    // Editable form fields
    for (const f of editable) {
      body.append(this.buildFieldRow(f))
    }

    // Actions footer
    const footer = el('div', 'cm-fm-footer')
    const addBtn = el('button', 'cm-fm-add-btn')
    addBtn.textContent = '+ Add property'
    addBtn.type = 'button'
    addBtn.addEventListener('click', (e) => {
      e.preventDefault()
      this.addEmptyField(body)
    })
    footer.append(addBtn)
    body.append(footer)

    root.append(titleBlock, hdr, body)

    // Toggle collapse
    hdr.addEventListener('click', (e) => {
      const tgt = e.target as HTMLElement
      if (tgt.closest('button') || tgt.closest('input') || tgt.closest('select')) return
      this.collapsed = !this.collapsed
      body.style.display = this.collapsed ? 'none' : ''
      ch.textContent = this.collapsed ? '▸' : '▾'
    })

    return root
  }

  // ── Sync back to document ──────────────────────────────────────────
  private sync(root: HTMLElement) {
    if (!(this as any).view) return
    const result = this.collectFormData(root)
        // @ts-expect-error - serializeFrontmatter inference issue in class context
    const yml = (fmSerialize as (t: string, f: unknown[]) => string)(result.title, result.fields)
    (this as any).view.dispatch({ changes: { from: this.range.from, to: this.range.to, insert: yml } })
  }

  private collectFormData(root: HTMLElement): { title: string; fields: ParsedField[] } {
    const title = qs<HTMLInputElement>(root, '.cm-fm-title-input')?.value.trim() ?? ''
    const fields: ParsedField[] = []

    // Preserve complex fields (not editable in form, passed through as-is)
    for (const f of this.fields) {
      if (f.type === 'complex') fields.push({ ...f })
    }

    root.querySelectorAll<HTMLElement>('.cm-fm-field-row').forEach((row) => {
      if (!row.dataset.key && row.dataset['new'] === 'true') {
        // New empty field - extract from DOM
        const keyInput = qs<HTMLInputElement>(row, '.cm-fm-key-input')
        const key = keyInput?.value.trim() ?? ''
        if (!key) return
        const type = row.dataset.type ?? 'string'
        const value = this.extractFieldValue(row, type)
        const schema = getFieldSchema(key)
        fields.push({
          key,
          value,
          raw: key,
          type: schema?.type ?? (type as any),
          isList: type === 'tags',
          items: type === 'tags' ? this.extractTags(row) : undefined,
          options: schema?.options
        })
        return
      }

      const key = row.dataset.key!
      if (!key) return
      const fType = row.dataset.type ?? 'string'
      const value = this.extractFieldValue(row, fType)
      const schema = getFieldSchema(key)
      fields.push({
        key,
        value,
        raw: key,
        type: schema?.type ?? (fType as any),
        isList: fType === 'tags',
        items: fType === 'tags' ? this.extractTags(row) : undefined,
        options: schema?.options
      })
    })

    return { title, fields }
  }

  private extractFieldValue(row: HTMLElement, type: string): unknown {
    switch (type) {
      case 'boolean': {
        const cb = qs<HTMLInputElement>(row, '.cm-fm-checkbox')
        return cb?.checked ?? false
      }
      case 'number': {
        const inp = qs<HTMLInputElement>(row, '.cm-fm-number-input')
        const v = inp?.value.trim()
        return v ? Number(v) : ''
      }
      case 'date': {
        const inp = qs<HTMLInputElement>(row, '.cm-fm-date-input')
        return inp?.value.trim() ?? ''
      }
      case 'tags': {
        const items = this.extractTags(row)
        return items.join(', ')
      }
      case 'enum': {
        const sel = qs<HTMLSelectElement>(row, '.cm-fm-select')
        return sel?.value ?? ''
      }
      default:
        return qs<HTMLInputElement>(row, '.cm-fm-text-input')?.value ?? ''
    }
  }

  private extractTags(row: HTMLElement): string[] {
    const pills = row.querySelectorAll<HTMLElement>('.cm-fm-pill-text')
    return Array.from(pills, (p) => p.textContent ?? '').filter(Boolean)
  }

  // ── Add empty field ─────────────────────────────────────────────────
  private addEmptyField(body: HTMLElement) {
    const footer = body.querySelector<HTMLElement>('.cm-fm-footer')
    const row = this.buildEmptyFieldRow()
    body.insertBefore(row, footer)
    qs<HTMLInputElement>(row, '.cm-fm-key-input')?.focus()
  }

  // ── Builders ────────────────────────────────────────────────────────

  private buildTitleBar(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-field-title')
    const label = el('label', 'cm-fm-field-label', 'Title')
    const input = el('input', 'cm-fm-text-input') as HTMLInputElement
    input.type = 'text'
    input.name = 'title'
    input.value = String(f.value ?? '')
    input.placeholder = 'Document title'
    input.addEventListener('change', () => this.sync(wrap.closest<HTMLElement>('.cm-fm-card')!))
    input.addEventListener('blur', () => this.sync(wrap.closest<HTMLElement>('.cm-fm-card')!))
    wrap.append(label, input)
    return wrap
  }

  private buildComplexFieldRow(f: ParsedField): HTMLElement {
    const row = el('div', 'cm-fm-field-row cm-fm-field-complex')
    row.dataset.key = f.key
    row.dataset.type = 'complex'

    const keyArea = el('div', 'cm-fm-key-area')
    const label = el('label', 'cm-fm-field-label', f.key)
    const hint = el('span', 'cm-fm-hint', 'complex · read-only')
    keyArea.append(label, hint)

    const valueArea = el('div', 'cm-fm-value-area')
    const preview = el('span', 'cm-fm-complex-preview', '(nested object — edit in raw YAML)')
    valueArea.append(preview)

    row.append(keyArea, valueArea)
    return row
  }

  private buildFieldRow(f: ParsedField): HTMLElement {
    const schema = getFieldSchema(f.key)
    const type = schema?.type ?? f.type

    const row = el('div', 'cm-fm-field-row')
    row.dataset.key = f.key
    row.dataset.type = type

    const keyArea = el('div', 'cm-fm-key-area')
    const keyLabel = el('label', 'cm-fm-field-label', schema?.label ?? f.key)
    const keyHint = schema?.hint ? el('span', 'cm-fm-hint', schema.hint) : undefined
    keyArea.append(keyLabel)
    if (keyHint) keyArea.append(keyHint)

    row.append(keyArea)
    row.append(this.buildValueControl(f, type))
    return row
  }

  private buildEmptyFieldRow(): HTMLElement {
    const row = el('div', 'cm-fm-field-row cm-fm-field-new')
    row.dataset.new = 'true'
    row.dataset.type = 'string'

    const keyArea = el('div', 'cm-fm-key-area')
    const keyInput = el('input', 'cm-fm-key-input') as HTMLInputElement
    keyInput.type = 'text'
    keyInput.placeholder = 'key...'
    keyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        // Move focus to value control
        const next = row.querySelector<HTMLElement>(
          '.cm-fm-text-input, .cm-fm-checkbox, .cm-fm-select, .cm-fm-date-input, .cm-fm-number-input'
        )
        next?.focus()
      }
    })
    keyArea.append(keyInput)
    row.append(keyArea)

    const valWrap = el('div', 'cm-fm-value-area')
    const input = el('input', 'cm-fm-text-input') as HTMLInputElement
    input.type = 'text'
    input.placeholder = 'value...'
    input.addEventListener('change', () => {
      // Auto-update key from typed value
      const typedKey = keyInput.value.trim()
      if (typedKey) {
        row.dataset.key = typedKey
        const schema = getFieldSchema(typedKey)
        if (schema?.type && schema.type !== 'string') {
          row.dataset.type = schema.type
          // Swap control to match type
          valWrap.innerHTML = ''
          valWrap.append(
            this.buildValueControl(
              {
                key: typedKey,
                value: '',
                raw: typedKey,
                type: schema.type,
                options: schema.options
              },
              schema.type
            )
          )
        }
      }
      this.sync(row.closest<HTMLElement>('.cm-fm-card')!)
    })
    valWrap.append(input)
    row.append(valWrap)

    // Delete button
    const delBtn = el('button', 'cm-fm-del-btn')
    delBtn.textContent = '×'
    delBtn.type = 'button'
    delBtn.addEventListener('click', () => {
      row.remove()
      this.sync(row.closest<HTMLElement>('.cm-fm-card')!)
    })
    row.append(delBtn)

    return row
  }

  private buildValueControl(f: ParsedField, type: string): HTMLElement {
    switch (type) {
      case 'boolean':
        return this.buildBoolControl(f)
      case 'number':
        return this.buildNumControl(f)
      case 'date':
        return this.buildDateControl(f)
      case 'tags':
        return this.buildTagsControl(f)
      case 'enum':
        return this.buildSelectControl(f)
      default:
        return this.buildTextControl(f)
    }
  }

  private buildTextControl(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-value-area')
    const input = el('input', 'cm-fm-text-input') as HTMLInputElement
    input.type = 'text'
    input.value = String(f.value ?? '')
    input.placeholder = 'value...'
    input.addEventListener('change', () => this.sync(input.closest<HTMLElement>('.cm-fm-card')!))
    input.addEventListener('blur', () => this.sync(input.closest<HTMLElement>('.cm-fm-card')!))
    wrap.append(input)
    return wrap
  }

  private buildNumControl(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-value-area')
    const input = el('input', 'cm-fm-number-input') as HTMLInputElement
    input.type = 'number'
    input.value = f.value !== '' && f.value !== null && f.value !== undefined ? String(f.value) : ''
    input.placeholder = '0'
    input.addEventListener('change', () => this.sync(input.closest<HTMLElement>('.cm-fm-card')!))
    wrap.append(input)
    return wrap
  }

  private buildDateControl(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-value-area')
    const input = el('input', 'cm-fm-date-input') as HTMLInputElement
    input.type = 'date'
    input.value = String(f.value ?? '')
    input.placeholder = 'YYYY-MM-DD'
    input.addEventListener('change', () => this.sync(input.closest<HTMLElement>('.cm-fm-card')!))
    wrap.append(input)
    return wrap
  }

  private buildBoolControl(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-value-area cm-fm-bool-area')
    const label = el('label', 'cm-fm-check-wrap')
    const input = el('input', 'cm-fm-checkbox') as HTMLInputElement
    input.type = 'checkbox'
    const val = String(f.value ?? '')
    input.checked = val === 'true' || val === 'yes' || val === 'on'
    input.addEventListener('change', () => this.sync(input.closest<HTMLElement>('.cm-fm-card')!))
    const txt = el('span', 'cm-fm-check-label', input.checked ? 'Yes' : 'No')
    input.addEventListener('change', () => {
      txt.textContent = input.checked ? 'Yes' : 'No'
    })
    label.append(input, txt)
    wrap.append(label)
    return wrap
  }

  private buildSelectControl(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-value-area')
    const select = el('select', 'cm-fm-select') as HTMLSelectElement
    const options = f.options ?? getFieldSchema(f.key)?.options ?? []
    // Add empty option
    const emptyOpt = el('option', '')
    emptyOpt.value = ''
    emptyOpt.textContent = '—'
    select.append(emptyOpt)
    for (const opt of options) {
      const o = el('option', '')
      o.value = opt
      o.textContent = opt
      if (String(f.value) === opt) o.selected = true
      select.append(o)
    }
    select.value = String(f.value ?? '')
    select.addEventListener('change', () => this.sync(select.closest<HTMLElement>('.cm-fm-card')!))
    wrap.append(select)
    return wrap
  }

  private buildTagsControl(f: ParsedField): HTMLElement {
    const wrap = el('div', 'cm-fm-value-area cm-fm-tags-area')
    const existingItems =
      f.items ??
      (typeof f.value === 'string' && f.value
        ? f.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [])

    const renderPills = () => {
      // Update pill list from DOM (after user edits) or from field data
      let pillList = wrap.querySelector<HTMLElement>('.cm-fm-pills')
      if (!pillList) {
        pillList = el('div', 'cm-fm-pills')
        wrap.insertBefore(pillList, wrap.querySelector('.cm-fm-pill-input'))
      }
      // Collect current tags from the field row if it exists in DOM
      const row = wrap.closest<HTMLElement>('.cm-fm-field-row')
      const tags = row ? this.extractTags(row) : []
      const displayTags = tags.length ? tags : existingItems
      pillList.innerHTML = ''
      for (const item of displayTags) {
        const pill = el('span', 'cm-fm-pill')
        const text = el('span', 'cm-fm-pill-text')
        text.textContent = item
        text.contentEditable = 'false'
        const xBtn = el('span', 'cm-fm-pill-x')
        xBtn.textContent = '×'
        xBtn.addEventListener('click', () => {
          pill.remove()
          this.sync(xBtn.closest<HTMLElement>('.cm-fm-card')!)
          renderPills()
        })
        pill.append(text, xBtn)
        pillList!.append(pill)
      }
    }

    const input = el('input', 'cm-fm-pill-input') as HTMLInputElement
    input.type = 'text'
    input.placeholder = existingItems.length ? 'Add tag...' : 'tags...'
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        const val = input.value.trim()
        if (val) {
          const pill = el('span', 'cm-fm-pill')
          const text = el('span', 'cm-fm-pill-text')
          text.textContent = val
          text.contentEditable = 'false'
          const xBtn = el('span', 'cm-fm-pill-x')
          xBtn.textContent = '×'
          xBtn.addEventListener('click', () => {
            pill.remove()
            this.sync(xBtn.closest<HTMLElement>('.cm-fm-card')!)
          })
          pill.append(text, xBtn)
          const pillList = wrap.querySelector<HTMLElement>('.cm-fm-pills')
          if (pillList) pillList.append(pill)
          else wrap.insertBefore(el('div', 'cm-fm-pills', ''), input)
          wrap.querySelector<HTMLElement>('.cm-fm-pills')?.append(pill)
          input.value = ''
          this.sync(input.closest<HTMLElement>('.cm-fm-card')!)
        }
      }
    })
    input.addEventListener('blur', () => this.sync(input.closest<HTMLElement>('.cm-fm-card')!))

    // Add existing items as pills
    renderPills()
    wrap.append(input)
    return wrap
  }

  get estimatedHeight(): number {
    if (this.collapsed) return 44 // title block only
    const hasTitle = this.fields.some((f) => f.key === 'title')
    const n = this.fields.filter((f) => f.key !== 'title').length
    return (hasTitle ? 44 : 0) + 32 + n * 36 + 16 + 40
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function qs<T extends HTMLElement>(root: HTMLElement, selector: string): T | null {
  return root.querySelector<T>(selector)
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

// ── Builder ────────────────────────────────────────────────────────────

function buildFrontmatterDecorations(state: EditorState): DecorationSet {
  const m = findFrontmatter(state)
  if (!m) return Decoration.none
  return Decoration.set([
    Decoration.replace({
      widget: new FrontmatterWidget(m.fields, { from: m.from, to: m.to }),
      block: true
    }).range(m.from, m.to)
  ])
}

// ── Registration ──────────────────────────────────────────────────────

registerFrontmatterBuilder(buildFrontmatterDecorations)
