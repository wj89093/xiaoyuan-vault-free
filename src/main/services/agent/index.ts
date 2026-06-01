/**
 * agent/index.ts — Agent 模块统一入口（开源版）
 *
 * 开源版不含内置 Agent，统一通过 Skill.md 插件接用户自己的 Agent。
 * 此文件保留为最小 stub，让其它代码的 import 不报错。
 */

export { IS_PRO } from '../buildFeatures'

/**
 * 获取内置 Agent 核心（开源版不存在）
 */
export async function getAgentCore(): Promise<never> {
  throw new Error('Agent core not available in open-source build. Use Skill.md plugin instead.')
}

/**
 * 获取 Agent Session Manager（多 vault 会话管理，开源版可用）
 */
export { sessionManager } from './sessionManager'
