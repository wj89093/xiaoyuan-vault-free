/**
 * sessionManager — Agent 会话生命周期管理（多 vault 版）
 *
 * 委托给 VaultAgentManager 实现多 vault 上下文隔离。
 * 本文件保留向后兼容的 IPC handlers 和导出函数。
 *
 * 规则：
 * 1. 多 vault：每个 vault 独立 session，切换 vault 不污染上下文
 * 2. 每日会话：按日期创建 session，日期变更自动开启新 session
 * 3. 消息上限：AI Chat 显示最近 10 条（磁盘保存完整历史）
 * 4. 自动保存：每次 agent 回复后自动落盘
 * 5. Abort：绑定到当前 vault session 的 AbortController
 * 6. 智能问候：新 session 第一条消息自动发送问候语
 */
import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import log from 'electron-log/main'
import { getVaultPath } from '../database/database'
import { setVaultPath } from './core/tools'
import type { AgentMessage } from './types'
import { vaultAgentManager } from './core/VaultAgentManager'

const SESSIONS_DIR = '.xiaoyuan/chat'
const SESSION_FILE = 'current.json'
const MAX_VISIBLE_MESSAGES = 10

// ─── Types ────────────────────────────────────────────────────────────────

import type { ChatSession as BaseChatSession } from '../chat/chat'

interface ChatSession extends BaseChatSession {
  date: string
  greeting?: string
  greetingPushed?: boolean
}

// ─── Path Helpers（供外部调用）─────────────────────────────────────────────────

export function getSessionsDir(): string {
  const vp = getVaultPath()
  if (!vp) throw new Error('No vault open')
  return join(vp, SESSIONS_DIR)
}

function getSessionPath(): string {
  return join(getSessionsDir(), SESSION_FILE)
}

// ─── Date Helpers ─────────────────────────────────────────────────────────

export function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function buildSessionId(date?: string): string {
  const d = date ?? todayString()
  return createHash('sha256').update(d).digest('hex').slice(0, 16)
}

// ─── Smart Greeting ───────────────────────────────────────────────────────

