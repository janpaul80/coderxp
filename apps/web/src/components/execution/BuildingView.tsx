import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Code2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { AgentStatusPanel } from './AgentStatusPanel'
import { AgentActivityTimeline } from './AgentActivityTimeline'
import { AgentChatInput } from './AgentChatInput'
import type { JobStatus } from '@/types'
import { AGENT_STEP_LABELS, type AgentRole } from '@/types'

// ─── Streaming code panel ─────────────────────────────────────

function StreamingCodePanel() {
  const streamingFile = useAppStore((s) => s.streamingFile)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [streamingFile?.content])

  if (!streamingFile) return null

  const lines = streamingFile.content.split('\n')
  const displayLines = lines.length > 24 ? lines.slice(-24) : lines
  const startLineNum = lines.length > 24 ? lines.length - 24 + 1 : 1

  return (
    <AnimatePresence>
      <motion.div
        key="streaming-code-panel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 min-h-0 flex flex-col bg-[#09090f]"
      >
        {/* File path header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.04] bg-white/[0.02] shrink-0">
          <Code2 className="w-3 h-3 text-accent/50 shrink-0" />
          <span className="font-mono text-2xs text-accent/70 truncate flex-1 min-w-0">
            {streamingFile.path}
          </span>
          <span className="flex items-center gap-1.5 text-2xs text-white/30 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            writing
          </span>
        </div>

        {/* Code content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          <pre className="font-mono text-2xs leading-[1.7] text-white/50 whitespace-pre-wrap break-all">
            {displayLines.map((line, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-white/15 select-none w-6 text-right shrink-0 tabular-nums">
                  {startLineNum + i}
                </span>
                <span>{line}</span>
              </div>
            ))}
            <span className="inline-block w-[5px] h-[11px] bg-accent/70 ml-0.5 align-middle animate-pulse" />
          </pre>
          <div ref={endRef} />
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Progress bar ─────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-[2px] w-full bg-white/[0.04] overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="h-full bg-gradient-to-r from-accent/80 to-accent"
      />
    </div>
  )
}

// ─── Status label map ─────────────────────────────────────────

const statusLabels: Partial<Record<JobStatus, string>> = {
  queued: 'Queued',
  initializing: 'Initializing...',
  installing: 'Installing dependencies...',
  generating_frontend: 'Generating frontend...',
  generating_backend: 'Generating backend...',
  wiring_auth: 'Wiring authentication...',
  wiring_integrations: 'Wiring integrations...',
  running: 'Starting application...',
  testing: 'Running tests...',
  repairing: 'Repairing issues...',
  complete: 'Build complete',
  failed: 'Build failed',
}

// ─── Building view ────────────────────────────────────────────

export function BuildingView() {
  const buildProgress = useAppStore((s) => s.rightPanel.buildProgress)
  const activeAgentRole = useAppStore((s) => s.activeAgentRole)
  const streamingFile = useAppStore((s) => s.streamingFile)

  const progress = buildProgress?.progress ?? 0
  const activeLabel = activeAgentRole ? AGENT_STEP_LABELS[activeAgentRole as AgentRole] : null
  const currentStep = activeLabel ?? buildProgress?.currentStep ?? 'Preparing...'
  const status = buildProgress?.status ?? 'initializing'

  return (
    <div className="flex flex-col h-full bg-[#0a0a14]">
      {/* ── Compact header ─────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="w-4 h-4 text-accent" />
            </motion.div>
            <p className="text-xs font-medium text-white/80">{statusLabels[status] ?? currentStep}</p>
          </div>
          <span className="text-xs font-mono text-accent/70 tabular-nums">{progress}%</span>
        </div>
        <ProgressBar progress={progress} />
      </div>

      {/* ── Agent status (compact) ─────────────────────────── */}
      <div className="shrink-0 px-3 py-2 border-b border-white/[0.04]">
        <AgentStatusPanel />
      </div>

      {/* ── Main content: Code stream or activity log ──────── */}
      {streamingFile ? (
        <StreamingCodePanel />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#09090f]">
          <div className="px-4 py-3">
            <AgentActivityTimeline />
          </div>
        </div>
      )}

      {/* ── Agent chat ─────────────────────────────────────── */}
      <AgentChatInput />
    </div>
  )
}
