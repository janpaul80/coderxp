import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Editor, { useMonaco } from '@monaco-editor/react'
import {
  Loader2, Code2, Terminal,
  ChevronDown, ChevronUp,
  Clock, FileCode2, CheckCircle2,
  ArrowDown,
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { AgentChatInput } from './AgentChatInput'
import type { JobStatus, AgentRole } from '@/types'
import { AGENT_DISPLAY_NAMES } from '@/types'
import { cn } from '@/lib/utils'

// ─── Elapsed timer hook ─────────────────────────────────────

function useElapsedTime(): string {
  const activeJob = useAppStore((s) => s.activeJob)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = activeJob?.startedAt
      ? new Date(activeJob.startedAt).getTime()
      : Date.now()

    setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))

    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)

    return () => clearInterval(interval)
  }, [activeJob?.startedAt])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return mins > 0
    ? `${mins}m ${secs.toString().padStart(2, '0')}s`
    : `${secs}s`
}

// ─── Active agent bar ────────────────────────────────────────

function ActiveAgentBar() {
  const activeAgentRole = useAppStore((s) => s.activeAgentRole)
  const agentStatuses = useAppStore((s) => s.agentStatuses)

  if (!activeAgentRole) return null

  const agentName = AGENT_DISPLAY_NAMES[activeAgentRole as AgentRole] ?? activeAgentRole
  const status = agentStatuses[activeAgentRole] ?? 'running'

  const entries = Object.entries(agentStatuses)
  const completed = entries.filter(([, s]) => s === 'complete').length
  const total = entries.length

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-accent/[0.04] border-b border-accent/[0.08] shrink-0">
      <motion.div
        animate={{ rotate: status === 'running' ? 360 : 0 }}
        transition={{ duration: 2, repeat: status === 'running' ? Infinity : 0, ease: 'linear' }}
      >
        <Loader2 className="w-3 h-3 text-accent/70" />
      </motion.div>
      <span className="text-2xs font-semibold text-accent/90">{agentName}</span>
      <span className="text-2xs text-white/25">is working</span>
      {total > 1 && (
        <span className="text-2xs text-white/20 ml-auto font-mono tabular-nums">
          {completed}/{total} agents done
        </span>
      )}
    </div>
  )
}

// ─── Streaming code panel (live ghostwriter effect) ──────────

function StreamingCodePanel() {
  const streamingFile = useAppStore((s) => s.streamingFile)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    if (editorRef.current && streamingFile?.content) {
      const model = editorRef.current.getModel()
      if (model) {
        editorRef.current.revealLine(model.getLineCount())
      }
    }
  }, [streamingFile?.content])

  if (!streamingFile) return null

  // Determine language based on extension
  const path = streamingFile.path.toLowerCase()
  let language = 'typescript'
  if (path.endsWith('.css')) language = 'css'
  else if (path.endsWith('.html')) language = 'html'
  else if (path.endsWith('.json')) language = 'json'
  else if (path.endsWith('.md')) language = 'markdown'

  return (
    <motion.div
      key="streaming-code-panel"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col min-h-0 bg-[#1e1e1e]"
      style={{ flex: '1 1 60%' }}
    >
      {/* File path tab */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-white/[0.04] bg-[#1e1e1e] shrink-0">
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
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          value={streamingFile.content + '█'}
          onMount={(editor) => {
            editorRef.current = editor
            const model = editor.getModel()
            if (model) {
              editor.revealLine(model.getLineCount())
            }
          }}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Courier New', monospace",
            lineNumbers: 'on',
            folding: false,
            renderLineHighlight: 'none',
            matchBrackets: 'never',
            smoothScrolling: true,
            cursorStyle: 'block', // Ghostwriter vibe
            cursorBlinking: 'smooth',
          }}
        />
      </div>
    </motion.div>
  )
}

// ─── Phase separator in terminal ────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  workspace_prepare: 'WORKSPACE',
  scaffold_generate: 'SCAFFOLDING',
  scaffold_validate: 'VALIDATION',
  files_write: 'CODE GENERATION',
  code_quality: 'QUALITY ANALYSIS',
  install_deps: 'DEPENDENCIES',
  preview_start: 'PREVIEW',
  preview_healthcheck: 'HEALTH CHECK',
}

function PhaseSeparator({ step }: { step: string }) {
  const label = PHASE_LABELS[step] ?? step.toUpperCase().replace(/_/g, ' ')

  return (
    <div className="flex items-center gap-2 py-1 mt-1">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-[9px] font-bold tracking-[0.15em] text-white/20 uppercase shrink-0 px-1">
        {label}
      </span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  )
}

// ─── Enhanced terminal panel ─────────────────────────────────

