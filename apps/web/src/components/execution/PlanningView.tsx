import React from 'react'
import { motion } from 'framer-motion'
import { Terminal, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/appStore'

// ─── Planning View ──────────────────────────────────────────────
// Minimal — just shows the agent is working. No theatrical animations.
// The real action appears as soon as job:created fires and BuildingView takes over.

export function PlanningView() {
  const appMode = useAppStore((s) => s.appMode)
  const terminalLogs = useAppStore((s) => s.terminalLogs)

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Thin status bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="w-3.5 h-3.5 text-accent" />
          </motion.div>
          <p className="text-xs font-medium text-white/70">
            {appMode === 'awaiting_approval'
              ? 'Starting build...'
              : 'Analyzing your request...'}
          </p>
        </div>
      </div>

      {/* Terminal-style area — shows any early logs, otherwise waiting state */}
      <div className="flex-1 min-h-0 flex flex-col bg-[#0A0A0C]">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] shrink-0 border-b border-white/[0.04]">
          <Terminal className="w-3 h-3 text-emerald-400/70" />
          <span className="text-2xs font-semibold text-white/50">Terminal</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 font-mono text-2xs leading-[1.65]">
          {terminalLogs.length === 0 ? (
            <div className="flex items-center gap-2 text-white/15 py-6 justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-white/10 animate-pulse" />
              Agent is preparing...
            </div>
          ) : (
            terminalLogs.map((entry) => (
              <div key={entry.id} className="flex gap-0 whitespace-pre-wrap break-all">
                <span className="shrink-0 select-none w-[4ch] text-right mr-2 text-white/15">
                  {entry.type === 'error' ? 'ERR' :
                   entry.type === 'success' ? ' OK' :
                   entry.type === 'create' ? '  +' :
                   entry.type === 'run' ? '  $' :
                   '  >'}
                </span>
                <span className={
                  entry.type === 'error' ? 'text-red-400' :
                  entry.type === 'success' ? 'text-emerald-400' :
                  entry.type === 'create' ? 'text-sky-300/80' :
                  'text-white/35'
                }>
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
