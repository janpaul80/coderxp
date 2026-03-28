import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, XCircle, Loader2, Clock, ArrowRight, AlertTriangle,
  ChevronDown,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { AgentStatusPayload, AgentRole } from '@/types'
import { AGENT_DISPLAY_NAMES } from '@/types'

// ─── Activity entry ──────────────────────────────────────────

function ActivityEntry({ entry, index }: { entry: AgentStatusPayload; index: number }) {
  const statusIcon = {
    running: <Loader2 className="w-3 h-3 text-accent animate-spin" />,
    complete: <CheckCircle2 className="w-3 h-3 text-success" />,
    error: <XCircle className="w-3 h-3 text-error" />,
    idle: <Clock className="w-3 h-3 text-text-muted" />,
    waiting: <Clock className="w-3 h-3 text-text-muted" />,
    skipped: <ArrowRight className="w-3 h-3 text-text-muted" />,
    recovering: <AlertTriangle className="w-3 h-3 text-warning" />,
    planning: <Loader2 className="w-3 h-3 text-accent animate-spin" />,
  }

  const icon = statusIcon[entry.status as keyof typeof statusIcon] ?? <Clock className="w-3 h-3 text-text-muted" />
  const agentName = entry.agent
    ? AGENT_DISPLAY_NAMES[entry.agent as AgentRole] ?? entry.agent
    : 'System'

  const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const durationMs = entry.meta?.durationMs as number | undefined

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className="flex items-start gap-2 px-3 py-1.5 hover:bg-white/[0.02] rounded-md transition-colors"
    >
      {/* Timeline dot + line */}
      <div className="flex flex-col items-center shrink-0 mt-0.5">
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'text-2xs font-semibold',
            entry.status === 'error' ? 'text-error' :
            entry.status === 'complete' ? 'text-success' :
            entry.status === 'running' ? 'text-accent' :
            'text-text-secondary'
          )}>
            {agentName}
          </span>
          {entry.type === 'pipeline' && (
            <span className="text-2xs text-text-muted bg-white/[0.04] px-1 rounded">pipeline</span>
          )}
        </div>
        <p className="text-2xs text-text-muted truncate">{entry.message}</p>
      </div>

      {/* Timestamp + duration */}
      <div className="shrink-0 text-right">
        <span className="text-2xs text-text-muted font-mono tabular-nums">{time}</span>
        {durationMs !== undefined && (
          <p className="text-2xs text-text-muted font-mono tabular-nums">
            {durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Main component ──────────────────────────────────────────

export function AgentActivityTimeline() {
  const agentStatusLog = useAppStore((s) => s.agentStatusLog)
  const [expanded, setExpanded] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll when new entries arrive (only if expanded)
  React.useEffect(() => {
    if (expanded) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [agentStatusLog.length, expanded])

  if (agentStatusLog.length === 0) return null

  // Show last 5 in collapsed mode, all when expanded
  const visibleEntries = expanded ? agentStatusLog : agentStatusLog.slice(-5)

  return (
    <div className="border border-white/[0.06] rounded-xl bg-base-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-accent/60" />
          <span className="text-xs font-semibold text-text-primary">Activity Log</span>
          <span className="text-2xs text-text-muted bg-white/[0.04] px-1.5 py-0.5 rounded-md font-mono">
            {agentStatusLog.length}
          </span>
        </div>
        <ChevronDown className={cn(
          'w-3.5 h-3.5 text-text-muted transition-transform duration-200',
          !expanded && '-rotate-90'
        )} />
      </button>

      {/* Entries */}
      <AnimatePresence>
        <motion.div
          initial={false}
          animate={{ height: 'auto' }}
          className={cn(
            'overflow-y-auto',
            expanded ? 'max-h-64' : 'max-h-32'
          )}
        >
          <div className="py-1">
            {visibleEntries.map((entry, i) => (
              <ActivityEntry key={`${entry.timestamp}-${i}`} entry={entry} index={i} />
            ))}
            <div ref={endRef} />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
