/**
 * useMermaidWidget.ts — Inline Mermaid diagram rendering in CodeMirror 6
 *
 * Detects fenced code blocks with language tags (mermaid, architecture, etc.)
 * and replaces them with a live rendered SVG widget.
 *
 * Features:
 *   - estimatedHeight: prevents CM6 viewport miscalculation
 *   - synchronous render: diagram renders immediately on widget insert
 *   - error fallback: shows error state in widget if mermaid parse fails
 */
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@codemirror/language'
import {
  Decoration,
  WidgetType,
  type EditorView,
  type Rect,
  type DecorationSet
} from '@codemirror/view'
import type { EditorState, Range } from '@codemirror/state'
import { registerMermaidBuilder, blockDecorationsField } from './blockDecorationsField'
import { callEdit } from './editorRegistry'

// ── Supported diagram languages ─────────────────────────────────────────────

const SUPPORTED_LANGS = new Set([
  'mermaid',
  'graph',
  'flowchart',
  'architecture',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'requirementDiagram',
  'journey',
  'gitGraph',
  'pie',
  'mindmap'
])

// ── MermaidWidget ─────────────────────────────────────────────────────────────

class MermaidWidget extends WidgetType {
  private _from: number
  private _to: number
  private _getDoc: () => string
  private _lang: string
  private _code: string
  private _view: EditorView | null = null

  constructor(from: number, to: number, getDoc: () => string, lang: string, code: string) {
    super()
    this._from = from
    this._to = to
    this._getDoc = getDoc
    this._lang = lang
    this._code = code
  }

  get from(): number {
    return this._from
  }
  get to(): number {
    return this._to
  }

  getValue(): string {
    // Return the full fenced code block text
    const doc = this._getDoc()
    return doc.slice(this._from, this._to)
  }

  get estimatedHeight(): number {
    // Approximate: 20px per line + header/footer padding
    const lines = this._code.split('\n').length
    return Math.max(80, lines * 20 + 40)
  }

  toDOM(view: EditorView): HTMLElement {
    this._view = view
    const wrapper = document.createElement('div')
    wrapper.className = 'cm-mermaid-widget'
    wrapper.setAttribute('data-lang', this._lang)

    const container = document.createElement('div')
    container.className = 'mermaid-container'
    container.setAttribute('data-code', this._code)
    wrapper.appendChild(container)

    // Render immediately on insert (synchronous, not lazy)
    void renderMermaidWidget(wrapper, container, this._code, this._lang)

    wrapper.addEventListener('dblclick', (_e) => {
      callEdit('mermaid', this as any, wrapper, view)
    })
    return wrapper
  }

  updateDOM(dom: HTMLElement, _view: EditorView): boolean {
    if ((this as any)._editing) return true
    // If code changed, re-render
    const container = dom.querySelector('.mermaid-container') as HTMLElement | null
    if (container && container.getAttribute('data-code') !== this._code) {
      container.setAttribute('data-code', this._code)
      void renderMermaidInWidget(container, this._code, this._lang)
    }
    return true
  }

  coordsAt(dom: HTMLElement, pos: number, side: number): Rect | null {
    if (!this._view) return dom.getBoundingClientRect()
    const abs = this._from + pos
    return this._view.coordsAt(abs, side) ?? dom.getBoundingClientRect()
  }

  ignoreEvent(): boolean {
    return true
  }

  destroy(): void {
    /* no cleanup needed */
  }
}

// ── Mermaid Renderer (client-side) ──────────────────────────────────────────

function isDarkMode(): boolean {
  const el = document.querySelector('[data-theme="dark"]')
  if (el) return true
  // Fallback: check CSS variable
  const bg = getComputedStyle(document.body).getPropertyValue('--color-bg-primary').trim()
  return bg === 'transparent' || bg === '' ? false : parseInt(bg) < 128
}

