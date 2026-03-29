import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Zap, User, AlertCircle, CheckCircle2, Wrench, Key, Play, X } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { getSocket } from '@/lib/socket'
import { useAppStore } from '@/store/appStore'
import type { Message } from '@/types'
import { MermaidBlock } from './MermaidBlock'
import { ErrorAnalysisCard } from './ErrorAnalysisCard'

// ─── Avatar ───────────────────────────────────────────────────

function AssistantAvatar() {
  return (
    <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center shrink-0">
      <Zap className="w-3 h-3 text-white/70" />
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

// ─── Markdown components ──────────────────────────────────────

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  // Code blocks — detect mermaid and render diagram, else syntax-highlight
  code({ className, children, ...props }) {
    const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? ''
    const code = String(children).replace(/\n$/, '')
    if (lang === 'mermaid') {
      return <MermaidBlock code={code} />
    }
    return (
      <code
        className={cn(
          'font-mono text-xs',
          lang
            ? 'block overflow-x-auto rounded-lg bg-black/40 border border-white/[0.08] p-3 my-2 text-text-primary'
            : 'inline rounded px-1 py-0.5 bg-white/[0.08] text-accent'
        )}
        {...props}
      >
        {children}
      </code>
    )
  },
  pre({ children }) {
    return <>{children}</>
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  },
  ul({ children }) {
    return <ul className="list-disc list-inside mb-2 space-y-0.5 text-text-primary">{children}</ul>
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside mb-2 space-y-0.5 text-text-primary">{children}</ol>
  },
  li({ children }) {
    return <li className="text-sm leading-relaxed">{children}</li>
  },
  h1({ children }) {
    return <h1 className="text-base font-semibold text-text-primary mb-2 mt-3 first:mt-0">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-sm font-semibold text-text-primary mb-1.5 mt-2.5 first:mt-0">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-sm font-medium text-text-secondary mb-1 mt-2 first:mt-0">{children}</h3>
  },
  strong({ children }) {
    return <strong className="font-semibold text-text-primary">{children}</strong>
  },
  em({ children }) {
    return <em className="italic text-text-secondary">{children}</em>
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-text-secondary italic">
        {children}
      </blockquote>
    )
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse border border-white/[0.08] rounded-lg overflow-hidden">
          {children}
        </table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="bg-white/[0.05]">{children}</thead>
  },
  th({ children }) {
    return <th className="px-3 py-2 text-left font-medium text-text-secondary border-b border-white/[0.08]">{children}</th>
  },
  td({ children }) {
    return <td className="px-3 py-2 text-text-primary border-b border-white/[0.04] last:border-0">{children}</td>
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
      >
        {children}
      </a>
    )
  },
  hr() {
    return <hr className="border-white/[0.08] my-3" />
  },
  // Task list items (remark-gfm)
  input({ type, checked }) {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-1.5 accent-accent"
        />
      )
    }
    return null
  },
}

// ─── Message content renderer ─────────────────────────────────

