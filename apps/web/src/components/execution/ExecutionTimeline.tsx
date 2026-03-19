import React, { useMemo, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FilePlus, FileEdit, Zap } from 'lucide-react'
import { TimelinePhase } from './TimelinePhase'
import type { JobLog, JobStatus, ExecutionPhase, ExecutionPhaseStatus } from '@/types'

// ─── Phase order & labels ─────────────────────────────────────

const PHASE_ORDER = [
  'workspace_prepare',
  'scaffold_generate',
  'files_write',
  'install_deps',
  'preview_start',
  'preview_healthcheck',
  'complete',
] as const

const PHASE_LABELS: Record<string, string> = {
  workspace_prepare: 'Workspace Setup',
  scaffold_generate: 'Scaffold Generation',
  files_write: 'File Creation',
  install_deps: 'Dependency Install',
  preview_start: 'Preview Start',
  preview_healthcheck: 'Health Check',
  complete: 'Complete',
  repair: 'Auto-Repair',
}

// ─── Phase grouping logic ─────────────────────────────────────

function groupLogsIntoPhases(logs: JobLog[], jobStatus: JobStatus): ExecutionPhase[] {
  const phaseMap = new Map<string, JobLog[]>()
  for (const log of logs) {
    const step = log.step ?? 'workspace_prepare'
    if (!phaseMap.has(step)) phaseMap.set(step, [])
    phaseMap.get(step)!.push(log)
  }

  const isJobDone = jobStatus === 'complete' || jobStatus === 'failed'
  const isRepairing = jobStatus === 'repairing'

  const lastStep = logs.length > 0 ? (logs[logs.length - 1].step ?? 'workspace_prepare') : null
  const lastStepIdx = lastStep ? PHASE_ORDER.indexOf(lastStep as typeof PHASE_ORDER[number]) : -1

  const phases: ExecutionPhase[] = []

  for (let i = 0; i < PHASE_ORDER.length; i++) {
    const step = PHASE_ORDER[i]
    const events = phaseMap.get(step) ?? []

    if (events.length === 0) {
      if (step === 'complete') continue
      if (lastStepIdx >= 0 && i <= lastStepIdx) continue

      phases.push({
        step,
        label: PHASE_LABELS[step] ?? step,
        status: 'pending' as ExecutionPhaseStatus,
        startedAt: null,
        completedAt: null,
        events: [],
        elapsedMs: null,
      })
      continue
    }

    let status: ExecutionPhaseStatus
    if (step === lastStep && !isJobDone && !isRepairing) {
      status = 'running'
    } else if (step === lastStep && jobStatus === 'failed') {
      status = 'failed'
    } else {
      status = 'complete'
    }

    const startedAt = events[0].timestamp
    const completedAt = status === 'running' ? null : events[events.length - 1].timestamp
    const elapsedMs =
      startedAt && completedAt
        ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
        : null

    phases.push({
      step,
      label: PHASE_LABELS[step] ?? step,
      status,
      startedAt,
      completedAt,
      events,
      elapsedMs,
    })
  }

  // Repair phase
  const repairEvents = phaseMap.get('repair') ?? []
  if (repairEvents.length > 0 || isRepairing) {
    const repairStatus: ExecutionPhaseStatus = isRepairing ? 'running' : 'repair'
    const startedAt = repairEvents[0]?.timestamp ?? null
    const completedAt = isRepairing ? null : repairEvents[repairEvents.length - 1]?.timestamp ?? null
    phases.push({
      step: 'repair',
      label: PHASE_LABELS['repair'],
      status: repairStatus,
      startedAt,
      completedAt,
      events: repairEvents,
      elapsedMs:
        startedAt && completedAt
          ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
          : null,
    })
  }

  return phases
}

// ─── Demo phases (no logs yet) ────────────────────────────────

