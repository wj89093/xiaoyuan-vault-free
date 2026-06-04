/**
 * useScrollMemory — v1.5 reader UX: 滚动位置记忆
 *
 * 用户是读者 (主要看 agent 写的文档), 重开文档应回到上次位置
 *
 * 工作流:
 *   1. filePath 变化时: 同步存旧位置 → 读新位置 → 等 layout → scrollTo
 *   2. 滚动时: debounce 500ms 存当前位置
 *   3. 组件 unmount 时: 同步存当前位置
 *
 * 边界:
 *   - 文档内容变化: scrollY 数字位置可能不精确, 但不致命
 *   - 文件被删: get 返回 null, scroll 0
 *   - 切换 vault: db 重置, 自动失效 (initDatabase 关闭旧 db)
 */
import { useEffect, useRef } from 'react'
import type { EditorView } from '@codemirror/view'

interface UseScrollMemoryOptions {
  /** 当前打开的文档路径 (相对于 vault); null 表示无文档 */
  filePath: string | null
  /** CodeMirror EditorView ref */
  viewRef: React.RefObject<EditorView | null>
  /** 关闭记忆 (e.g. 预览模式) */
  enabled?: boolean
  /** debounce 间隔 (ms), 默认 500 */
  debounceMs?: number
}

export function useScrollMemory({
  filePath,
  viewRef,
  enabled = true,
  debounceMs = 500,
}: UseScrollMemoryOptions): void {
  const lastFileRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredRef = useRef<boolean>(false)

  // ── 1. 切换文件: 先存旧位置 → 读新位置 → 恢复 scroll ──
  useEffect(() => {
    if (!enabled || !filePath) {
      restoredRef.current = false
      return
    }

    // 复制 view 引用避免 cleanup 时已被 reset
    const viewAtMount = viewRef.current
    const sdomAtMount = viewAtMount?.scrollDOM ?? null

    // 切换瞬间: 旧位置强制存一次 (如果存在且不同)
    const oldPath = lastFileRef.current
    if (oldPath && oldPath !== filePath && restoredRef.current) {
      const oldView = viewRef.current
      if (oldView?.scrollDOM) {
        window.api.scrollPositionSet({
          filePath: oldPath,
          scrollY: oldView.scrollDOM.scrollTop,
        })
      }
    }

    // 读新位置 → 等 layout → scrollTo
    let cancelled = false
    void window.api.scrollPositionGet(filePath).then((pos) => {
      if (cancelled) return
      if (pos && sdomAtMount) {
        // 等下一帧让 CodeMirror 完成 layout
        requestAnimationFrame(() => {
          if (sdomAtMount && !cancelled) {
            sdomAtMount.scrollTop = pos.scrollY
          }
        })
      }
      restoredRef.current = true
    })

    lastFileRef.current = filePath

    return () => {
      cancelled = true
      // 离开时存 (比如切换到另一个文档, 或组件 unmount)
      const path = lastFileRef.current
      if (path && restoredRef.current && sdomAtMount) {
        window.api.scrollPositionSet({
          filePath: path,
          scrollY: sdomAtMount.scrollTop,
        })
      }
    }
  }, [filePath, enabled, viewRef])

  // ── 2. 滚动监听: debounce 存 ──
  useEffect(() => {
    if (!enabled) return
    const sdom = viewRef.current?.scrollDOM
    if (!sdom) return

    const handleScroll = (): void => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      const fp = lastFileRef.current
      if (!fp) return
      saveTimerRef.current = setTimeout(() => {
        const currentSdom = viewRef.current?.scrollDOM
        if (currentSdom && fp) {
          window.api.scrollPositionSet({
            filePath: fp,
            scrollY: currentSdom.scrollTop,
          })
        }
      }, debounceMs)
    }

    sdom.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      sdom.removeEventListener('scroll', handleScroll)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [filePath, enabled, viewRef, debounceMs])
}
