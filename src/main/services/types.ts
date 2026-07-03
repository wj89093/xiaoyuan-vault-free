/**
 * services/types.ts — main 进程统一类型入口 (Free v1.9, 2026-07-03)
 *
 * Re-export 所有 main services 类型, 方便统一 import:
 *   import type { Frontmatter, GraphNode } from '../types'
 *
 * 原 3 个 types.ts 保留 (老代码不动, 渐进迁移):
 *   - src/main/services/frontmatter/types.ts
 *   - src/main/services/graph/types.ts
 *   - src/main/services/urlFetch/types.ts
 *
 * renderer 的 2 个 types.ts (FileInfo, WikiLink*) 不在此处,
 * 因为 src/shared/ 跨 tsconfig project 引用会触发 TS6307.
 * renderer 类型保留原位.
 */

export type {
  Relationship,
  OpenThread,
  Frontmatter,
} from './frontmatter/types'

export type {
  GraphNode,
  GraphEdge,
  GraphData,
  TFIDFDocument,
} from './graph/types'

export type { URLFetchResult } from './urlFetch/types'