function buildDemoPhases(): ExecutionPhase[] {
  return PHASE_ORDER.filter(s => s !== 'complete').map((step, i) => ({
    step,
    label: PHASE_LABELS[step] ?? step,
    status: i === 0 ? ('running' as ExecutionPhaseStatus) : ('pending' as ExecutionPhaseStatus),
    startedAt: i === 0 ? new Date().toISOString() : null,
    completedAt: null,
    events: i === 0
      ? [
          {
            id: 'demo-1',
            timestamp: new Date().toISOString(),
            type: 'log' as const,
            message: 'Preparing workspace...',
            step: 'workspace_prepare',
          },
        ]
      : [],
    elapsedMs: null,
  }))
}

// ─── LiveActivityBar ──────────────────────────────────────────
// Shows the most recent file-write event with a typewriter path animation.
// Only visible during active building (non-terminal, has file events).

interface LiveActivityBarProps {
  logs: JobLog[]
  status: JobStatus
}

function LiveActivityBar({ logs, status }: LiveActivityBarProps) {
  const isActive = status !== 'complete' && status !== 'failed'
  const [displayPath, setDisplayPath] = useState('')
  const [prevPath, setPrevPath] = useState('')

  // Find the most recent file event
  const lastFileLog = useMemo(() => {
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i]
      if ((log.type === 'create' || log.type === 'update') && log.filePath) {
        return log
      }
    }
    return null
  }, [logs])

  // Count total files created so far
  const totalFilesCreated = useMemo(
    () => logs.filter(l => l.type === 'create' && l.filePath).length,
    [logs]
  )

  // Typewriter effect for the file path
  useEffect(() => {
    if (!lastFileLog?.filePath) return
    const newPath = lastFileLog.filePath
    if (newPath === prevPath) return

    setPrevPath(newPath)
    setDisplayPath('')

    let i = 0
    const interval = setInterval(() => {
      i++
      setDisplayPath(newPath.slice(0, i))
      if (i >= newPath.length) clearInterval(interval)
    }, 18)

    return () => clearInterval(interval)
  }, [lastFileLog?.filePath, prevPath])

  if (!isActive || !lastFileLog) return null

  const isCreate = lastFileLog.type === 'create'

  return (
    <AnimatePresence>
      <motion.div
        key="live-activity"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }}
        className="mx-3 mb-3 px-3 py-2 rounded-lg bg-surface/60 border border-border/30 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2">
          {/* Animated pulse dot */}
          <span className="relative flex-shrink-0">
            <span className="absolute inset-0 rounded-full bg-accent/40 animate-ping" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-accent block" />
          </span>

          {/* File icon */}
          <span className={isCreate ? 'text-success' : 'text-info'}>
            {isCreate
              ? <FilePlus className="w-3 h-3" />
              : <FileEdit className="w-3 h-3" />
            }
          </span>

          {/* Typewriter path */}
          <span className="flex-1 min-w-0 font-mono text-2xs text-text-secondary truncate">
            {displayPath}
            <span className="inline-block w-0.5 h-3 bg-accent/70 ml-0.5 animate-pulse align-middle" />
          </span>

          {/* File counter */}
          {totalFilesCreated > 0 && (
            <span className="flex items-center gap-1 text-2xs text-text-muted shrink-0 tabular-nums">
              <Zap className="w-2.5 h-2.5 text-accent/60" />
              {totalFilesCreated} file{totalFilesCreated !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Component ────────────────────────────────────────────────

interface ExecutionTimelineProps {
  logs: JobLog[]
  status: JobStatus
}

export function ExecutionTimeline({ logs, status }: ExecutionTimelineProps) {
  const phases = useMemo(() => {
    if (logs.length === 0) return buildDemoPhases()
    return groupLogsIntoPhases(logs, status)
  }, [logs, status])

  return (
    <div className="flex flex-col">
      {/* Live activity bar — shown during active file writes */}
      <LiveActivityBar logs={logs} status={status} />

      {/* Phase list */}
      <div className="px-3 py-2 space-y-0.5">
        <AnimatePresence initial={false}>
          {phases.map((phase, i) => (
            <motion.div
              key={phase.step}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <TimelinePhase
                phase={phase}
                isLast={i === phases.length - 1}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
