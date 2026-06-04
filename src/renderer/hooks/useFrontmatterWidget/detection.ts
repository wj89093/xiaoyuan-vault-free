/**
 * useFrontmatterWidget/detection.ts — Frontmatter 检测
 * 找文档开头的 --- ... --- 段
 */
import type { EditorState } from '@codemirror/state'
import { parseFrontmatter, type FrontmatterMatch } from '../frontmatter-utils'

export function findFrontmatter(state: EditorState): FrontmatterMatch | null {
  const doc = state.doc
  if (doc.length < 8 || doc.sliceString(0, 3) !== '---') return null
  let close = -1
  for (let p = 3; p < doc.length - 3; p++)
    if (doc.sliceString(p, p + 4) === '\n---') {
      close = p + 4
      break
    }
  if (close < 0) return null
  const raw = doc.sliceString(3, close - 4)
  const fields = parseFrontmatter(raw)
  // Allow empty fields (new document with just ---\n---)
  if (!raw.trim()) return { from: 0, to: close, raw: '', fields: [] }
  return { from: 0, to: close, raw, fields }
}
