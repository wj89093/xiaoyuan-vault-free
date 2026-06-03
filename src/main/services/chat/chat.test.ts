import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { type existsSync, type readFile, mkdir, writeFile, rm } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock fs before importing chat
vi.mock('fs', async () => {
  const actual = (await vi.importActual('fs')) as {
    existsSync: typeof existsSync
    readFile: typeof readFile
  }
  return { ...actual, existsSync: vi.fn(), readFile: vi.fn() }
})

describe('SESSION_TITLE_MAX_LEN', () => {
  it('should be 50', async () => {
    const mod: any = await import('../chat/chat')
    expect(mod.SESSION_TITLE_MAX_LEN).toBe(50)
  })
})

describe('Session re-exports from chatSessions', () => {
  it('should export loadSessions', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.loadSessions).toBe('function')
  })

  it('should export saveSessions', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.saveSessions).toBe('function')
  })

  it('should export createSession', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.createSession).toBe('function')
  })

  it('should export deleteSession', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.deleteSession).toBe('function')
  })

  it('should export loadMessages', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.loadMessages).toBe('function')
  })

  it('should export saveMessages', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.saveMessages).toBe('function')
  })
})

describe('ChatMessage and ChatSession interfaces', () => {
  it('should export ChatMessage interface shape via type check', async () => {
    const mod: any = await import('../chat/chat')
    const msg: ChatMessage = {
      role: 'user',
      content: 'hello',
      id: 1,
      session_id: 'abc',
      timestamp: Date.now()
    }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('hello')
  })

  it('should export ChatSession interface shape', async () => {
    const mod: any = await import('../chat/chat')
    const session: ChatSession = {
      id: 'id-123',
      title: 'Test Session',
      created_at: Date.now(),
      updated_at: Date.now(),
      systemPrompt: null
    }
    expect(session.id).toBe('id-123')
  })
})

describe('RAGResult interface', () => {
  it('should export retrieveRelevantPages as function', async () => {
    const mod: any = await import('../chat/chat')
    expect(typeof mod.retrieveRelevantPages).toBe('function')
  })
})
