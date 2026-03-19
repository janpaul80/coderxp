import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Clock, FileCode2, HardDrive, Layers, CheckCircle2 } from 'lucide-react'
import type { BuildSummary as BuildSummaryType } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Stat pill ────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="text-white/30">{icon}</div>
      <div>
        <p className="text-[10px] text-white/25 uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-xs font-medium text-white/70">{value}</p>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────

interface BuildSummaryProps {
  summary: BuildSummaryType
  /** Start expanded (default: true — collapses after 8s) */
  defaultExpanded?: boolean
}

export function BuildSummary({ summary, defaultExpanded = true }: BuildSummaryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border border-emerald-500/15 rounded-xl bg-emerald-500/[0.04] overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium text-white/80">Build complete</span>
          {!expanded && (
            <span className="text-xs text-white/30 ml-1">
              · {summary.fileCount} files · {formatDuration(summary.durationMs)}
            </span>
          )}
        </div>
        <div className="text-white/25">
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />
          }
        </div>
      </button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <StatPill
                  icon={<FileCode2 className="w-3.5 h-3.5" />}
                  label="Files"
                  value={summary.fileCount > 0 ? `${summary.fileCount} files` : '—'}
                />
                <StatPill
                  icon={<HardDrive className="w-3.5 h-3.5" />}
                  label="Size"
                  value={formatBytes(summary.totalBytes)}
                />
                <StatPill
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Duration"
                  value={formatDuration(summary.durationMs)}
                />
                <StatPill
                  icon={<Layers className="w-3.5 h-3.5" />}
                  label="Stack"
                  value={summary.techStack.length > 0 ? summary.techStack.slice(0, 2).join(', ') : '—'}
                />
              </div>

              {/* Key files */}
              {summary.keyFiles.length > 0 && (
                <div>
                  <p className="text-[10px] text-white/25 uppercase tracking-wider mb-1.5">Key files</p>
                  <div className="space-y-1">
                    {summary.keyFiles.slice(0, 5).map((f, i) => (
                      <p key={i} className="text-[11px] text-white/40 font-mono truncate">{f}</p>
                    ))}
                    {summary.keyFiles.length > 5 && (
                      <p className="text-[11px] text-white/20">+{summary.keyFiles.length - 5} more</p>
                    )}
                  </div>
                </div>
              )}

              {/* Built at */}
              <p className="text-[10px] text-white/20">
                Built {new Date(summary.builtAt).toLocaleTimeString()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
