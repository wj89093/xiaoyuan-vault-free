/**
 * aiService.ts — 开源版 stub
 *
 * 开源版不含内置 LLM。所有 callAI 调用都返回 null / empty string，
 * 让上层服务优雅降级（lint 不修、schema 不建议、briefing 不生成）。
 *
 * 用户接 Agent 用 Skill.md 插件。
 */

import log from 'electron-log/main'

/**
 * 统一的 AI 调用入口（开源版 stub）
 *
 * 任何 type 的调用都返回 null。调用方应检查 null 并跳过相应功能。
 */
export async function callAI(_type: string, _args: Record<string, unknown>): Promise<unknown> {
  log.info('[AI] callAI called but open-source build has no built-in LLM. Use Skill.md plugin.')
  return null
}

/**
 * 检查 LLM 是否可用（开源版永远 false）
 */
export function isAIEnabled(): boolean {
  return false
}

/**
 * 列出可用的 provider（开源版永远空）
 */
export function listProviders(): string[] {
  return []
}
