import React from 'react'
import { Zap, User, AlertCircle, CheckCircle2, Wrench, Key } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Message } from '@/types'

// ─── Avatar ───────────────────────────────────────────────────

function AssistantAvatar() {
  return (
    <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/20 flex items-center justify-center shrink-0">
      <Zap className="w-3 h-3 text-accent" />
    </div>
  )
}

function UserAvatar() {
  return (
    <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center shrink-0">
      <User className="w-3 h-3 text-text-secondary" />
    </div>
  )
}

// ─── Message type icons ───────────────────────────────────────

function MessageTypeIcon({ type }: { type: Message['type'] }) {
  switch (type) {
    case 'build_complete':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />
    case 'repair_start':
    case 'repair_complete':
      return <Wrench className="w-3.5 h-3.5 text-warning shrink-0" />
    case 'credential_request':
      return <Key className="w-3.5 h-3.5 text-info shrink-0" />
    default:
      return null
  }
}

// ─── Streaming cursor ─────────────────────────────────────────

function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 cursor-blink align-middle" />
  )
}

// ─── Message content renderer ─────────────────────────────────

function MessageContent({ message }: { message: Message }) {
  const lines = message.content.split('\n')

  return (
    <div className="text-sm leading-relaxed text-text-primary">
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
      {message.isStreaming && <StreamingCursor />}
    </div>
  )
}

// ─── System message ───────────────────────────────────────────

function SystemMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-center px-4 py-1">
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-base-elevated border border-white/[0.05]">
        <MessageTypeIcon type={message.type} />
        <span className="text-xs text-text-muted">{message.content}</span>
      </div>
    </div>
  )
}

// ─── User message ─────────────────────────────────────────────

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5 justify-end">
      <div className="flex flex-col items-end gap-1 max-w-[85%]">
        <div className="bg-accent/10 border border-accent/15 rounded-2xl rounded-tr-sm px-4 py-2.5">
          <MessageContent message={message} />
        </div>
        <span className="text-2xs text-text-muted px-1">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
      <UserAvatar />
    </div>
  )
}

// ─── Assistant message ────────────────────────────────────────

function AssistantMessage({ message }: { message: Message }) {
  const isSpecial = ['build_complete', 'error', 'repair_start', 'repair_complete', 'credential_request'].includes(message.type)

  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5">
      <AssistantAvatar />
      <div className="flex flex-col gap-1 max-w-[90%]">
        <div className={cn(
          'rounded-2xl rounded-tl-sm px-4 py-2.5',
          isSpecial
            ? 'bg-base-elevated border border-white/[0.08]'
            : 'bg-base-elevated border border-white/[0.06]'
        )}>
          {isSpecial && (
            <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/[0.06]">
              <MessageTypeIcon type={message.type} />
              <span className="text-xs font-medium text-text-secondary capitalize">
                {message.type.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          <MessageContent message={message} />
        </div>
        <span className="text-2xs text-text-muted px-1">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────

export function ChatMessage({ message }: { message: Message }) {
  if (message.role === 'system') {
    return <SystemMessage message={message} />
  }

  if (message.role === 'user') {
    return <UserMessage message={message} />
  }

  return <AssistantMessage message={message} />
}
