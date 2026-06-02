/**
 * wikiLinksPlugin.ts — Core CM6 plugin: StateField + ViewPlugin
 *
 * This is the heart of useWikiLinks — it:
 * 1. Parses wiki links from document text
 * 2. Applies decorations (WidgetType) for each link
 * 3. Resolves links asynchronously and updates decorations
 * 4. Handles click on wiki links → calls config.onClick
 */
import { StateEffect, StateField, Prec } from '@codemirror/state'
import {
  type EditorView,
  ViewPlugin,
  Decoration,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { type EditorState, RangeSetBuilder } from '@codemirror/state'
import type {
  WikiLinksConfig,
  WikiLinkDecorationState,
  ResolutionPayload,
  ParsedWikiLink
} from './types'
import { parseWikiLinks } from './wikiLinksParser'
import { WikiLinkWidget } from './WikiLinkWidget'
import { shouldResolveWikiLink, wikiLinkElementFromEvent } from './helpers'

// ── State Effects ────────────────────────────────────────────────────────────────

const wikiLinkResolved = StateEffect.define<ResolutionPayload>()

// ── StateField ────────────────────────────────────────────────────────────────

function buildInitialState(): WikiLinkDecorationState {
  return { resolved: new Map(), decorations: Decoration.none }
}

function _computeDecorations(
  state: EditorState,
  resolved: Map<string, WikiLinkResolvedTarget | null>
): DecorationSet {
  const links = parseWikiLinks(state.doc, 0, state.doc.length)
  const builder = new RangeSetBuilder<Decoration>()

  for (const link of links) {
    const res = resolved.get(link.target)
    const status = res?.status ?? 'unresolved'
    builder.add(
      link.from,
      link.to,
      Decoration.replace({
        widget: new WikiLinkWidget(link.target, link.label, status),
        inclusive: false
      })
    )
  }

  return builder.finish()
}

const wikiLinksStateField = StateField.define<WikiLinkDecorationState>({
  create() {
    return buildInitialState()
  },

  update(state, tr) {
    // Apply resolution effects
    const currentState = state as WikiLinkDecorationState

    for (const effect of tr.effects) {
      if (effect.is(wikiLinkResolved)) {
        const { target, resolved } = effect.value
        const newResolved = new Map(currentState.resolved)
        newResolved.set(target, resolved)
        // Decorations are now computed in unifiedDecorationsPlugin.
        // Here we only store the resolved map.
        return { resolved: newResolved, decorations: Decoration.none }
      }
    }

    // Recompute on doc changes
    if (tr.docChanged) {
      // Decorations are now computed in unifiedDecorationsPlugin.
      return { resolved: currentState.resolved, decorations: Decoration.none }
    }

    return state
  }
  // NOTE: provide is intentionally REMOVED — wiki link decorations are now
  // handled by unifiedDecorationsPlugin to avoid EditorView.decorations Facet conflict.
  // This StateField only stores the resolved link map for async resolution.
})

// ── ViewPlugin (async resolution + click handling) ─────────────────────────────────

const RESOLVE_DEBOUNCE_MS = 300
const RESOLVE_BATCH_SIZE = 10

function createViewPlugin(config: WikiLinksConfig) {
  const pending = new Map<string, ParsedWikiLink>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const scheduleResolve = (view: EditorView) => {
    if (timer) return
    timer = setTimeout(async () => {
      timer = null
      const toResolve = Array.from(pending.values()).slice(0, RESOLVE_BATCH_SIZE)
      pending.clear()
      await resolveBatch(view, toResolve)
      if (pending.size > 0) scheduleResolve(view)
    }, RESOLVE_DEBOUNCE_MS)
  }

  const resolveBatch = async (view: EditorView, links: ParsedWikiLink[]) => {
    const toFetch = links.filter((l) => shouldResolveWikiLink(config, l.target))
    if (!toFetch.length) return

    const results = await Promise.allSettled(
      toFetch.map((l) => (config.resolve ?? (() => Promise.resolve(null)))(l.target))
    )

    const effects: ResolutionPayload[] = []
    for (let i = 0; i < toFetch.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled') {
        effects.push({ target: toFetch[i].target, resolved: result.value })
      }
    }

    if (effects.length > 0) {
      view.dispatch({ effects: effects.map((e) => wikiLinkResolved.of(e)) })
    }
  }

  return ViewPlugin.fromClass(
    class {
      constructor(readonly view: EditorView) {}

      update(update: ViewUpdate) {
        // Handle clicks on wiki links
        if (update.selectionSet || update.docChanged) {
          // handled below
        }

        // Handle click events directly on the view
        if (config.onClick) {
          // Click handling via mousedown event
        }

        if (!update.docChanged) return

        // Iterate changed ranges for wiki link resolution
        if (update.changes) {
          update.changes.iterChangedRanges((fromA, _toA, _fromB, _toB) => {
            const links = parseWikiLinks(update.state.doc, fromA, _toA)
            for (const link of links) {
              if (!pending.has(link.target)) {
                pending.set(link.target, link)
              }
            }
          })
        }

        if (pending.size > 0) scheduleResolve(update.view)
      }
    },
    {
      eventHandlers: {
        // Handle mousedown on wiki links
        mousedown: (event: MouseEvent, view: EditorView) => {
          if (event.button !== 0) return false
          const linkEl = wikiLinkElementFromEvent(event as unknown as MouseEvent, view.dom)
          if (!linkEl) return false

          const target = linkEl.dataset.wikiLinkTarget ?? ''
          const state = view.state.field(wikiLinksStateField) as WikiLinkDecorationState
          const resolved = state.resolved.get(target) ?? null

          config.onClick?.(target, resolved, event as unknown as MouseEvent)
          return false // don't prevent default
        }
      }
    }
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createWikiLinksPlugin(config: WikiLinksConfig) {
  const plugin = createViewPlugin(config)
  const field = wikiLinksStateField
  return [field, plugin, wikiLinkEditKeymap()] as const
}

// ── Backspace keymap ──────────────────────────────────────────────────────────────

/**
 * When the cursor is right at the end of a complete `[[target]]` (no label),
 * pressing Backspace should move the caret inside the brackets so the user
 * can continue typing the target — rather than deleting the whole link.
 */
function revealWikiLinkBeforeCursor(view: EditorView): boolean {
  const range = view.state.selection.main
  if (!range.empty) return false

  const cursor = range.head
  const link = findWikiLinkEndingAt(view.state.doc, cursor)
  if (!link || link.label) return false

  view.dispatch({
    selection: { anchor: Math.max(link.from + 2, link.to - 2) },
    scrollIntoView: true
  })
  return true
}

function findWikiLinkEndingAt(doc: any, pos: number): ParsedWikiLink | null {
  if (pos <= 0 || pos > doc.length) return null
  const links = parseWikiLinks(doc, 0, doc.length)
  return links.find((link) => link.to === pos) ?? null
}

function wikiLinkEditKeymap(): ReturnType<typeof keymap.of> {
  return Prec.highest(keymap.of([{ key: 'Backspace', run: revealWikiLinkBeforeCursor }]))
}
