/**
 * types.ts — WikiLinks 类型定义
 */
import type { DecorationSet } from '@codemirror/view'

export type WikiLinkStatus = 'resolved' | 'loading' | 'missing' | 'unresolved'

export interface WikiLinkSuggestion {
  target: string
  label: string
  detail?: string
  boost?: number
}

export interface WikiLinkResolvedTarget {
  target: string
  label: string
  status: WikiLinkStatus
}

export interface WikiLinksConfig {
  /**
   * 返回所有可用的 wiki link 候选项（用于补全和解析）
   */
  getSuggestions?: (query: string) => Promise<WikiLinkSuggestion[]>
  /**
   * 将 wiki link 目标解析为实际路径
   */
  resolve?: (target: string) => Promise<WikiLinkResolvedTarget | null>
  /**
   * 是否应解析某个 target（默认全部解析）
   */
  shouldResolve?: (target: string) => boolean
  /**
   * 点击 wiki link 时的行为（默认：跳转到解析后的路径）
   */
  onClick?: (target: string, resolved: WikiLinkResolvedTarget | null, event: MouseEvent) => void
  /**
   * 是否在输入时显示加载状态
   */
  showLoading?: boolean
}

export interface ParsedWikiLink {
  from: number
  to: number
  target: string
  label: string
  // internal
  _raw: string
  _sep: number
}

// Internal state types
export interface ResolutionPayload {
  target: string
  resolved: WikiLinkResolvedTarget | null
}

export interface WikiLinkDecorationState {
  resolved: Map<string, WikiLinkResolvedTarget | null>
  decorations: DecorationSet
}