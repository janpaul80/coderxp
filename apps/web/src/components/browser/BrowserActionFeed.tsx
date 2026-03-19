import React from 'react'
import { Loader2, CheckCircle2, XCircle, Clock, Globe, MousePointer2, Keyboard, Camera, Scroll, AlignLeft } from 'lucide-react'
import type { BrowserAction, BrowserActionType } from '@/types'

// ─── Action type icon map ─────────────────────────────────────

const ACTION_ICONS: Record<BrowserActionType, React.ReactNode> = {
  navigate:     <Globe className="w-3.5 h-3.5" />,
  click:        <MousePointer2 className="w-3.5 h-3.5" />,
  type_text:    <Keyboard className="w-3.5 h-3.5" />,
  screenshot:   <Camera className="w-3.5 h-3.5" />,
  wait:         <Clock className="w-3.5 h-3.5" />,
  scroll:       <Scroll className="w-3.5 h-3.5" />,
  extract_text: <AlignLeft className="w-3.5 h-3.5" />,
}

// ─── Status indicator ─────────────────────────────────────────

function StatusIcon({ status }: { status: BrowserAction['status'] }) {
  if (status === 'executing') {
    return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
  }
  if (status === 'complete') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
  }
  if (status === 'failed') {
    return <XCircle className="w-3.5 h-3.5 text-red-400" />
  }
  return <Clock className="w-3.5 h-3.5 text-white/20" />
}

// ─── Single action row ────────────────────────────────────────

function ActionRow({ action }: { action: BrowserAction }) {
  const isExecuting = action.status === 'executing'
  const isFailed = action.status === 'failed'

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors
      ${isExecuting ? 'bg-blue-500/[0.06] border border-blue-500/10' : 'bg-white/[0.02]'}
    `}>
      {/* Action type icon */}
      <div className="flex-shrink-0 w-6 h-6 rounded-md bg-white/[0.04] flex items-center justify-center
        text-white/30 mt-0.5">
        {ACTION_ICONS[action.type] ?? <Globe className="w-3.5 h-3.5" />}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-relaxed truncate
          ${isFailed ? 'text-red-400/80' : isExecuting ? 'text-white/80' : 'text-white/50'}
        `}>
          {action.description}
        </p>
        {action.error && (
          <p className="text-xs text-red-400/60 mt-0.5 truncate">{action.error}</p>
        )}
        {action.executedAt && (
          <p className="text-[10px] text-white/20 mt-0.5">
            {new Date(action.executedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0 mt-0.5">
        <StatusIcon status={action.status} />
      </div>
    </div>
  )
}

// ─── Feed component ───────────────────────────────────────────

interface BrowserActionFeedProps {
  actions: BrowserAction[]
  maxVisible?: number
}

export function BrowserActionFeed({ actions, maxVisible = 20 }: BrowserActionFeedProps) {
  const visible = actions.slice(-maxVisible)

  if (visible.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-white/20">
        Waiting for actions…
      </div>
    )
  }

  return (
    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
      {visible.map((action) => (
        <ActionRow key={action.id} action={action} />
      ))}
    </div>
  )
}
