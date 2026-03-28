import React, { useState, useRef } from 'react'
import { Send, MessageCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import { cn } from '@/lib/utils'
import { AGENT_DISPLAY_NAMES, type AgentRole } from '@/types'

const API_BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001'

/**
 * AgentChatInput — Allows the user to ask a question directly to the
 * currently active agent during a build. The agent responds in-role
 * without interrupting the main orchestration flow.
 */
export function AgentChatInput() {
  const activeAgentRole = useAppStore((s) => s.activeAgentRole)
  const agentPipeline = useAppStore((s) => s.agentPipeline)
  const addMessage = useChatStore((s) => s.addMessage)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Only show when pipeline is active and an agent is running
  if (!activeAgentRole || agentPipeline === 'idle' || agentPipeline === 'complete') {
    return null
  }

  const agentName = AGENT_DISPLAY_NAMES[activeAgentRole as AgentRole] ?? activeAgentRole

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setLoading(true)

    // Add user message to chat
    addMessage({
      id: `agent-q-${Date.now()}`,
      chatId: '',
      role: 'user',
      type: 'text',
      content: question,
      createdAt: new Date().toISOString(),
    })

    try {
      const res = await fetch(`${API_BASE}/api/agents/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: activeAgentRole,
          message: question,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        addMessage({
          id: `agent-a-${Date.now()}`,
          chatId: '',
          role: 'assistant',
          type: 'text',
          content: `**${agentName}:** ${data.content}`,
          createdAt: new Date().toISOString(),
        })
      } else {
        addMessage({
          id: `agent-err-${Date.now()}`,
          chatId: '',
          role: 'assistant',
          type: 'text',
          content: `*${agentName} is busy processing. Your question has been noted.*`,
          createdAt: new Date().toISOString(),
        })
      }
    } catch {
      addMessage({
        id: `agent-err-${Date.now()}`,
        chatId: '',
        role: 'assistant',
        type: 'text',
        content: `*Unable to reach ${agentName} right now.*`,
        createdAt: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06] bg-base-elevated/30"
    >
      <MessageCircle className="w-3.5 h-3.5 text-accent/60 shrink-0" />
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={`Ask ${agentName}...`}
        disabled={loading}
        className={cn(
          'flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted',
          'outline-none border-none',
          loading && 'opacity-50'
        )}
      />
      <button
        type="submit"
        disabled={!input.trim() || loading}
        className={cn(
          'p-1 rounded-md transition-colors',
          input.trim() && !loading
            ? 'text-accent hover:bg-accent/10'
            : 'text-text-muted/30 cursor-not-allowed'
        )}
      >
        <Send className="w-3 h-3" />
      </button>
    </form>
  )
}
