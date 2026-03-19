import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FilePlus, FileEdit, Trash2, Terminal, ChevronRight,
  AlertCircle, CheckCircle2, Wrench, ChevronDown, Code2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JobLog } from '@/types'

// ─── Event config ─────────────────────────────────────────────

const EVENT_CONFIG = {
  create: {
    icon: FilePlus,
    color: 'text-success',
    pathColor: 'text-success',
    bg: 'hover:bg-success/[0.04]',
    flashBg: 'bg-success/[0.08]',
  },
  update: {
    icon: FileEdit,
    color: 'text-info',
    pathColor: 'text-info',
    bg: 'hover:bg-info/[0.04]',
    flashBg: 'bg-info/[0.06]',
  },
  delete: {
    icon: Trash2,
    color: 'text-error',
    pathColor: 'text-error',
    bg: 'hover:bg-error/[0.04]',
    flashBg: '',
  },
  run: {
    icon: Terminal,
    color: 'text-warning',
    pathColor: 'text-warning',
    bg: 'hover:bg-warning/[0.04]',
    flashBg: '',
  },
  log: {
    icon: ChevronRight,
    color: 'text-text-muted',
    pathColor: 'text-text-muted',
    bg: 'hover:bg-white/[0.02]',
    flashBg: '',
  },
  error: {
    icon: AlertCircle,
    color: 'text-error',
    pathColor: 'text-error',
    bg: 'bg-error/[0.04] hover:bg-error/[0.07]',
    flashBg: '',
  },
  success: {
    icon: CheckCircle2,
    color: 'text-success',
    pathColor: 'text-success',
    bg: 'hover:bg-success/[0.04]',
    flashBg: '',
  },
} as const

// ─── Code snippet (first N lines) ────────────────────────────

function CodeSnippet({ code }: { code: string }) {
  const lines = code.split('\n').slice(0, 5)
  return (
    <div className="mt-1 rounded bg-black/30 border border-white/[0.06] overflow-hidden">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-white/[0.04]">
        <Code2 className="w-2.5 h-2.5 text-text-muted/50" />
        <span className="text-2xs text-text-muted/50 font-mono">preview</span>
      </div>
      <pre className="px-2 py-1.5 text-2xs font-mono text-text-muted/70 overflow-x-auto leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-text-muted/30 select-none w-4 text-right shrink-0">{i + 1}</span>
            <span>{line || ' '}</span>
          </div>
        ))}
        {code.split('\n').length > 5 && (
          <div className="text-text-muted/30 mt-0.5">  ···</div>
        )}
      </pre>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────

interface TimelineEventProps {
  log: JobLog
  isNew?: boolean
  isRepair?: boolean
}

export function TimelineEvent({ log, isNew = false, isRepair = false }: TimelineEventProps) {
  const config = EVENT_CONFIG[log.type] ?? EVENT_CONFIG.log
  const Icon = isRepair ? Wrench : config.icon
  const [showCode, setShowCode] = useState(false)

  // File-centric events: show path prominently
  const isFileCentric = (log.type === 'create' || log.type === 'update' || log.type === 'delete') && log.filePath
  const isCreate = log.type === 'create'
  const hasCode = !!log.code

  return (
    <motion.div
      initial={isNew
        ? isCreate
          ? { opacity: 0, x: -8, backgroundColor: 'rgba(34,197,94,0.12)' }
          : { opacity: 0, x: -6 }
        : false
      }
      animate={isNew && isCreate
        ? { opacity: 1, x: 0, backgroundColor: 'rgba(34,197,94,0)' }
        : { opacity: 1, x: 0 }
      }
      transition={isNew && isCreate
        ? { duration: 0.35, ease: 'easeOut', backgroundColor: { duration: 0.8, delay: 0.1 } }
        : { duration: 0.18, ease: 'easeOut' }
      }
      className={cn(
        'flex flex-col py-0.5 px-2 rounded-md group transition-colors',
        isRepair ? 'hover:bg-warning/[0.06]' : config.bg
      )}
    >
      <div className="flex items-start gap-2">
        {/* Icon */}
        <span className={cn(
          'shrink-0 mt-0.5 w-3 h-3',
          isRepair ? 'text-warning' : config.color
        )}>
          <Icon className="w-3 h-3" />
        </span>

        {/* Content */}
        <span className="flex-1 min-w-0 font-mono text-2xs leading-relaxed">
          {isFileCentric ? (
            <span className={cn('break-all', config.pathColor)}>
              {log.filePath}
              {/* Explicit bytes / KB size display — required by Gap 1 file visibility */}
              {typeof log.bytes === 'number' && log.bytes > 0 && (
                <span className="text-text-muted/60 ml-1.5 tabular-nums">
                  {log.bytes < 1024
                    ? `${log.bytes} B`
                    : `${(log.bytes / 1024).toFixed(1)} KB`}
                </span>
              )}
              {log.message && log.message !== log.filePath && (
                <span className="text-text-muted ml-1.5">{log.message}</span>
              )}
            </span>
          ) : log.type === 'run' ? (
            <span className="text-warning break-all">{log.message}</span>
          ) : log.type === 'error' ? (
            <span className="text-error break-all">{log.message}</span>
          ) : log.type === 'success' ? (
            <span className="text-success break-all">{log.message}</span>
          ) : (
            <span className="text-text-muted break-all">{log.message}</span>
          )}
        </span>

        {/* Code toggle button */}
        {hasCode && (
          <button
            onClick={() => setShowCode(v => !v)}
            className="shrink-0 flex items-center gap-0.5 text-2xs text-text-muted/50 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
            title={showCode ? 'Hide code' : 'Show code'}
          >
            <Code2 className="w-2.5 h-2.5" />
            <ChevronDown className={cn('w-2.5 h-2.5 transition-transform', showCode && 'rotate-180')} />
          </button>
        )}

        {/* Timestamp on hover */}
        <span className="text-2xs text-text-muted shrink-0 opacity-0 group-hover:opacity-60 transition-opacity tabular-nums">
          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Code snippet */}
      <AnimatePresence>
        {showCode && hasCode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pl-5"
          >
            <CodeSnippet code={log.code!} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
