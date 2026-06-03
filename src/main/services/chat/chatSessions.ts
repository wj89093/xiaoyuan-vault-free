import { join } from 'path'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { createHash } from 'crypto'
import { getVaultPath } from '../database/database'
import log from 'electron-log/main'
// AgentMessage 在 Free 仓 inline 定义
interface AgentMessage { role: string; content: string; timestamp?: number }
import type { ChatSession, ChatMessage } from '../chat/chat'

const SESSIONS_FILE = 'chat-sessions.json'
const SHA256_SLICE = 16

function isValidSession(obj: unknown): obj is ChatSession {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as Record<string, unknown>).id === 'string' &&
    'title' in obj &&
    typeof (obj as Record<string, unknown>).title === 'string' &&
    'created_at' in obj &&
    typeof (obj as Record<string, unknown>).created_at === 'number' &&
    'updated_at' in obj &&
    typeof (obj as Record<string, unknown>).updated_at === 'number' &&
    (!('systemPrompt' in obj) ||
      obj['systemPrompt'] === null ||
      typeof obj['systemPrompt'] === 'string')
  )
}

function isValidMessage(obj: unknown): obj is ChatMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'role' in obj &&
    typeof (obj as Record<string, unknown>).role === 'string' &&
    'content' in obj &&
    typeof (obj as Record<string, unknown>).content === 'string'
  )
}

export async function getSessionsDir(): Promise<string> {
  const vaultPath = getVaultPath()
  if (!vaultPath) throw new Error('No vault open')
  const dir = join(vaultPath, '.xiaoyuan', 'chat')
  if (!existsSync(dir)) await mkdir(dir, { recursive: true })
  return dir
}

export async function loadSessions(): Promise<ChatSession[]> {
  try {
    const dir = await getSessionsDir()
    const sessionsFile = join(dir, SESSIONS_FILE)
    if (!existsSync(sessionsFile)) return []
    const raw = await readFile(sessionsFile, 'utf-8')
    let parsed: unknown[]
    try {
      parsed = JSON.parse(raw) as unknown[]
    } catch (err) {
      log.error('[chat] loadSessions: JSON parse failed', err)
      return []
    }
    const sessions: ChatSession[] = parsed.filter(isValidSession)
    return sessions
  } catch (err) {
    log.warn('[chat] loadSessions:', err)
    return []
  }
}

export async function saveSessions(sessions: ChatSession[]): Promise<void> {
  const dir = await getSessionsDir()
  // Backup before write
  try {
    const backupFile = join(dir, `${SESSIONS_FILE}.bak`)
    if (existsSync(join(dir, SESSIONS_FILE))) {
      await writeFile(backupFile, await readFile(join(dir, SESSIONS_FILE), 'utf-8'), 'utf-8')
    }
  } catch {
    /* ignore backup failures */
  }
  await writeFile(join(dir, SESSIONS_FILE), JSON.stringify(sessions, null, 2), 'utf-8')
}

export const SESSION_TITLE_MAX_LEN = 50

export async function createSession(firstQuestion: string): Promise<ChatSession> {
  const sessions = await loadSessions()
  const id = createHash('sha256')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .slice(0, SHA256_SLICE)

  const session: ChatSession = {
    id,
    title: firstQuestion.slice(0, SESSION_TITLE_MAX_LEN),
    created_at: Date.now(),
    updated_at: Date.now(),
    systemPrompt: null
  }

  sessions.unshift(session)
  await saveSessions(sessions)
  return session
}

export async function updateSessionSystemPrompt(
  sessionId: string,
  systemPrompt: string | null
): Promise<void> {
  const sessions = await loadSessions()
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx === -1) {
    log.warn('[chat] updateSessionSystemPrompt: session not found', sessionId)
    return
  }
  sessions[idx].systemPrompt = systemPrompt
  sessions[idx].updated_at = Date.now()
  await saveSessions(sessions)
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sessions = await loadSessions()
  const filtered = sessions.filter((s) => s.id !== sessionId)
  await saveSessions(filtered)

  // Delete messages file
  try {
    const dir = await getSessionsDir()
    const msgFile = join(dir, `${sessionId}.json`)
    if (existsSync(msgFile)) {
      await unlink(msgFile)
    }
  } catch (err) {
    log.warn('[chat] deleteMsg:', err)
  }
}

export async function loadMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const dir = await getSessionsDir()
    const msgFile = join(dir, `${sessionId}.json`)
    if (!existsSync(msgFile)) return []
    const raw = await readFile(msgFile, 'utf-8')
    return JSON.parse(raw) as ChatMessage[]
  } catch (err) {
    log.warn('[chat] loadMessages:', err)
    return []
  }
}

// Adapter: AgentMessage fields map cleanly onto ChatMessage fields.
// tool_calls → saved as JSON but ignored by isValidMessage; tool role messages store content as result string.
// We accept AgentMessage[] here so callers don't need a cast.
export async function saveMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
  const validMessages = messages.filter(isValidMessage)
  const vaultPath = getVaultPath()
  const dir = vaultPath ? join(vaultPath, '.xiaoyuan', 'chat', 'messages') : ''
   
  await writeFile(join(dir, `${sessionId}.json`), JSON.stringify(validMessages, null, 2), 'utf-8')

  // Update session timestamp
  const sessions = await loadSessions()
  const idx = sessions.findIndex((s) => s.id === sessionId)
  if (idx >= 0) {
    sessions[idx].updated_at = Date.now()
    await saveSessions(sessions)
  }
}
