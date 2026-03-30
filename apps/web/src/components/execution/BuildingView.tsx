import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Code2, Terminal } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { AgentChatInput } from './AgentChatInput'
import type { JobStatus } from '@/types'
import { cn } from '@/lib/utils'

// ─── Streaming code panel (live ghostwriter effect) ──────────

function StreamingCodePanel() {
  const streamingFile = useAppStore((s) => s.streamingFile)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [streamingFile?.content])

  if (!streamingFile) return null

  const lines = streamingFile.content.split('\n')
  const displayLines = lines.length > 30 ? lines.slice(-30) : lines
  const startLineNum = lines.length > 30 ? lines.length - 30 + 1 : 1

  return (
    <motion.div
      key="streaming-code-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col min-h-0 bg-[#0C0C0E]"
      style={{ flex: '1 1 60%' }}
    >
      {/* File path tab */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-white/[0.04] bg-white/[0.015] shrink-0">
        <Code2 className="w-3 h-3 text-accent/50 shrink-0" />
        <span className="font-mono text-2xs text-accent/70 truncate flex-1 min-w-0">
          {streamingFile.path}
        </span>
        <span className="flex items-center gap-1.5 text-2xs text-white/30 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          writing
        </span>
      </div>

      {/* Code content — editor-like feel */}
      <div className="flex-1 min-h-0 overflow-y-auto px-0 py-2">
        <pre className="font-mono text-2xs leading-[1.7] text-white/60 whitespace-pre-wrap break-all">
          {displayLines.map((line, i) => (
            <div key={i} className="flex hover:bg-white/[0.02] transition-colors">
              <span className="text-white/15 select-none w-10 text-right shrink-0 tabular-nums px-2 border-r border-white/[0.04]">
                {startLineNum + i}
              </span>
              <span className="pl-3 flex-1">{line}</span>
            </div>
          ))}
          <div className="flex">
            <span className="w-10 shrink-0 border-r border-white/[0.04]" />
            <span className="pl-3">
              <span className="inline-block w-[6px] h-[13px] bg-accent/80 align-middle animate-pulse" />
            </span>
          </div>
        </pre>
        <div ref={endRef} />
      </div>
    </motion.div>
  )
}

// ─── Live terminal panel (real stdout/stderr feed) ───────────

function TerminalPanel({ flex }: { flex: string }) {
  const terminalLogs = useAppStore((s) => s.terminalLogs)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs.length])

  return (
    <div
      className="flex flex-col min-h-0 bg-[#0A0A0C] border-t border-white/[0.06]"
      style={{ flex }}
    >
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] shrink-0 border-b border-white/[0.04]">
        <Terminal className="w-3 h-3 text-emerald-400/70" />
        <span className="text-2xs font-semibold text-white/50">Terminal</span>
        <span className="text-2xs text-white/20 font-mono tabular-nums ml-auto">
          {terminalLogs.length} lines
        </span>
      </div>

      {/* Log stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 font-mono text-2xs leading-[1.65]">
        {terminalLogs.length === 0 && (
          <div className="flex items-center gap-2 text-white/15 py-6 justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white/10 animate-pulse" />
            Waiting for build output...
          </div>
        )}
        {terminalLogs.map((entry) => (
          <div key={entry.id} className="flex gap-0 whitespace-pre-wrap break-all">
            <span className={cn(
              'shrink-0 select-none w-[4ch] text-right mr-2',
              entry.type === 'error' ? 'text-red-500/60' :
              entry.type === 'success' ? 'text-emerald-500/60' :
              entry.type === 'create' ? 'text-sky-500/60' :
              'text-white/15'
            )}>
              {entry.type === 'error' ? 'ERR' :
               entry.type === 'success' ? ' OK' :
               entry.type === 'create' ? '  +' :
               entry.type === 'run' ? '  $' :
               '  >'}
            </span>
            <span className={cn(
              'flex-1',
              entry.type === 'error' ? 'text-red-400' :
              entry.type === 'success' ? 'text-emerald-400' :
              entry.type === 'create' ? 'text-sky-300/80' :
              entry.type === 'run' ? 'text-white/50' :
              'text-white/35'
            )}>
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ─── Thin progress bar ───────────────────────────────────────

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

// ─── Status label map ────────────────────────────────────────

const statusLabels: Partial<Record<JobStatus, string>> = {
  queued: 'Queued',
  initializing: 'Initializing workspace...',
  installing: 'npm install',
  installing_deps: 'Installing dependencies...',
  generating_frontend: 'Writing frontend code...',
  generating_backend: 'Writing backend code...',
  wiring_auth: 'Wiring authentication...',
  wiring_integrations: 'Wiring integrations...',
  running: 'npm run dev',
  testing: 'Running tests...',
  repairing: 'Auto-fixing errors...',
  starting_preview: 'Starting live preview...',
  complete: 'Build complete',
  failed: 'Build failed',
}

// ─── Building view ───────────────────────────────────────────

export function BuildingView() {
  const buildProgress = useAppStore((s) => s.rightPanel.buildProgress)
  const streamingFile = useAppStore((s) => s.streamingFile)
  const completedFiles = useAppStore((s) => s.completedFiles)

  const progress = buildProgress?.progress ?? 0
  const currentStep = buildProgress?.currentStep ?? 'Preparing...'
  const status = (buildProgress?.status ?? 'initializing') as JobStatus

  // Count files created so far
  const fileCount = completedFiles.length

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* ── Compact status header ────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="w-3.5 h-3.5 text-accent" />
            </motion.div>
            <p className="text-xs font-medium text-white/70">
              {statusLabels[status] ?? currentStep}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {fileCount > 0 && (
              <span className="text-2xs text-white/30 font-mono">
                {fileCount} files
              </span>
            )}
            <span className="text-xs font-mono text-accent/60 tabular-nums">{progress}%</span>
          </div>
        </div>
        <ProgressBar progress={progress} />
      </div>

      {/* ── Main execution area ──────────────────────────────── */}
      {/* When code is streaming: code editor (60%) + terminal (40%) */}
      {/* When idle: terminal takes full space */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {streamingFile ? (
            <React.Fragment key="split">
              <StreamingCodePanel />
              <TerminalPanel flex="0 1 40%" />
            </React.Fragment>
          ) : (
            <TerminalPanel key="full" flex="1 1 100%" />
          )}
        </AnimatePresence>
      </div>

      {/* ── Agent chat input ─────────────────────────────────── */}
      <AgentChatInput />
    </div>
  )
}
