import React, { useState } from 'react'
import { Globe, X, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useSocket } from '@/hooks/useSocket'
import { BrowserActionFeed } from './BrowserActionFeed'
import type { BrowserSessionStatus } from '@/types'

// ─── Status config ────────────────────────────────────────────

const STATUS_CONFIG: Record<BrowserSessionStatus, {
  label: string
  color: string
  icon: React.ReactNode
  pulse: boolean
}> = {
  pending_approval: {
    label: 'Awaiting Approval',
    color: 'text-amber-400 border-amber-500/20 bg-amber-500/[0.06]',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    pulse: false,
  },
  active: {
    label: 'Active',
    color: 'text-blue-400 border-blue-500/20 bg-blue-500/[0.06]',
    icon: <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />,
    pulse: true,
  },
  completed: {
    label: 'Completed',
    color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.06]',
    icon: <CheckCircle2 className="w-3 h-3" />,
    pulse: false,
  },
  terminated_by_user: {
    label: 'Terminated',
    color: 'text-white/40 border-white/10 bg-white/[0.03]',
    icon: <X className="w-3 h-3" />,
    pulse: false,
  },
  terminated_timeout: {
    label: 'Timed Out',
    color: 'text-orange-400 border-orange-500/20 bg-orange-500/[0.06]',
    icon: <AlertCircle className="w-3 h-3" />,
    pulse: false,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400 border-red-500/20 bg-red-500/[0.06]',
    icon: <AlertCircle className="w-3 h-3" />,
    pulse: false,
  },
}

// ─── Component ────────────────────────────────────────────────

export function BrowserSessionBadge() {
  const session = useAppStore((s) => s.activeBrowserSession)
  const actions = useAppStore((s) => s.browserActions)
  const clearBrowserSession = useAppStore((s) => s.clearBrowserSession)
  const { terminateBrowserSession } = useSocket()
  const [expanded, setExpanded] = useState(false)

  if (!session) return null

  const config = STATUS_CONFIG[session.status]
  const isActive = session.status === 'active'
  const isDone = ['completed', 'terminated_by_user', 'terminated_timeout', 'failed'].includes(session.status)
  const completedCount = actions.filter((a) => a.status === 'complete').length
  const failedCount = actions.filter((a) => a.status === 'failed').length

  return (
    <div className={`fixed bottom-4 right-4 z-40 w-80 rounded-xl border shadow-2xl overflow-hidden
      ${config.color} transition-all duration-200`}>

      {/* ── Header row ── */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Globe className="w-3.5 h-3.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {config.icon}
            <span className="text-xs font-semibold truncate">{config.label}</span>
          </div>
          {session.domain && (
            <p className="text-[10px] opacity-60 truncate font-mono">{session.domain}</p>
          )}
        </div>

        {/* Action counts */}
        {actions.length > 0 && (
          <div className="flex items-center gap-1 text-[10px] opacity-60">
            <span>{completedCount}/{actions.length}</span>
            {failedCount > 0 && <span className="text-red-400">·{failedCount}✗</span>}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>

        {/* Terminate / dismiss */}
        {isActive ? (
          <button
            onClick={() => terminateBrowserSession(session.id)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
            title="Terminate session"
          >
            <X className="w-3 h-3" />
          </button>
        ) : isDone ? (
          <button
            onClick={clearBrowserSession}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
            title="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>

      {/* ── Expanded action feed ── */}
      {expanded && (
        <div className="border-t border-current/10 px-3 py-2 bg-black/20">
          <BrowserActionFeed actions={actions} />
        </div>
      )}
    </div>
  )
}
