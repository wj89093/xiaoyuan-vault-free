/**
 * useBlockHandle.ts — Block Toolbar for CM6
 * 
 * Currently DISABLED — block decorations via ViewPlugin causes "Block decorations via plugins" error.
 * 
 * CM6 constraint: block decorations (block:true widgets) MUST use StateField.
 * StateField.create(state) doesn't have EditorView access.
 * 
 * Resolution: disable for now, use a simpler inline formatting approach instead.
 */
export function blockHandleExtension() {
  return []
}
