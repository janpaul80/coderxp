/**
 * ErrorAnalysisCard — S9 AI-Native Debugger
 *
 * Renders a structured error analysis card in the chat when a build fails.
 * Shows: root cause, error type badge, affected files, proposed fix, confidence,
 * and an "Auto-repairing…" status indicator when autoRepairTriggered is true.
 */

import React from 'react'
import type { ErrorAnalysis, ErrorAnalysisType } from '../../types'

// ─── Error type display config ────────────────────────────────

const ERROR_TYPE_CONFIG: Record<ErrorAnalysisType, { label: string; color: string; icon: string }> = {
  syntax_error:     { label: 'Syntax Error',     color: 'text-red-400 bg-red-400/10 border-red-400/30',     icon: '⚠' },
  import_error:     { label: 'Import Error',      color: 'text-orange-400 bg-orange-400/10 border-orange-400/30', icon: '📦' },
  type_error:       { label: 'Type Error',        color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30', icon: '🔤' },
  runtime_error:    { label: 'Runtime Error',     color: 'text-red-400 bg-red-400/10 border-red-400/30',     icon: '💥' },
  config_error:     { label: 'Config Error',      color: 'text-purple-400 bg-purple-400/10 border-purple-400/30', icon: '⚙' },
  dependency_error: { label: 'Dependency Error',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',  icon: '🔗' },
  build_error:      { label: 'Build Error',       color: 'text-orange-400 bg-orange-400/10 border-orange-400/30', icon: '🔨' },
  unknown:          { label: 'Unknown Error',     color: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/30',  icon: '❓' },
}

// ─── Confidence bar ───────────────────────────────────────────

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color =
    pct >= 75 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-yellow-500' :
    'bg-zinc-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────

interface ErrorAnalysisCardProps {
  errorAnalysis: ErrorAnalysis
  attempt: number
  autoRepairTriggered: boolean
}

// ─── Component ───────────────────────────────────────────────

export function ErrorAnalysisCard({ errorAnalysis, attempt, autoRepairTriggered }: ErrorAnalysisCardProps) {
  const [showRaw, setShowRaw] = React.useState(false)
  const typeConfig = ERROR_TYPE_CONFIG[errorAnalysis.errorType] ?? ERROR_TYPE_CONFIG.unknown

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 overflow-hidden text-sm w-full max-w-2xl">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/60 border-b border-zinc-700/40">
        <span className="text-base">{typeConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-zinc-100">Build Error Detected</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            {attempt > 1 && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-zinc-600 text-zinc-400">
                Attempt {attempt}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-3 space-y-3">

        {/* Root cause */}
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Root Cause</p>
          <p className="text-zinc-200 leading-relaxed">{errorAnalysis.rootCause}</p>
        </div>

        {/* Affected files */}
        {errorAnalysis.affectedFiles.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Affected Files</p>
            <div className="flex flex-wrap gap-1.5">
              {errorAnalysis.affectedFiles.map((f) => (
                <span
                  key={f}
                  className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Proposed fix */}
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Proposed Fix</p>
          <p className="text-zinc-300 leading-relaxed">{errorAnalysis.proposedFix}</p>
        </div>

        {/* Confidence */}
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Analysis Confidence</p>
          <ConfidenceBar confidence={errorAnalysis.confidence} />
        </div>

        {/* Raw error toggle */}
        {errorAnalysis.rawError && (
          <div>
            <button
              onClick={() => setShowRaw(v => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              <span>{showRaw ? '▾' : '▸'}</span>
              {showRaw ? 'Hide' : 'Show'} raw error output
            </button>
            {showRaw && (
              <pre className="mt-2 text-xs font-mono text-zinc-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-zinc-800 max-h-48 overflow-y-auto">
                {errorAnalysis.rawError}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* ── Auto-repair status footer ── */}
      {autoRepairTriggered && (
        <div className="px-4 py-2.5 bg-blue-500/10 border-t border-blue-500/20 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs text-blue-300 font-medium">
            Auto-repairing… applying fix to affected files
          </span>
        </div>
      )}
    </div>
  )
}

export default ErrorAnalysisCard
