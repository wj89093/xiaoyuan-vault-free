/**
 * TableOfContents — v1.5 reader UX: 长文档导航
 *
 * 用户是读者, agent 写的 wiki 经常 100+ 行。需要目录侧栏。
 *
 * 工作流:
 *   1. 解析 value 中的 heading (`# ## ###` 等)
 *   2. 滚动监听 (scroll spy) → 计算当前最顶部的 heading
 *   3. 当前 heading 高亮
 *   4. 点击 heading → scrollIntoView 跳转到对应行
 *
 * 边界:
 *   - 没有 heading: 显示 "该文档没有标题"
 *   - heading 文本含 markdown (**, `) : 简单 strip
 *   - scroll spy 用 lineBlockAtHeight (CodeMirror 6 官方 API)
 */
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { X, List } from 'lucide-react'
import { EditorView } from '@codemirror/view'

interface Heading {
  level: number // 1-6
  text: string
  line: number // 1-indexed
}

interface TableOfContentsProps {
  value: string
  viewRef: React.RefObject<EditorView | null>
  onClose: () => void
}

/** 解析 markdown heading (只解析行首 1-6 个 #) */
function parseHeadings(value: string): Heading[] {
  const lines = value.split('\n')
  const headings: Heading[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (m) {
      // 简单 strip 一些 inline markdown (bold/italic/code)
      const text = m[2].replace(/(\*\*|__|`|\*|_)/g, '')
      headings.push({
        level: m[1].length,
        text,
        line: i + 1,
      })
    }
  }
  return headings
}

export function TableOfContents({
  value,
  viewRef,
  onClose,
}: TableOfContentsProps): JSX.Element {
  const headings = useMemo(() => parseHeadings(value), [value])
  const [activeLine, setActiveLine] = useState(1)

  // scroll spy: 监听 editor scroll → 算当前 line
  useEffect(() => {
    const view = viewRef.current
    const sdom = view?.scrollDOM
    if (!sdom) return

    const handler = (): void => {
      const v = viewRef.current
      if (!v) return
      // 用 60px 偏移 (heading 通常有 margin-top)
      const block = v.lineBlockAtHeight(sdom.scrollTop + 60)
      if (!block) return
      const line = v.state.doc.lineAt(block.from).number
      setActiveLine(line)
    }

    sdom.addEventListener('scroll', handler, { passive: true })
    handler() // 初始
    return () => sdom.removeEventListener('scroll', handler)
  }, [viewRef, headings]) // headings 变化时重新订阅 (新文档)

  // 点击 → scroll to line
  const handleClick = (line: number): void => {
    const view = viewRef.current
    if (!view) return
    const lineObj = view.state.doc.line(line)
    if (!lineObj) return
    view.dispatch({
      effects: EditorView.scrollIntoView(lineObj.from, { y: 'start', yMargin: 20 }),
    })
  }

  if (headings.length === 0) {
    return (
      <aside className="editor-toc">
        <div className="editor-toc-header">
          <List size={14} />
          <span>目录</span>
          <button
            className="editor-toc-close"
            onClick={onClose}
            title="关闭目录"
            aria-label="关闭目录"
          >
            <X size={14} />
          </button>
        </div>
        <div className="editor-toc-empty">该文档没有标题</div>
      </aside>
    )
  }

  return (
    <aside className="editor-toc" aria-label="目录">
      <div className="editor-toc-header">
        <List size={14} />
        <span>目录 ({headings.length})</span>
        <button
          className="editor-toc-close"
          onClick={onClose}
          title="关闭目录"
          aria-label="关闭目录"
        >
          <X size={14} />
        </button>
      </div>
      <ul className="editor-toc-list">
        {headings.map((h, i) => {
          // 当前 heading = activeLine 在 [h.line, next.line) 区间
          const nextLine = i < headings.length - 1 ? headings[i + 1].line : Infinity
          const isActive = activeLine >= h.line && activeLine < nextLine
          return (
            <li
              key={`${h.line}-${h.text}`}
              className={`editor-toc-item level-${h.level} ${isActive ? 'active' : ''}`}
            >
              <button
                onClick={() => handleClick(h.line)}
                title={h.text}
                aria-current={isActive ? 'true' : undefined}
              >
                {h.text}
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
