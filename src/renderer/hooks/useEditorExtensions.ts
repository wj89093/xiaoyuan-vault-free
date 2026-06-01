/**
 * useEditorExtensions.ts — Unified editor extensions
 */
import type { Extension } from '@codemirror/state'
import { inlinePreviewExtension } from './useInlinePreview'
import { tableWidgetExtension } from './useTableWidget'
import './useFrontmatterWidget'   // side-effect: registers frontmatter builder
import './useMermaidWidget'        // side-effect: registers mermaid builder
import { blockHandleExtension } from './useBlockHandle'
import { wikiLinksExtension } from './useWikiLinks/index'
import { imageBlocksExtension } from './useImageBlocks'
import { blockDecorationsField } from './blockDecorationsField'
import { extendEmphasisPair, autoCloseCodeFence, tightListKeymap } from '../utils/editorInputHelpers'

export function editorExtensions(): Extension[] {
  return [
    // ── Input helpers (atomic-editor style) ────────────────────────────────
    extendEmphasisPair,
    autoCloseCodeFence,
    tightListKeymap,


    // ── Core inline preview (ViewPlugin decorations) ────────────────────
    inlinePreviewExtension(),

    // ── Block decorations (shared StateField: mermaid + frontmatter) ───
    blockDecorationsField,


    // ── Block widgets ───────────────────────────────────────────────────
    tableWidgetExtension(),
    blockHandleExtension(),

    // ── Navigation / interaction ────────────────────────────────────────
    wikiLinksExtension(),
    imageBlocksExtension(),
  ]
}
