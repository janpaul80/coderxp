import React, { useEffect, useRef } from 'react'
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react'
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

// ─── Component ───────────────────────────────────────────────

export function LiveTerminal({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const terminalLogs = useAppStore((s) => s.terminalLogs)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs.length])

  const visible = expanded ? terminalLogs : terminalLogs.slice(-8)

  return (
    <div className={cn(
      'flex flex-col border-t border-white/[0.06] bg-[#0D0D0F]',
      expanded ? 'flex-1 min-h-0' : 'h-[180px]'
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-3 py-1.5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors shrink-0"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400/70" />
          <span className="text-xs font-semibold text-white/70">Terminal</span>
          <span className="text-2xs text-white/30 font-mono tabular-nums">{terminalLogs.length} lines</span>
        </div>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-white/30" /> : <ChevronUp className="w-3.5 h-3.5 text-white/30" />}
      </button>

      {/* Log output */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 font-mono text-2xs leading-[1.6]">
        {visible.length === 0 && (
          <div className="text-white/20 py-4 text-center">Waiting for build output...</div>
        )}
        {visible.map((entry) => (
          <div key={entry.id} className="flex gap-2 whitespace-pre-wrap break-all">
            <span className="text-white/15 select-none shrink-0 w-[3ch] text-right tabular-nums">
              {linePrefix(entry.type)}
            </span>
            <span className={cn('flex-1', lineColor(entry.type))}>
              {entry.message}
            </span>
            {entry.step && (
              <span className="text-white/10 shrink-0">[{entry.step}]</span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