function MessageContent({ message, rich = false }: { message: Message; rich?: boolean }) {
  if (rich) {
    return (
      <div className="text-sm leading-relaxed text-[#F3F4F6] prose-invert max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {message.content}
        </ReactMarkdown>
        {message.isStreaming && <StreamingCursor />}
      </div>
    )
  }

  const lines = message.content.split('\n')
  return (
    <div className="text-sm leading-relaxed text-[#F3F4F6]">
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
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1D1D1D] border border-white/[0.05]">
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
        <div className="bg-[#1D1D1D] rounded-2xl rounded-tr-sm px-4 py-2.5">
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
  // Use rich markdown for plain text assistant messages (not special status messages)
  const useRich = message.type === 'text'

  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5">
      <AssistantAvatar />
      <div className="flex flex-col gap-1 max-w-[90%]">
        <div className={cn(
          'rounded-2xl rounded-tl-sm px-4 py-2.5',
          isSpecial
            ? 'bg-[#1D1D1D] border border-white/[0.08]'
            : 'bg-[#1D1D1D]'
        )}>
          {isSpecial && (
            <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/[0.06]">
              <MessageTypeIcon type={message.type} />
              <span className="text-xs font-medium text-text-secondary capitalize">
                {message.type.replace(/_/g, ' ')}
              </span>
            </div>
          )}
          <MessageContent message={message} rich={useRich} />
        </div>
        <span className="text-2xs text-text-muted px-1">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ─── Continuation action card ─────────────────────────────────

function ContinuationCard({ message }: { message: Message }) {
  const suggestion = message.metadata?.continuationSuggestion
  const setPendingContinuationSuggestion = useAppStore((s) => s.setPendingContinuationSuggestion)

  if (!suggestion) return <AssistantMessage message={message} />

  const handleApprove = () => {
    getSocket().emit('job:continuation_approve', {
      existingJobId: suggestion.jobId,
      request: suggestion.request,
    })
    setPendingContinuationSuggestion(null)
  }

  const handleDismiss = () => {
    setPendingContinuationSuggestion(null)
  }

  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5">
      <AssistantAvatar />
      <div className="flex flex-col gap-1 max-w-[90%]">
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-[#1D1D1D] border border-accent/25">
          <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/[0.06]">
            <Play className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-xs font-medium text-accent">Continue Build</span>
          </div>
          <p className="text-sm text-text-primary mb-3">{message.content}</p>
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-medium hover:bg-accent/25 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve
            </button>
            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.10] text-text-secondary text-xs hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Dismiss
            </button>
          </div>
        </div>
        <span className="text-2xs text-text-muted px-1">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ─── Repair action card ───────────────────────────────────────

function RepairCard({ message }: { message: Message }) {
  const suggestion = message.metadata?.repairSuggestion
  const setPendingRepairSuggestion = useAppStore((s) => s.setPendingRepairSuggestion)

  if (!suggestion) return <AssistantMessage message={message} />

  const handleApprove = () => {
    if (suggestion.canAutoRepair) {
      getSocket().emit('job:targeted_repair', {
        jobId: suggestion.jobId,
        complaint: suggestion.complaint ?? '',
      })
    } else {
      getSocket().emit('job:repair', { jobId: suggestion.jobId })
    }
    setPendingRepairSuggestion(null)
  }

  const handleDismiss = () => {
    setPendingRepairSuggestion(null)
  }

  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5">
      <AssistantAvatar />
      <div className="flex flex-col gap-1 max-w-[90%]">
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-[#1D1D1D] border border-warning/25">
          <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/[0.06]">
            <Wrench className="w-3.5 h-3.5 text-warning shrink-0" />
            <span className="text-xs font-medium text-warning">
              {suggestion.canAutoRepair ? 'Auto-Repair Available' : 'Repair Build'}
            </span>
          </div>
          <p className="text-sm text-text-primary mb-3">{message.content}</p>
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {suggestion.canAutoRepair ? 'Auto-Repair' : 'Repair'}
            </button>
            <button
              onClick={handleDismiss}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.10] text-text-secondary text-xs hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Dismiss
            </button>
          </div>
        </div>
        <span className="text-2xs text-text-muted px-1">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
    </div>
  )
}

// ─── Error analysis card wrapper ──────────────────────────────

function ErrorAnalysisMessage({ message }: { message: Message }) {
  const errorAnalysis = message.metadata?.errorAnalysis
  const attempt = message.metadata?.autoRepairAttempt ?? 0

  if (!errorAnalysis) return <AssistantMessage message={message} />

  return (
    <div className="flex items-start gap-2.5 px-4 py-1.5">
      <AssistantAvatar />
      <div className="flex flex-col gap-1 max-w-[92%] w-full">
        <ErrorAnalysisCard
          errorAnalysis={errorAnalysis}
          attempt={attempt}
          autoRepairTriggered={true}
        />
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

  if (message.type === 'continuation_suggested') {
    return <ContinuationCard message={message} />
  }

  if (message.type === 'repair_suggested') {
    return <RepairCard message={message} />
  }

  if (message.type === 'error_analysis') {
    return <ErrorAnalysisMessage message={message} />
  }

  return <AssistantMessage message={message} />
}
