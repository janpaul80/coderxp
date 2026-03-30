import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal, ChevronDown, ChevronUp, Clock, ArrowDown } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

// ─── Line color by type ─────────────────────────────────────

function lineColor(type: string): string {
  switch (type) {
    case 'error': return 'text-red-400'
    case 'success': return 'text-emerald-400'
    case 'create': return 'text-sky-400'
    case 'update': return 'text-amber-400'
    case 'run': return 'text-white/60'
    default: return 'text-white/40'
  }
}

function linePrefix(type: string): string {
  switch (type) {
    case 'error': return 'ERR'
    case 'success': return ' OK'
    case 'create': return '  +'
    case 'update': return '  ~'
    case 'run': return '  $'
    default: return '  >'
  }
}

// ─── Phase labels ────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────

export function LiveTerminal({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
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

  const visible = expanded ? terminalLogs : terminalLogs.slice(-8)

  // Track phase changes
  let lastStep: string | undefined

  return (
    <div className={cn(
      'flex flex-col border-t border-white/[0.06] bg-[#0D0D0F]',
      expanded ? 'flex-1 min-h-0' : 'h-[180px]'
    )}>
      {/* Header */}
      <div className="flex items-center shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-between flex-1 px-3 py-1.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400/70" />
            <span className="text-xs font-semibold text-white/70">Terminal</span>
            <span className="text-2xs text-white/30 font-mono tabular-nums">{terminalLogs.length} lines</span>
          </div>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-white/30" /> : <ChevronUp className="w-3.5 h-3.5 text-white/30" />}
        </button>

        <div className="flex items-center gap-1 px-2 shrink-0 bg-white/[0.02]">
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

          {/* Scroll-to-bottom */}
          {!autoScroll && expanded && (
            <button
              onClick={() => {
                setAutoScroll(true)
                endRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs text-accent/60 bg-accent/[0.06] hover:bg-accent/[0.10] transition-colors"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Log output */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-1 font-mono text-2xs leading-[1.6]"
      >
        {visible.length === 0 && (
          <div className="text-white/20 py-4 text-center">Waiting for build output...</div>
        )}
        {visible.map((entry) => {
          const showSeparator = entry.step && entry.step !== lastStep
          if (entry.step) lastStep = entry.step

          return (
            <React.Fragment key={entry.id}>
              {showSeparator && <PhaseSeparator step={entry.step!} />}
              <div className="flex gap-2 whitespace-pre-wrap break-all group">
                {/* Timestamp */}
                {showTimestamps && (
                  <span className="text-white/10 shrink-0 w-[7ch] text-right tabular-nums select-none">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                )}

                <span className="text-white/15 select-none shrink-0 w-[3ch] text-right tabular-nums">
                  {linePrefix(entry.type)}
                </span>
                <span className={cn('flex-1', lineColor(entry.type))}>
                  {entry.message}
                </span>
                {entry.source && (
                  <span className="text-white/[0.06] group-hover:text-white/15 shrink-0 transition-colors text-[10px]">
                    [{entry.source}]
                  </span>
                )}
                {entry.step && !showTimestamps && (
                  <span className="text-white/[0.06] group-hover:text-white/10 shrink-0 transition-colors text-[10px]">
                    [{entry.step}]
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
