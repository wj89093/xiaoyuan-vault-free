/**
 * useEditorExtensions.ts — Unified editor extensions
 *
 * v1.5: 改为模块级常量, 避免每次 mount 重建
 *   - inlinePreviewExtension / tableWidgetExtension 等函数调用现在只 module load 跑一次
 *   - 每次 mount 不再重新创建新的 StateField/ViewPlugin 实例
 */
import type { Extension } from '@codemirror/state'
import { inlinePreviewExtension } from './useInlinePreview'
import { tableWidgetExtension } from './useTableWidget'
import './useFrontmatterWidget' // side-effect: registers frontmatter builder
import './useMermaidWidget' // side-effect: registers mermaid builder
import { blockHandleExtension } from './useBlockHandle'
import { wikiLinksExtension } from './useWikiLinks/index'
import { imageBlocksExtension } from './useImageBlocks'
import { blockDecorationsField } from './blockDecorationsField'
import {
  extendEmphasisPair,
  autoCloseCodeFence,
  tightListKeymap
} from '../utils/editorInputHelpers'

export const EDITOR_EXTENSIONS: Extension[] = [
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
  imageBlocksExtension()
]
