import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, Cpu, FileCode2, Server, Wrench, ShieldCheck, Rocket,
  Cloud, ImageIcon, Smartphone, Apple, CheckCircle2, XCircle,
  Loader2, Clock, SkipForward, ChevronDown,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { AgentRole, AgentTaskStatus, PipelineStatus } from '@/types'
import { AGENT_DISPLAY_NAMES, AGENT_STEP_LABELS } from '@/types'

// ─── Agent icon map ──────────────────────────────────────────

const AGENT_ICONS: Record<AgentRole, React.ReactNode> = {
  maxclaw: <Brain className="w-3.5 h-3.5" />,
  openclaw: <Cpu className="w-3.5 h-3.5" />,
  planner: <FileCode2 className="w-3.5 h-3.5" />,
  installer: <Server className="w-3.5 h-3.5" />,
  frontend: <FileCode2 className="w-3.5 h-3.5" />,
  backend: <Server className="w-3.5 h-3.5" />,
  fixer: <Wrench className="w-3.5 h-3.5" />,
  qa: <ShieldCheck className="w-3.5 h-3.5" />,
  deploy: <Rocket className="w-3.5 h-3.5" />,
  devops: <Cloud className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
  android: <Smartphone className="w-3.5 h-3.5" />,
  ios: <Apple className="w-3.5 h-3.5" />,
}

// ─── Status badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentTaskStatus }) {
  const config: Record<AgentTaskStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
    idle: { icon: <Clock className="w-2.5 h-2.5" />, color: 'text-text-muted', bg: 'bg-white/[0.04]', label: 'Idle' },
    waiting: { icon: <Clock className="w-2.5 h-2.5" />, color: 'text-text-muted', bg: 'bg-white/[0.04]', label: 'Waiting' },
    running: { icon: <Loader2 className="w-2.5 h-2.5 animate-spin" />, color: 'text-accent', bg: 'bg-accent/10', label: 'Running' },
    complete: { icon: <CheckCircle2 className="w-2.5 h-2.5" />, color: 'text-success', bg: 'bg-success/10', label: 'Done' },
    error: { icon: <XCircle className="w-2.5 h-2.5" />, color: 'text-error', bg: 'bg-error/10', label: 'Error' },
    skipped: { icon: <SkipForward className="w-2.5 h-2.5" />, color: 'text-text-muted', bg: 'bg-white/[0.04]', label: 'Skipped' },
  }

  const c = config[status] ?? config.idle
  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-2xs font-medium', c.color, c.bg)}>
      {c.icon}
      {c.label}
    </span>
  )
}

// ─── Pipeline status header ──────────────────────────────────

function PipelineHeader({ pipeline, progress }: { pipeline: PipelineStatus; progress: { total: number; completed: number; failed: number } }) {
  const pipelineConfig: Record<PipelineStatus, { color: string; label: string; dot: string }> = {
    idle: { color: 'text-text-muted', label: 'Pipeline Idle', dot: 'bg-text-muted' },
    planning: { color: 'text-accent', label: 'Planning', dot: 'bg-accent animate-pulse' },
    running: { color: 'text-accent', label: 'Building', dot: 'bg-accent animate-pulse' },
    recovering: { color: 'text-warning', label: 'Recovering', dot: 'bg-warning animate-pulse' },
    complete: { color: 'text-success', label: 'Complete', dot: 'bg-success' },
    error: { color: 'text-error', label: 'Failed', dot: 'bg-error' },
    cancelled: { color: 'text-text-muted', label: 'Cancelled', dot: 'bg-text-muted' },
  }

  const cfg = pipelineConfig[pipeline] ?? pipelineConfig.idle
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
        <span className={cn('text-xs font-semibold', cfg.color)}>{cfg.label}</span>
      </div>
      {progress.total > 0 && (
        <span className="text-2xs text-text-muted font-mono tabular-nums">
          {progress.completed}/{progress.total} tasks {pct > 0 && `(${pct}%)`}
        </span>
      )}
    </div>
  )
}

// ─── Single agent row ────────────────────────────────────────

function AgentRow({ role, status, isActive }: { role: AgentRole; status: AgentTaskStatus; isActive: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-all duration-200',
        isActive && 'bg-accent/[0.06] border border-accent/15',
        !isActive && status === 'complete' && 'opacity-70',
        !isActive && status === 'idle' && 'opacity-40',
      )}
    >
      {/* Agent icon */}
      <div className={cn(
        'w-6 h-6 rounded-md flex items-center justify-center shrink-0',
        isActive ? 'bg-accent/15 text-accent' :
        status === 'complete' ? 'bg-success/10 text-success' :
        status === 'error' ? 'bg-error/10 text-error' :
        'bg-white/[0.04] text-text-muted'
      )}>
        {AGENT_ICONS[role]}
      </div>

      {/* Agent name + step label */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-xs font-medium truncate',
          isActive ? 'text-text-primary' : 'text-text-secondary'
        )}>
          {AGENT_DISPLAY_NAMES[role]}
        </p>
        {isActive && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-2xs text-accent/80 truncate"
          >
            {AGENT_STEP_LABELS[role]}
          </motion.p>
        )}
      </div>

      {/* Status badge */}
      <StatusBadge status={status} />
    </motion.div>
  )
}

// ─── Main component ──────────────────────────────────────────

export function AgentStatusPanel() {
  const agentPipeline = useAppStore((s) => s.agentPipeline)
  const agentStatuses = useAppStore((s) => s.agentStatuses)
  const activeAgentRole = useAppStore((s) => s.activeAgentRole)
  const agentSnapshot = useAppStore((s) => s.agentSnapshot)
  const [expanded, setExpanded] = React.useState(true)

  // Use snapshot progress if available, otherwise derive from statuses
  const progress = agentSnapshot?.progress ?? {
    total: Object.keys(agentStatuses).length,
    completed: Object.values(agentStatuses).filter(s => s === 'complete').length,
    failed: Object.values(agentStatuses).filter(s => s === 'error').length,
  }

  // Only show if pipeline is active
  if (agentPipeline === 'idle' && Object.keys(agentStatuses).length === 0) {
    return null
  }

  // Core agents that should always show when pipeline is active
  const coreAgents: AgentRole[] = ['planner', 'installer', 'frontend', 'backend', 'fixer', 'qa', 'deploy']
  // Only show specialist agents if they have a status
  const specialistAgents: AgentRole[] = (['devops', 'image', 'android', 'ios'] as AgentRole[])
    .filter(role => agentStatuses[role] !== undefined)

  const allVisibleAgents = [...coreAgents, ...specialistAgents]

  return (
    <div className="border border-white/[0.06] rounded-xl bg-base-card/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-semibold text-text-primary">Agent Pipeline</span>
        </div>
        <ChevronDown className={cn(
          'w-3.5 h-3.5 text-text-muted transition-transform duration-200',
          !expanded && '-rotate-90'
        )} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <PipelineHeader pipeline={agentPipeline} progress={progress} />

            <div className="p-2 space-y-0.5">
              {allVisibleAgents.map(role => (
                <AgentRow
                  key={role}
                  role={role}
                  status={(agentStatuses[role] as AgentTaskStatus) ?? 'idle'}
                  isActive={activeAgentRole === role}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
