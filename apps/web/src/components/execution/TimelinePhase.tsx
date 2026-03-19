import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, AlertCircle, Loader2, Circle,
  Wrench, ChevronDown, ChevronRight, FilePlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TimelineEvent } from './TimelineEvent'
import type { ExecutionPhase, ExecutionPhaseStatus } from '@/types'

// ─── Elapsed formatter ────────────────────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

// ─── Phase status icon ────────────────────────────────────────

function PhaseStatusIcon({ status, isRepair }: { status: ExecutionPhaseStatus; isRepair?: boolean }) {
  // Repair phase actively running → animated wrench in amber
  if (isRepair && status === 'running') {
    return (
      <motion.div
        animate={{ rotate: [0, 12, -12, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        className="shrink-0"
      >
        <Wrench className="w-3.5 h-3.5 text-warning" />
      </motion.div>
    )
  }
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-error shrink-0" />
    case 'running':
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="shrink-0"
        >
          <Loader2 className="w-3.5 h-3.5 text-accent" />
        </motion.div>
      )
    case 'repair':
      return <Wrench className="w-3.5 h-3.5 text-warning shrink-0" />
    case 'pending':
    default:
      return <Circle className="w-3.5 h-3.5 text-text-muted/40 shrink-0" />
  }
}

// ─── Phase summary (collapsed state) ─────────────────────────

function PhaseSummary({ phase }: { phase: ExecutionPhase }) {
  const fileCreates = phase.events.filter(e => e.type === 'create' && e.filePath)
  const fileUpdates = phase.events.filter(e => e.type === 'update' && e.filePath)
  const hasError = phase.events.some(e => e.type === 'error')

  const parts: string[] = []
  if (fileCreates.length > 0) parts.push(`${fileCreates.length} file${fileCreates.length !== 1 ? 's' : ''} created`)
  if (fileUpdates.length > 0) parts.push(`${fileUpdates.length} updated`)
  if (hasError) parts.push('errors')
  if (parts.length === 0 && phase.events.length > 0) {
    // Show last message as summary
    const last = phase.events[phase.events.length - 1]
    parts.push(last.message.slice(0, 60) + (last.message.length > 60 ? '…' : ''))
  }

  return (
    <span className="text-2xs text-text-muted truncate max-w-[200px]">
      {parts.join(' · ') || 'Done'}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────

interface TimelinePhaseProps {
  phase: ExecutionPhase
  isLast: boolean
}

export function TimelinePhase({ phase, isLast }: TimelinePhaseProps) {
  // Running and failed phases always expanded; completed phases start collapsed
  const [isExpanded, setIsExpanded] = useState(
    phase.status === 'running' || phase.status === 'failed' || phase.status === 'repair'
  )

  // Auto-expand when phase transitions to running
  useEffect(() => {
    if (phase.status === 'running' || phase.status === 'failed' || phase.status === 'repair') {
      setIsExpanded(true)
    } else if (phase.status === 'complete') {
      // Collapse on completion
      setIsExpanded(false)
    }
  }, [phase.status])

  const isPending = phase.status === 'pending'
  // isRepair is true for the repair phase regardless of whether it's running or done
  const isRepair = phase.step === 'repair'
  const isRunning = phase.status === 'running'
  const isComplete = phase.status === 'complete'
  const isFailed = phase.status === 'failed'
  const canToggle = !isPending && phase.events.length > 0

  // File count badge for completed phases
  const fileCount = phase.events.filter(e => e.type === 'create' && e.filePath).length

  return (
    <div className={cn(
      'relative',
      // Repair phase: amber left border
      isRepair && 'border-l-2 border-warning/50 pl-2 ml-1',
    )}>
      {/* ── Connector line ──────────────────────────────── */}
      {!isLast && (
        <div className={cn(
          'absolute left-[6px] top-6 bottom-0 w-px',
          isPending ? 'bg-white/[0.04]' : isRepair ? 'bg-warning/20' : 'bg-white/[0.08]'
        )} />
      )}

      {/* ── Phase header ────────────────────────────────── */}
      <button
        onClick={() => canToggle && setIsExpanded(v => !v)}
        disabled={!canToggle}
        className={cn(
          'w-full flex items-center gap-2.5 py-1.5 px-1 rounded-md text-left',
          'transition-colors duration-150',
          canToggle && 'hover:bg-white/[0.03] cursor-pointer',
          !canToggle && 'cursor-default',
        )}
      >
        {/* Status icon */}
        <PhaseStatusIcon status={phase.status} isRepair={isRepair} />

        {/* Phase label */}
        <span className={cn(
          'text-xs font-medium flex-1 truncate',
          isPending && 'text-text-muted/50',
          !isRepair && isRunning && 'text-text-primary',
          isComplete && 'text-text-secondary',
          isFailed && 'text-error',
          isRepair && 'text-warning',
        )}>
          {phase.label}
        </span>

        {/* File count badge (complete phases with files) */}
        {isComplete && fileCount > 0 && (
          <span className="flex items-center gap-1 text-2xs text-text-muted shrink-0">
            <FilePlus className="w-2.5 h-2.5" />
            {fileCount}
          </span>
        )}

        {/* Elapsed time */}
        {phase.elapsedMs !== null && (
          <span className="text-2xs text-text-muted font-mono shrink-0 tabular-nums">
            {formatElapsed(phase.elapsedMs)}
          </span>
        )}

        {/* Running pulse dot */}
        {isRunning && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
        )}

        {/* Expand/collapse chevron */}
        {canToggle && (
          <span className="text-text-muted shrink-0">
            {isExpanded
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
          </span>
        )}
      </button>

      {/* ── Collapsed summary (complete phases only) ────── */}
      {isComplete && !isExpanded && phase.events.length > 0 && (
        <div className="pl-6 pb-1">
          <PhaseSummary phase={phase} />
        </div>
      )}

      {/* ── Event list ──────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isExpanded && phase.events.length > 0 && (
          <motion.div
            key="events"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className={cn(
              'pl-5 pb-1 space-y-0',
              // Repair phase: amber tint background
              isRepair && 'bg-warning/[0.03] rounded-md',
            )}>
              {phase.events.map((event, i) => (
                <TimelineEvent
                  key={event.id}
                  log={event}
                  isNew={isRunning && i === phase.events.length - 1}
                  isRepair={isRepair}
                />
              ))}

              {/* Live cursor for running phase */}
              {isRunning && (
                <div className="flex items-center gap-1.5 py-0.5 px-2">
                  <span className="text-2xs font-mono text-accent/60">▶</span>
                  <span className="w-1.5 h-3 bg-accent/50 cursor-blink" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
