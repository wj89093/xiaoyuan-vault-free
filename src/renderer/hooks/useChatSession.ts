import { useState, useCallback, useEffect } from 'react'
import { useChat, type ChatMessage } from './useChat'

export { type ChatMessage } from './useChat'

export function useChatSession(
  selectedFile: string | null,
  content: string,
  vaultPath: string | null
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)

  const { handleSendMessage } = useChat(
    selectedFile,
    content,
    messages,
    setMessages,
    setChatLoading,
    {
      vaultPath
    }
  )

  // Auto-load current session messages on mount (single-session mode)
  useEffect(() => {
    if (!vaultPath) return
    const loadCurrent = async () => {
      try {
        const api = window.api as any
        const result = await api.chat?.session?.({ action: 'get', vaultPath })
        if (result?.messages?.length) {
          setMessages(
            result.messages
              .filter((m: any) => m.role === 'user' || m.role === 'assistant')
              .map((m: any) => ({
                id: m.id ?? crypto.randomUUID(),
                role: m.role,
                content: m.content
              }))
          )
        }
      } catch {
        /* no session yet */
      }
    }
    void loadCurrent()
  }, [vaultPath])

  const handleLoadSession = useCallback(async (sessionId: string) => {
    const api = window.api as any
    const msgs = (await api.chat?.loadSession?.(sessionId)) ?? []
    setMessages(
      msgs.map((m: any) => ({
        id: m.id ?? crypto.randomUUID(),
        role: m.role,
        content: m.content
      }))
    )
  }, [])

  const handleSaveToVault = useCallback(
    async (msgId: string, handleSaveAIMessage: (content: string) => Promise<void>) => {
      const msg = messages.find((m: any) => m.id === msgId || m.id === undefined)
      if (msg) await handleSaveAIMessage(msg.content)
    },
    [messages]
  )

  return {
    messages,
    chatLoading,
    setMessages,
    handleSendMessage,
    handleLoadSession,
    handleSaveToVault
  }
}
