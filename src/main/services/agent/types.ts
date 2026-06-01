// Agent types — tool calling, events, messages

// Tool visibility tiers — progressive disclosure strategy
// base: always visible — information gathering (read, web_fetch)
// task: use when base tools insufficient — content creation (write, edit)
// sensitive: use with care — process execution (bash)
export type ToolTier = 'base' | 'task' | 'sensitive'

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    tier: ToolTier
    risk_class: string
    side_effects: string[]
    examples?: string[]
    constraints?: string[]
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string; enum?: string[]; default?: unknown }>
      required: string[]
    }
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** OpenAI /gateway compatible message shape (plain object, not AgentMessage) */
export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  reasoning_content?: string
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; text?: string; name?: string; args?: Record<string, unknown> }>
  tool_calls?: ToolCall[]
  tool_call_id?: string
  toolCallId?: string
  timestamp?: number
  reasoning_content?: string
}

export interface AgentEvent {
  type: 'agent_start' | 'turn_start' | 'message_start' | 'message_end' | 'tool_execution_start' | 'tool_execution_end' | 'turn_end' | 'agent_end' | 'reasoning'
  message?: { role: string; content: string }
  toolCallId?: string
  toolName?: string
  args?: string
  result?: { content: Array<{ type: 'text'; text: string }> }
  messages?: AgentMessage[]
  answer?: string
  [key: string]: unknown
}

export interface ToolResult {
  status: 'success' | 'error' | 'empty'
  summary: string      // short human-readable one-liner
  items?: unknown[]   // structured data (search hits, file list, etc.)
  next_valid_actions?: string[]  // what LLM can do next
  // For error type
  message?: string
}

export type ToolHandler = (args: Record<string, unknown>, signal?: AbortSignal) => Promise<ToolResult>