async function renderMermaidInWidget(
  container: HTMLElement,
  code: string,
  lang: string
): Promise<void> {
  if (!code.trim()) {
    container.innerHTML = '<div class="mermaid-empty">Diagram code is empty</div>'
    return
  }

  try {
    const { default: mermaid } = await import('mermaid')
    if (!mermaid) throw new Error('Mermaid failed to load')

    // v1.5: theme: 'base' + themeVariables 配 app 设计 token
    // 读 CSS vars (getComputedStyle 解析 var() / color-mix() 到实际值)
    // 这样主题切换 (dark/light) 自动跟着 app 变
    const cssVar = (name: string): string => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      // color-mix 可能返回空 (mermaid 需要 hex/rgb), 退到 fallback
      return v.startsWith('#') || v.startsWith('rgb') ? v : ''
    }
    const accent = cssVar('--color-accent') || '#7c3aed'
    const accentHover = cssVar('--color-accent-hover') || '#a78bfa'
    const link = cssVar('--color-primary') || '#60a5fa'
    const fg = cssVar('--color-text-primary') || '#dcddde'
    const fgMuted = cssVar('--color-text-secondary') || '#888'
    const bg = cssVar('--color-bg') || '#1e1e1e'
    const surface = cssVar('--color-surface') || '#252525'
    const surfaceHover = cssVar('--color-surface-hover') || '#2d2d2d'
    const border = cssVar('--color-border') || '#3d3d3d'
    const fontFamily = cssVar('--font-sans') || 'system-ui, -apple-system, sans-serif'

    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        // 节点主体: 用 app accent (紫色), 而不是 Mermaid 默认蓝
        primaryColor: accent,
        primaryTextColor: fg,
        primaryBorderColor: accentHover,
        // 边/连线: 用 muted text
        lineColor: fgMuted,
        // 背景: 用 app 表面色, SVG 融入编辑器
        background: bg,
        mainBkg: surface,
        secondBkg: surfaceHover,
        tertiaryBkg: bg,
        // 注释框
        noteBkgColor: surfaceHover,
        noteTextColor: fg,
        noteBorderColor: border,
        // 次级节点 (分支判断等): 浅一些的表面色
        secondaryColor: surfaceHover,
        tertiaryColor: surface,
        // 文本: 全部用 app fg
        textColor: fg,
        // 字体
        fontFamily,
        fontSize: '14px'
      }
    })

    // Unique ID per render
    const id = `mw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    await mermaid.parse(code, { startOnLoad: false })
    const { svg } = await mermaid.render(id, code)

    container.innerHTML = svg

    // Make SVG responsive (sizing handled by .cm-mermaid-widget svg CSS)
    const svgEl = container.querySelector('svg')
    if (svgEl) {
      svgEl.removeAttribute('height')
      svgEl.removeAttribute('width')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Parse error'
    container.innerHTML = `<div class="mermaid-error">⚠️ ${lang} error: ${msg}</div>`
  }
}

async function renderMermaidWidget(
  wrapper: HTMLElement,
  container: HTMLElement,
  code: string,
  lang: string
): Promise<void> {
  await renderMermaidInWidget(container, code, lang)
}

// ── StateField ───────────────────────────────────────────────────────────────

function getFencedCodeInfo(
  tree: ReturnType<typeof syntaxTree>,
  doc: string
): Array<{
  node: SyntaxNode
  lang: string
  code: string
}> {
  const results: Array<{ node: SyntaxNode; lang: string; code: string }> = []

  tree.iterate({
    from: 0,
    to: doc.length,
    enter(fcNode) {
      if (fcNode.name !== 'FencedCode') return

      // Get language tag
      const infoNode = fcNode.node.getChild('CodeInfo')
      const lang = infoNode ? doc.slice(infoNode.from, infoNode.to).trim().toLowerCase() : ''

      if (!SUPPORTED_LANGS.has(lang)) return

      // Get code body
      const textNode = fcNode.node.getChild('CodeText')
      const code = textNode ? doc.slice(textNode.from, textNode.to) : ''

      results.push({ node: fcNode.node, lang, code })
    }
  })

  return results
}

function buildMermaidDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const doc = state.doc
  const getDoc = () => state.sliceDoc(0, doc.length)
  const tree = ensureSyntaxTree(state, doc.length, 200) ?? syntaxTree(state)

  const diagrams = getFencedCodeInfo(tree, getDoc())

  for (const { node, lang, code } of diagrams) {
    decorations.push(
      Decoration.replace({
        widget: new MermaidWidget(node.from, node.to, getDoc, lang, code),
        block: true
      }).range(node.from, node.to)
    )
  }

  return Decoration.set(
    decorations.sort((a, b) => a.from - b.from),
    true
  )
}

const mermaidFieldImpl = (() => {
  registerMermaidBuilder(buildMermaidDecorations)
  return blockDecorationsField
})()

export function mermaidWidgetExtension() {
  return mermaidFieldImpl
}
