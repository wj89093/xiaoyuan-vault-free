/**
 * tree-progress.ts — Monitor lezer parse progress, dispatch treeGrowthEffect
 *
 * Based on atomic-editor's tree-progress.ts.
 *
 * Without this, for large documents the initial `ensureSyntaxTree(state, docLen, 200ms)`
 * budget runs out before parsing the full doc. Any StateField that relies on the syntax
 * tree only sees decorations for the parsed prefix — late tables/images/headings stay
 * as raw text. treeProgressPlugin runs the parser forward in idle ticks and broadcasts
 * `treeGrowthEffect` whenever the parsed range grows enough for downstream builders
 * to re-run.
 */
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { StateEffect } from '@codemirror/state'
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

export const treeGrowthEffect = StateEffect.define<{ from: number; to: number }>()

// How much must the parsed range grow before dispatching a rebuild effect.
// 8KB ≈ two viewport-heights of text.
const GROWTH_THRESHOLD = 8192

// Budget per idle tick — short enough to stay responsive, long enough to make progress.
const TICK_BUDGET_MS = 30

type IdleHandle = { kind: 'idle'; id: number } | { kind: 'raf'; id: number }

function scheduleIdle(cb: () => void): IdleHandle {
  if (typeof window.requestIdleCallback === 'function') {
    return { kind: 'idle', id: window.requestIdleCallback(() => cb()) }
  }
  return { kind: 'raf', id: requestAnimationFrame(() => cb()) }
}

function cancelIdle(handle: IdleHandle): void {
  if (handle.kind === 'idle' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle.id)
  } else if (handle.kind === 'raf') {
    cancelAnimationFrame(handle.id)
  }
}

export const treeProgressPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView
    _lastTreeLen: number
    _idleHandle: IdleHandle | null = null
    _destroyed = false

    constructor(view: EditorView) {
      this.view = view
      this._lastTreeLen = syntaxTree(view.state).length
      this._schedule()
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        // Doc edits invalidate parse state — reset and re-schedule.
        this._lastTreeLen = syntaxTree(update.state).length
        this._schedule()
      }
    }

    destroy() {
      this._destroyed = true
      if (this._idleHandle !== null) {
        cancelIdle(this._idleHandle)
        this._idleHandle = null
      }
    }

    _schedule() {
      if (this._idleHandle !== null) return
      this._idleHandle = scheduleIdle(() => {
        this._idleHandle = null
        if (!this._destroyed) this._tick()
      })
    }

    _tick() {
      const state = this.view.state
      const docLen = state.doc.length
      if (this._lastTreeLen >= docLen) return

      // Push the parser further. Returns null if budget expires before target.
      const ensured = ensureSyntaxTree(state, docLen, TICK_BUDGET_MS)
      const newLen = (ensured ?? syntaxTree(state)).length

      if (newLen >= this._lastTreeLen + GROWTH_THRESHOLD || newLen >= docLen) {
        const previous = this._lastTreeLen
        this._lastTreeLen = newLen
        try {
          this.view.dispatch({
            effects: treeGrowthEffect.of({ from: previous, to: newLen })
          })
        } catch {
          // View destroyed mid-flight; revert baseline.
          this._lastTreeLen = previous
          return
        }
      }

      if (newLen < docLen) this._schedule()
    }
  }
)
