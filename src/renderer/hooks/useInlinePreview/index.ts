/**
 * useInlinePreview/index.ts
 *
 * Re-export from the unified decorations module.
 * For backward compat: inlinePreviewExtension() still works.
 */
export {
  unifiedDecorationsExtension,
  unifiedDecorationsExtension as inlinePreviewExtension,
  treeGrowthEffect,
  previewFrozenField,
  treeProgressPlugin,
  freezeMousePlugin,
} from './unifiedDecorations'
