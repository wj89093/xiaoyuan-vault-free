/**
 * useFrontmatterWidget.ts — Frontmatter Widget 入口
 *
 * v1.5: 拆分 — 600 行单文件拆为:
 *   - detection.ts  找 --- ... --- 段
 *   - completion.ts 字段名自动补全
 *   - widget.ts     FrontmatterWidget class + Decoration builder + register
 *
 * 本文件: side-effect import 触发 register, 确保 useEditorExtensions 之前
 * blockDecorationsField 已注册 frontmatter builder
 */
import './useFrontmatterWidget/widget' // side-effect: registers frontmatter builder
// re-export 给老调用方
export { frontmatterCompletion } from './useFrontmatterWidget/completion'
