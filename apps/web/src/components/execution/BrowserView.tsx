import React from 'react'
import { motion } from 'framer-motion'
import { Globe, Loader2, CheckCircle2, XCircle, StopCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { BrowserActionFeed } from '@/components/browser/BrowserActionFeed'
import { useSocket } from '@/hooks/useSocket'

// ─── Session status badge ─────────────────────────────────────

function SessionStatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        Active
      </span>
    )
  }
  if (status === 'completed') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-white/40">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </span>
    )
  }
  if (status === 'terminated_by_user' || status === 'terminated_timeout') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-400/70">
        <XCircle className="w-3 h-3" />
        Terminated
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-400">
        <XCircle className="w-3 h-3" />
        Failed
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-white/30">
      <Loader2 className="w-3 h-3 animate-spin" />
      Starting…
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────

export function BrowserView() {
  const activeBrowserSession = useAppStore((s) => s.activeBrowserSession)
  const browserActions = useAppStore((s) => s.browserActions)
  const { terminateBrowserSession } = useSocket()

  const isActive = activeBrowserSession?.status === 'active'
  const domain = activeBrowserSession?.domain ?? '…'
  const purpose = activeBrowserSession?.purpose ?? 'Autonomous browser session in progress'
  const plannedActions = activeBrowserSession?.plannedActions ?? []

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white/90 leading-tight">Browser Session</h2>
              <p className="text-[11px] text-white/30 font-mono truncate max-w-[180px]">{domain}</p>
            </div>
          </div>

          {/* Status + terminate */}
          <div className="flex items-center gap-3">
            {activeBrowserSession && (
              <SessionStatusBadge status={activeBrowserSession.status} />
            )}
            {isActive && activeBrowserSession && (
              <button
                onClick={() => terminateBrowserSession(activeBrowserSession.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-red-400/80
                  bg-red-500/[0.06] border border-red-500/10 hover:bg-red-500/10 hover:text-red-400
                  transition-colors"
              >
                <StopCircle className="w-3 h-3" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Purpose */}
        <p className="text-xs text-white/40 mt-2 leading-relaxed">{purpose}</p>
      </div>

      {/* Planned actions (collapsed summary) */}
      {plannedActions.length > 0 && (
        <div className="flex-shrink-0 px-5 py-3 border-b border-white/[0.04]">
          <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">Planned</p>
          <div className="flex flex-wrap gap-1.5">
            {plannedActions.slice(0, 5).map((action, i) => (
              <span
                key={i}
                className="text-[10px] text-white/35 bg-white/[0.03] border border-white/[0.06]
                  rounded px-1.5 py-0.5 truncate max-w-[140px]"
              >
                {action}
              </span>
            ))}
            {plannedActions.length > 5 && (
              <span className="text-[10px] text-white/20">+{plannedActions.length - 5} more</span>
            )}
          </div>
        </div>
      )}

      {/* Live action feed */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <p className="text-[10px] text-white/25 uppercase tracking-wider mb-3">Live Actions</p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <BrowserActionFeed actions={browserActions} maxVisible={30} />
        </motion.div>
      </div>

      {/* Footer — action count */}
      <div className="flex-shrink-0 px-5 py-3 border-t border-white/[0.04]">
        <p className="text-[11px] text-white/20">
          {browserActions.length} action{browserActions.length !== 1 ? 's' : ''} recorded
          {activeBrowserSession?.createdAt && (
            <> · started {new Date(activeBrowserSession.createdAt).toLocaleTimeString()}</>
          )}
        </p>
      </div>
    </div>
  )
}
