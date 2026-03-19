import React, { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Hammer } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { ExecutionTimeline } from './ExecutionTimeline'
import type { JobStatus } from '@/types'

// ─── Progress bar ─────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-0.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full"
        style={{ boxShadow: '0 0 8px rgba(124,106,247,0.6)' }}
      />
    </div>
  )
}

// ─── Status label map ─────────────────────────────────────────

const statusLabels: Partial<Record<JobStatus, string>> = {
  queued: 'Queued',
  initializing: 'Initializing project...',
  installing: 'Installing dependencies...',
  generating_frontend: 'Generating frontend...',
  generating_backend: 'Generating backend...',
  wiring_auth: 'Wiring authentication...',
  wiring_integrations: 'Wiring integrations...',
  running: 'Starting application...',
  testing: 'Running tests...',
  repairing: 'Repairing issues...',
  complete: 'Build complete!',
  failed: 'Build failed',
}

// ─── Building view ────────────────────────────────────────────

export function BuildingView() {
  const buildProgress = useAppStore((s) => s.rightPanel.buildProgress)
  const appMode = useAppStore((s) => s.appMode)

  const timelineEndRef = useRef<HTMLDivElement>(null)

  const logs = buildProgress?.recentLogs ?? []
  const progress = buildProgress?.progress ?? 0
  const currentStep = buildProgress?.currentStep ?? 'Preparing...'
  const status = buildProgress?.status ?? 'initializing'
  const isRepairing = appMode === 'repair'

  // Auto-scroll to bottom as new phases/events arrive
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] bg-base-elevated/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              {isRepairing ? (
                <div className="w-7 h-7 rounded-lg bg-warning/15 border border-warning/25 flex items-center justify-center">
                  <Hammer className="w-3.5 h-3.5 text-warning" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-text-primary">
                {isRepairing ? 'Auto-Repair' : 'Building'}
              </p>
              <p className="text-2xs text-text-muted">
                {statusLabels[status] ?? currentStep}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-accent font-semibold tabular-nums">
            {progress}%
          </span>
        </div>

        {/* Progress bar */}
        <ProgressBar progress={progress} />
      </div>

      {/* ── Execution timeline ───────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin bg-base">
        <ExecutionTimeline logs={logs} status={status} />
        <div ref={timelineEndRef} />
      </div>

      {/* ── Footer: current step ─────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-t border-white/[0.06] bg-base-elevated/30">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="w-3 h-3 text-accent" />
          </motion.div>
          <p className="text-xs text-text-secondary truncate">{currentStep}</p>
        </div>
      </div>
    </div>
  )
}
