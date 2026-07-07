// ============ Shared Types (main ↔ renderer) ============

// 2026-07-07 (Free 仓清理): 删 ChatMessage / ChatSession / AskResult / AskStreamChunk 4 个 chat 类型
//   - chat 是 Pro 专属功能, Free 仓不实现 (见 src/main/buildFeatures.ts)
//   - 配合删 preload/index.ts 的 chat namespace + src/shared/window.d.ts 的 chat 声明
//   - 保留 ImportFileResult (跟 chat 无关, ImportApp 用)

export interface ImportFileResult {
  name: string
  path: string
  status: 'ok' | 'error'
  error?: string
  converted?: boolean
  mdPath?: string
}