export async function buildDailyGreeting(date: string, memoryContext?: string): Promise<string> {
  const hour = new Date().getHours()
  const timeWord = hour < 6 ? '凌晨好' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 17 ? '下午好' : hour < 19 ? '傍晚好' : '晚上好'

  let recentTopics = ''
  if (memoryContext) {
    const topicMatch = memoryContext.match(/## [^\n]+\n([^#]+)/)
    if (topicMatch) {
      const lines = topicMatch[1].split('\n').filter(l => l.trim() && !l.includes('操作日志'))
      if (lines.length > 0) {
        recentTopics = '\n\n📋 最近：' + lines.slice(0, 2).map(l => l.replace(/^-\s*/, '').trim()).filter(Boolean).join('；')
      }
    }
  }

  return `${timeWord}！今天 ${date}，晓园已就绪 🏡${recentTopics}

我可以帮你：
- 搜索和分析知识库中的文档
- 根据 [[笔记名称]] 格式关联相关笔记
- 整理、撰写、转化内容（翻译/摘要/PPT/PDF等）
- 回顾历史讨论：「之前聊过什么？」
- 批量操作文件：重命名、移动、标签管理

有什么需要？`
}

// ─── Re-export from VaultAgentManager ───────────────────────────────────────────

export { vaultAgentManager } from './core/VaultAgentManager'

// ─── Backward-compatible exports ───────────────────────────────────────────────

/** 获取当前 vault 的 Agent handle（兼容旧 API） */
export async function getCurrentAgent(
  vaultPath: string,
  webContents?: WebContents,
) {
  return vaultAgentManager.getCurrentAgent(vaultPath, webContents)
}

/** 保存当前 session（兼容旧 API）*/
export async function saveCurrentSession(): Promise<void> {
  const vp = getVaultPath()
  if (!vp) return
  const rec = vaultAgentManager['_records']?.get(vp)
  if (!rec) return
  const VaultAgentManager = await import('./core/VaultAgentManager')
  // 直接触发保存
  const dir = join(vp, SESSIONS_DIR)
  await mkdir(dir, { recursive: true })
  const msgs = await rec.adapter.getMessages()
  const payload = { session: rec.session, messages: msgs }
  await writeFile(join(dir, SESSION_FILE), JSON.stringify(payload, null, 2), 'utf-8')
}

/** 获取可见消息（兼容旧 API） */
export async function getVisibleMessages(n = MAX_VISIBLE_MESSAGES): Promise<AgentMessage[]> {
  const vp = getVaultPath()
  if (!vp) return []
  return vaultAgentManager.getVisibleMessages(vp, n)
}

/** 中断当前 session（兼容旧 API） */
export function abortCurrentSession(): void {
  vaultAgentManager.abortCurrentVault()
}

/** 检查 session 是否过期（兼容旧 API） */
export function isStale(vaultPath?: string): boolean {
  const rec = vaultAgentManager['_records']?.get(vaultPath ?? vaultAgentManager.currentVault)
  if (!rec) return true
  return rec.session.date !== todayString()
}

// ─── Concurrent send guard ─────────────────────────────────────────────
let _isProcessing = false

// ─── IPC Handlers ────────────────────────────────────────────────────────

export function registerSessionHandlers(): void {
  const vp = getVaultPath()
  if (vp) setVaultPath(vp)

  // ── chat:sessionAsk ────────────────────────────────────────────────
  ipcMain.handle('chat:sessionAsk', async (
    event,
    question: string,
    history: AgentMessage[],
    vaultPath?: string,
  ) => {
    const vp = vaultPath ?? getVaultPath()
    if (!vp) {
      return { ok: false, error: '请先在主窗口中打开知识库（Cmd+O 或点击 Open Vault）' }
    }

    if (_isProcessing) {
      return { ok: false, error: '正在处理中，请稍候…' }
    }
    _isProcessing = true

    let rec: Awaited<ReturnType<typeof vaultAgentManager.getCurrentAgent>>
    let vaultChanged = false
    const prevVault = vaultAgentManager.currentVault
    try {
      rec = await vaultAgentManager.getCurrentAgent(vp, event.sender as WebContents)
      vaultChanged = !!prevVault && prevVault !== vp
    } catch (e: unknown) {
      _isProcessing = false
      return { ok: false, error: (e as Error).message ?? '请先打开知识库' }
    }

    const existing = await rec.adapter.getMessages()
    const existingCount = existing.length

    // Vault switched → notify frontend to reload
    if (vaultChanged) {
      const allMsgs = await rec.adapter.getMessages()
      event.sender.send('chat:sessionSwitched', {
        vaultPath: vp,
        messages: allMsgs,
      })
    }

    // 智能问候：如果当前 session 有未推送的问候语，先发给前端
    const messages = await rec.adapter.getMessages()
    const lastMsg = messages[messages.length - 1]
    const currentRec = vaultAgentManager['_records']?.get(vp)
    if (lastMsg?.role === 'assistant' && currentRec?.session.greeting) {
      if (lastMsg.content === currentRec.session.greeting && !currentRec.session.greetingPushed) {
        currentRec.session.greetingPushed = true
        event.sender.send('chat:greeting', { text: lastMsg.content })
      }
    }

    const newFromHistory = (history ?? []).slice(existingCount)
    for (const m of newFromHistory) {
      if (m.role === 'user' || m.role === 'assistant') rec.adapter.addMessage(m)
    }

    try {
      const answer = await rec.adapter.streamPrompt(
        question,
        existing,
        null,
        event.sender as WebContents,
        rec.abortCtrl.signal,
      )
      // 保存 session
      const dir = join(vp, SESSIONS_DIR)
      await mkdir(dir, { recursive: true })
      const msgs = await rec.adapter.getMessages()
      const payload = { session: rec.session, messages: msgs }
      await writeFile(join(dir, SESSION_FILE), JSON.stringify(payload, null, 2), 'utf-8')
      // 增量记忆提取（fire-and-forget）
      const { extractIncrementalFacts } = await import('../memory/agentMemory')
      extractIncrementalFacts(existing).catch(() => {})
      return { ok: true, answer: answer ?? '' }
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      if (err.name === 'AbortError') return { ok: false, error: '已取消' }
      const msg = err.message ?? '服务器响应失败，请稍后再试'
      return { ok: false, error: msg }
    } finally {
      _isProcessing = false
    }
  })

  // ── chat:session ─────────────────────────────────────────────────────
  ipcMain.handle('chat:session', async (_, params: { action: string; vaultPath?: string }) => {
    const { action, vaultPath } = params

    if (action === 'get') {
      try {
        const vp = vaultPath ?? getVaultPath()
        if (!vp) return { id: null, session: null, messages: [] }
        const { id, session } = await vaultAgentManager.getCurrentAgent(vp)
        const messages = await vaultAgentManager.getVisibleMessages(vp)
        return { id, session, messages }
      } catch (e) {
        log.warn('[session] get failed:', e)
        return { id: null, session: null, messages: [] }
      }
    }

    if (action === 'reset') {
      const vp = vaultPath ?? getVaultPath()
      if (!vp) return { id: null, session: null, messages: [] }
      const { id, session, messages } = await vaultAgentManager.resetVaultSession(vp)
      return { id, session, messages }
    }

    if (action === 'delete') {
      const vp = vaultPath ?? getVaultPath()
      if (vp) {
        vaultAgentManager.abortCurrentVault()
        try {
          const fp = join(vp, SESSIONS_DIR, SESSION_FILE)
          if (existsSync(fp)) await unlink(fp)
        } catch (e) {
          log.warn('[session] delete failed:', e)
        }
      }
      return { ok: true }
    }

    if (action === 'abort') {
      vaultAgentManager.abortCurrentVault()
      return { ok: true }
    }

    return { ok: false, error: 'unknown action: ' + action }
  })
}