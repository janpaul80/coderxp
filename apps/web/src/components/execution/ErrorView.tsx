import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, MessageSquare, Terminal, Loader2, Zap } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/Button'
import { getSocket } from '@/lib/socket'
import { cn } from '@/lib/utils'

export function ErrorView() {
  const activeJob = useAppStore((s) => s.activeJob)
  const rightPanelError = useAppStore((s) => s.rightPanel.error)
  const resetToIdle = useAppStore((s) => s.resetToIdle)
  const appMode = useAppStore((s) => s.appMode)
  const terminalLogs = useAppStore((s) => s.terminalLogs)

  const [repairing, setRepairing] = useState(false)
  const isRepairing = appMode === 'repair'
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLogs.length])

  const errorMessage =
    rightPanelError?.message ?? activeJob?.error ?? 'An unexpected error occurred during the build.'

  const handleRetry = () => {
    const planId = activeJob?.planId
    const projectId = activeJob?.projectId
    if (!planId || !projectId) return
    if (!getSocket().connected) return
    getSocket().emit('plan:approve', { planId, projectId })
  }

  const handleAutoRepair = () => {
    if (activeJob?.id) {
      setRepairing(true)
      getSocket().emit('job:repair', { jobId: activeJob.id })
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* ── Error status bar ─────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRepairing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-3.5 h-3.5 text-amber-400" />
              </motion.div>
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            )}
            <p className="text-xs font-medium text-white/70">
              {isRepairing ? 'Auto-repairing...' : errorMessage}
            </p>
          </div>

          {/* Action buttons — compact, in the header */}
          {!isRepairing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAutoRepair}
                disabled={!activeJob?.id || repairing}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium bg-accent/10 border border-accent/20 text-accent hover:bg-accent/15 transition-all disabled:opacity-30"
              >
                <Zap className="w-3 h-3" />
                Auto-Fix
              </button>
              <button
                onClick={handleRetry}
                disabled={!activeJob?.planId}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all disabled:opacity-30"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
              <button
                onClick={resetToIdle}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
              >
                <MessageSquare className="w-3 h-3" />
                Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Terminal output showing what went wrong ───────────────── */}
      <div className="flex-1 min-h-0 flex flex-col bg-[#0A0A0C]">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.02] shrink-0 border-b border-white/[0.04]">
          <Terminal className="w-3 h-3 text-red-400/70" />
          <span className="text-2xs font-semibold text-white/50">
            {isRepairing ? 'Repair Output' : 'Build Output'}
          </span>
          <span className="text-2xs text-white/20 font-mono tabular-nums">
            {terminalLogs.length} lines
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5 font-mono text-2xs leading-[1.65]">
          {terminalLogs.length === 0 ? (
            <div className="flex items-center gap-2 text-white/15 py-6 justify-center">
              No build output captured.
            </div>
          ) : (
            terminalLogs.map((entry) => (
              <div key={entry.id} className="flex gap-0 whitespace-pre-wrap break-all group">
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
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  )
}