function TerminalPanel({ flex }: { flex: string }) {
  const terminalLogs = useAppStore((s) => s.terminalLogs)
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setAutoScroll(isNearBottom)
  }, [])

  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [terminalLogs.length, autoScroll])

  // Track phase changes to insert separators
  let lastStep: string | undefined

  return (
    <div
      className="flex flex-col min-h-0 bg-[#0A0A0C] border-t border-white/[0.06]"
      style={{ flex }}
    >
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] shrink-0 border-b border-white/[0.04]">
        <Terminal className="w-3 h-3 text-emerald-400/70" />
        <span className="text-2xs font-semibold text-white/50">Terminal</span>

        <span className="text-2xs text-white/20 font-mono tabular-nums">
          {terminalLogs.length} lines
        </span>

        <div className="flex items-center gap-1 ml-auto">
          {/* Timestamp toggle */}
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={cn(
              'p-1 rounded transition-colors',
              showTimestamps ? 'text-white/40 bg-white/[0.06]' : 'text-white/15 hover:text-white/30'
            )}
            title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
          >
            <Clock className="w-3 h-3" />
          </button>

          {/* Scroll-to-bottom button (shown when user scrolled up) */}
          {!autoScroll && (
            <button
              onClick={() => {
                setAutoScroll(true)
                endRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs text-accent/60 bg-accent/[0.06] hover:bg-accent/[0.10] transition-colors"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-2.5 h-2.5" />
              <span>latest</span>
            </button>
          )}
        </div>
      </div>

      {/* Log stream */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 font-mono text-2xs leading-[1.65]"
      >
        {terminalLogs.length === 0 && (
          <div className="flex items-center gap-2 text-white/15 py-6 justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-white/10 animate-pulse" />
            Waiting for build output...
          </div>
        )}
        {terminalLogs.map((entry) => {
          // Insert phase separator when the build step changes
          const showSeparator = entry.step && entry.step !== lastStep
          if (entry.step) lastStep = entry.step

          return (
            <React.Fragment key={entry.id}>
              {showSeparator && <PhaseSeparator step={entry.step!} />}
              <div className="flex gap-0 whitespace-pre-wrap break-all group">
                {/* Timestamp (toggled) */}
                {showTimestamps && (
                  <span className="text-white/10 shrink-0 w-[7ch] text-right mr-1.5 tabular-nums select-none">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                )}

                {/* Type prefix */}
                <span className={cn(
                  'shrink-0 select-none w-[4ch] text-right mr-2',
                  entry.type === 'error' ? 'text-red-500/60' :
                  entry.type === 'success' ? 'text-emerald-500/60' :
                  entry.type === 'create' ? 'text-sky-500/60' :
                  entry.type === 'run' ? 'text-amber-500/40' :
                  'text-white/15'
                )}>
                  {entry.type === 'error' ? 'ERR' :
                   entry.type === 'success' ? ' OK' :
                   entry.type === 'create' ? '  +' :
                   entry.type === 'run' ? '  $' :
                   '  >'}
                </span>

                {/* Message */}
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

                {/* Source agent tag (visible on hover) */}
                {entry.source && (
                  <span className="text-white/[0.06] group-hover:text-white/15 shrink-0 ml-2 transition-colors text-[10px]">
                    [{entry.source}]
                  </span>
                )}
              </div>
            </React.Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ─── File progress mini-panel ────────────────────────────────

function FileProgressMini() {
  const completedFiles = useAppStore((s) => s.completedFiles)
  const [expanded, setExpanded] = useState(false)

  if (completedFiles.length === 0) return null

  const recent = expanded ? completedFiles : completedFiles.slice(-5)

  return (
    <div className="shrink-0 border-t border-white/[0.04]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-white/[0.02] transition-colors"
      >
        <FileCode2 className="w-3 h-3 text-sky-400/50" />
        <span className="text-2xs font-medium text-white/40">
          {completedFiles.length} files generated
        </span>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-white/15 ml-auto" />
          : <ChevronDown className="w-3 h-3 text-white/15 ml-auto" />
        }
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 max-h-32 overflow-y-auto">
              {recent.map((f, i) => (
                <div key={`${f.path}-${i}`} className="flex items-center gap-2 py-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400/40 shrink-0" />
                  <span className="text-[10px] font-mono text-white/30 truncate flex-1">{f.path}</span>
                  {f.bytes !== undefined && (
                    <span className="text-[10px] font-mono text-white/15 shrink-0 tabular-nums">
                      {f.bytes > 1024 ? `${(f.bytes / 1024).toFixed(1)}k` : `${f.bytes}b`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Thin progress bar ──────────────────────────────────────

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

  const fileCount = completedFiles.length
  const elapsed = useElapsedTime()

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* ── Status header ──────────────────────────────────────── */}
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
            {/* Elapsed time */}
            <span className="flex items-center gap-1 text-2xs text-white/25 font-mono tabular-nums">
              <Clock className="w-3 h-3 text-white/15" />
              {elapsed}
            </span>

            {/* File count */}
            {fileCount > 0 && (
              <span className="flex items-center gap-1 text-2xs text-white/25 font-mono tabular-nums">
                <FileCode2 className="w-3 h-3 text-white/15" />
                {fileCount}
              </span>
            )}

            {/* Progress */}
            <span className="text-xs font-mono text-accent/60 tabular-nums">{progress}%</span>
          </div>
        </div>
        <ProgressBar progress={progress} />
      </div>

      {/* ── Active agent indicator ─────────────────────────────── */}
      <ActiveAgentBar />

      {/* ── Main execution area ────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {streamingFile ? (
            <motion.div
              key="split"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-h-0 flex flex-col"
            >
              <StreamingCodePanel />
              <TerminalPanel flex="0 1 40%" />
            </motion.div>
          ) : (
            <TerminalPanel key="full" flex="1 1 100%" />
          )}
        </AnimatePresence>
      </div>

      {/* ── File progress tracker ──────────────────────────────── */}
      <FileProgressMini />

      {/* ── Agent chat input ───────────────────────────────────── */}
      <AgentChatInput />
    </div>
  )
}
