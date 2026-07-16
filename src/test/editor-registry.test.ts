/**
 * editor-registry.test.ts — 覆盖 v1.5 CM6 registry 重构
 *
 * 验证:
 *   1. 全部 window.__Xxx 实际代码引用被替换为 registry import
 *   2. editorRegistry API 暴露 5 个函数
 *   3. useCodeMirror mount 调 setActiveView + setEditHandler, unmount 清理
 *   4. MutationObserver 在 cleanup 时 disconnect (避免泄漏)
 *
 * 策略: 跟 vault-last-file 一样 — 读源码断言
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const useCodeMirror = readFileSync(join(process.cwd(), 'src/renderer/hooks/useCodeMirror.ts'), 'utf-8')
const editorRegistry = readFileSync(join(process.cwd(), 'src/renderer/hooks/editorRegistry.ts'), 'utf-8')
const editorContextMenu = readFileSync(
  join(process.cwd(), 'src/renderer/hooks/useEditorContextMenu.ts'),
  'utf-8'
)
const mermaidWidget = readFileSync(
  join(process.cwd(), 'src/renderer/hooks/useMermaidWidget.ts'),
  'utf-8'
)
const editorTsx = readFileSync(join(process.cwd(), 'src/renderer/components/Editor.tsx'), 'utf-8')

describe('v1.5 CM6 registry — API 表面', () => {
  it('editorRegistry 暴露 5 个函数: setActiveView / getActiveView / setEditHandler / callEdit / clearEditHandlers', () => {
    expect(editorRegistry).toMatch(/export function setActiveView/)
    expect(editorRegistry).toMatch(/export function getActiveView/)
    expect(editorRegistry).toMatch(/export function setEditHandler/)
    expect(editorRegistry).toMatch(/export function callEdit/)
    expect(editorRegistry).toMatch(/export function clearEditHandlers/)
  })

  it('editorRegistry 替代 4 个 window 全局, 文档清楚标注', () => {
    expect(editorRegistry).toMatch(/__cmView/)
    expect(editorRegistry).toMatch(/__frontmatterEdit/)
    expect(editorRegistry).toMatch(/__tableEdit/)
    expect(editorRegistry).toMatch(/__mermaidEdit/)
  })
})

describe('v1.5 CM6 registry — 调用方迁移', () => {
  it('useCodeMirror mount 时 setActiveView(view)', () => {
    expect(useCodeMirror).toMatch(/setActiveView\(view\)/)
  })

  it('useCodeMirror 注册 3 个 edit handlers (frontmatter/table/mermaid)', () => {
    expect(useCodeMirror).toMatch(/setEditHandler\(['"]frontmatter['"]/)
    expect(useCodeMirror).toMatch(/setEditHandler\(['"]table['"]/)
    expect(useCodeMirror).toMatch(/setEditHandler\(['"]mermaid['"]/)
  })

  it('useCodeMirror cleanup 调 observer.disconnect() (修泄漏)', () => {
    // cleanup 函数体应该包含 observer.disconnect()
    const cleanupMatch = useCodeMirror.match(
      /return \(\) => \{[\s\S]{0,500}?observer\.disconnect\(\)/
    )
    expect(cleanupMatch).not.toBeNull()
  })

  it('useCodeMirror cleanup 清空 registry (setActiveView(null) + clearEditHandlers)', () => {
    const cleanupMatch = useCodeMirror.match(
      /return \(\) => \{[\s\S]{0,500}?clearEditHandlers\(\)/
    )
    expect(cleanupMatch).not.toBeNull()
    // 也清空 activeView
    expect(useCodeMirror).toMatch(/setActiveView\(null\)/)
  })

  it('useEditorContextMenu 改用 getActiveView()', () => {
    expect(editorContextMenu).toMatch(/import \{ getActiveView \}.*editorRegistry/)
    expect(editorContextMenu).toMatch(/getActiveView\(\) \?\? viewRef\.current/)
  })

  it('useMermaidWidget dblclick 用 callEdit("mermaid", ...)', () => {
    expect(mermaidWidget).toMatch(/import \{ callEdit \}.*editorRegistry/)
    expect(mermaidWidget).toMatch(/callEdit\(['"]mermaid['"],\s*this as unknown as Parameters<typeof callEdit>\[1],\s*wrapper,\s*view\)/)
  })

  it('Editor.tsx handleFormat 用 getActiveView() 不用 window.__cmView', () => {
    expect(editorTsx).toMatch(/import \{ getActiveView \}.*editorRegistry/)
    expect(editorTsx).toMatch(/const view = getActiveView\(\)/)
  })
})

describe('v1.5 CM6 registry — 实际代码无 window.__Xxx 残留', () => {
  it('useCodeMirror 没有实际使用 window.__Xxx 模式', () => {
    // 排除注释行
    const lines = useCodeMirror.split('\n')
    const real = lines.filter(
      (l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')
    )
    const violations = real.filter((l) => /window\s+as\s+any[\s\S]*__[a-z]/.test(l))
    expect(violations).toEqual([])
  })

  it('useMermaidWidget 没有 (window as any).__XxxEdit', () => {
    expect(mermaidWidget).not.toMatch(/\(window as any\)\.__mermaidEdit/)
  })

  it('useEditorContextMenu 没有 w.__cmView 残留 (排除注释行)', () => {
    // 排除注释行 (/* */ 和 //)
    const code = editorContextMenu
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).not.toMatch(/w\.__cmView/)
  })

  it('Editor.tsx handleFormat 用 getActiveView() 不用 window.__cmView', () => {
    // 抓 handleFormat 整个函数体 (switch case 多, 需要大范围)
    const fnStart = editorTsx.indexOf('const handleFormat = useCallback')
    expect(fnStart).toBeGreaterThan(-1)
    // 找下一个 '}, []'  (deps array, 空 deps 表示 useCallback)
    const fnEnd = editorTsx.indexOf('}, []', fnStart)
    expect(fnEnd).toBeGreaterThan(fnStart)
    const block = editorTsx.slice(fnStart, fnEnd)
    expect(block).toMatch(/getActiveView\(\)/)
    expect(block).not.toMatch(/window as any/)
  })
})
