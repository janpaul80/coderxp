import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, CheckCircle2, Clock, FileCode2 } from 'lucide-react'
import type { BuildSummary as BuildSummaryType } from '@/types'

function formatDuration(ms: number): string {
  if (ms <= 0) return '--'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

interface BuildSummaryProps {
  summary: BuildSummaryType
  defaultExpanded?: boolean
}

export function BuildSummary({ summary, defaultExpanded = true }: BuildSummaryProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border border-emerald-500/10 rounded-xl bg-emerald-500/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium text-white/70">Build complete</span>
          <span className="text-2xs text-white/25">
            {summary.fileCount} files · {formatDuration(summary.durationMs)}
          </span>
        </div>
        <div className="text-white/20">
          {expanded
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
          }
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1">
              <div className="flex items-center gap-4 text-2xs text-white/30">
                <span className="flex items-center gap-1">
                  <FileCode2 className="w-3 h-3" /> {summary.fileCount} files
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatDuration(summary.durationMs)}
                </span>
                {summary.techStack.length > 0 && (
                  <span>{summary.techStack.slice(0, 3).join(', ')}</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
