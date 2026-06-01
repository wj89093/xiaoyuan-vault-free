/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef } from 'react'
import type { XyVaultAPI } from '../../shared/window'

const api: XyVaultAPI = window.api

function estimateTokens(s: string): number {
  let t = 0
  for (const c of s) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff]/.test(c)) t += 2
    else t += 0.28
  }
  return Math.max(1, Math.ceil(t) + 8)
}

/**
 * Trim message history to fit within maxTokens.
 * Slides window from the latest message backward,
 * keeping as many recent messages as possible.
 */
function trimContext(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
  const result: ChatMessage[] = []
  let total = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateTokens(messages[i].content)
    if (total + t > maxTokens) break
    total += t
    result.unshift(messages[i])
  }
  // Always keep at least the last message
  if (result.length === 0 && messages.length > 0) {
    result.push(messages[messages.length - 1])
  }
  return result
}


export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  pagesUsed?: Array<{ file: string; title: string }>
  sourceMode?: 'knowledge_base' | 'file'
  toolCalls?: Array<{ name: string; status: 'running' | 'done'; result?: string }>
}

interface UseChatOptions {
  vaultPath: string | null
}

/**
 * Unified chat hook — all conversations go through SelfAgentAdapter via chat:sessionAsk.
 * Uses event-based streaming to update messages incrementally.
 */
export function useChat(
  selectedFile: string | null,
  content: string,
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setChatLoading: (v: boolean) => void,
  options: UseChatOptions,
) {
  const { vaultPath } = options

  // Refs to hold latest state for use inside async callbacks without stale closure
  const messagesRef = useRef(messages)
  const setMessagesRef = useRef(setMessages)
  const setChatLoadingRef = useRef(setChatLoading)
  useEffect(() => {
    messagesRef.current = messages
    setMessagesRef.current = setMessages
    setChatLoadingRef.current = setChatLoading
  })

  // Register stream event listeners once per mount; unregistered on unmount
  useEffect(() => {
    if (!api?.chat) {
      console.error('useChat: api or api.chat is not defined', { api, chat: api?.chat })
      return
    }
    const placeholderIdRef = { current: '' }

    const offChunk = api.chat.onStreamChunk?.((data: { chunk: string } | undefined) => {
      if (!data) return
      setMessagesRef.current(prev => prev.map(m => {
        if (m.id === placeholderIdRef.current) {
          return { ...m, content: (m.content || '') + data.chunk }
        }
        return m
      }))
    })

    const offTool = api.chat.onToolUpdate?.((data: { name: string; args: unknown; status: string; result?: string } | undefined) => {
      if (!data) return
      setMessagesRef.current(prev => prev.map(m => {
        if (m.id === placeholderIdRef.current) {
          const tools = m.toolCalls ? [...m.toolCalls] : []
          const idx = tools.findIndex(t => t.name === data.name)
          if (idx >= 0) {
            tools[idx] = { ...tools[idx], status: data.status as 'running' | 'done', result: data.result }
          } else {
            tools.push({ name: data.name, status: data.status as 'running' | 'done', result: data.result })
          }
          return { ...m, toolCalls: tools }
        }
        return m
      }))
    })

    const offDone = api.chat.onStreamDone?.((data: { answer: string } | undefined) => {
      setChatLoadingRef.current(false)
      setMessagesRef.current(prev => prev.map(m => {
        if (m.id === placeholderIdRef.current) {
          return { ...m, content: data?.answer ?? '暂无回复', toolCalls: [] }
        }
        return m
      }))
    })

    const offError = api.chat.onStreamError?.((data: { error: string } | undefined) => {
      setChatLoadingRef.current(false)
      const errorText = data?.error ?? '请求处理出错'
      const errMsg = errorText.includes('401') || errorText.includes('key')
        ? 'API Key 未配置或无效'
        : errorText.includes('timeout') || errorText.includes('ETIMEDOUT')
        ? '请求超时，请稍后重试'
        : errorText.includes('ECONNREFUSED') || errorText.includes('network')
        ? '网络连接失败'
        : `处理出错：${errorText}`
      setMessagesRef.current(prev => prev.map(m => {
        if (m.id === placeholderIdRef.current) {
          return { ...m, content: errMsg, toolCalls: [] }
        }
        return m
      }))
    })

    // Store placeholderId for cleanup (accessible from handleSendMessage via ref)
    ;(globalThis as any).__chatPlaceholderIdRef = placeholderIdRef

    return () => {
      offChunk?.()
      offTool?.()
      offDone?.()
      offError?.()
    }
  }, [])

  const handleSendMessage = useCallback(async (text: string) => {
    if (!vaultPath) {
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
      }, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: '请先打开知识库',
      }])
      return
    }

    const userMsg = { id: `user-${Date.now()}`, role: 'user' as const, content: text }
    setMessages(prev => [...prev, userMsg])
    setChatLoading(true)

    const placeholderId = `stream-${Date.now()}`
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '正在思考...',
      pagesUsed: [],
      sourceMode: 'knowledge_base',
      toolCalls: [],
    }
    setMessages(prev => [...prev, placeholder])

    ;((globalThis as any).__chatPlaceholderIdRef as { current: string }).current = placeholderId

    const history = trimContext(messagesRef.current, 6000).map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    // Build question with selected file context
    let question = text
    if (selectedFile && content) {
      // File sent with no text → auto-trigger ingest skill
      if (!text.trim()) {
        question = `帮我整理新导入的文件：${selectedFile}`
      } else {
        question = `${text}\n（参考文件: ${selectedFile}）`
      }
    }

    try {
      // Single-session path: chat:sessionAsk handles RAG + streaming + auto-save
      await api.chat.sessionAsk(question, history, vaultPath)
      // Stream events handle UI updates (chat:streamChunk / chat:streamDone / chat:streamError)
    } catch (err: any) {
      setChatLoading(false)
      const msg = err?.message ?? String(err)
      const fallback = msg.includes('key') || msg.includes('401') ? 'API Key 未配置或无效'
        : msg.includes('timeout') || msg.includes('ETIMEDOUT') ? '请求超时，请稍后重试'
        : msg.includes('network') || msg.includes('ECONNREFUSED') ? '网络连接失败'
        : '抱歉，处理请求时出错。'
      setMessages(prev => prev.map(m =>
        m.id === placeholderId ? { ...m, content: fallback, toolCalls: [] } : m
      ))
    }
  }, [content, selectedFile, vaultPath, setChatLoading])

  return { handleSendMessage }
}