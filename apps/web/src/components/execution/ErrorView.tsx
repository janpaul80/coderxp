import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, MessageSquare, ChevronDown, ChevronUp, Wrench, Zap } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/Button'
import { getSocket } from '@/lib/socket'

const categoryLabels: Record<string, { label: string; color: string }> = {
  scaffold_failure:        { label: 'Scaffold Error',       color: 'text-orange-400 bg-orange-400/10 border-orange-400/15' },
  install_failure:         { label: 'Install Failed',       color: 'text-amber-400 bg-amber-400/10 border-amber-400/15' },
  llm_failure:             { label: 'AI Error',             color: 'text-purple-400 bg-purple-400/10 border-purple-400/15' },
  preview_start_failure:   { label: 'Preview Failed',       color: 'text-blue-400 bg-blue-400/10 border-blue-400/15' },
  preview_health_failure:  { label: 'Preview Unhealthy',    color: 'text-blue-400 bg-blue-400/10 border-blue-400/15' },
  workspace_failure:       { label: 'Workspace Error',      color: 'text-red-400 bg-red-400/10 border-red-400/15' },
  unknown:                 { label: 'Unknown Error',        color: 'text-white/40 bg-white/[0.04] border-white/[0.08]' },
}

export function ErrorView() {
  const activeJob = useAppStore((s) => s.activeJob)
  const rightPanelError = useAppStore((s) => s.rightPanel.error)
  const resetToIdle = useAppStore((s) => s.resetToIdle)
  const appMode = useAppStore((s) => s.appMode)

  const [showDetails, setShowDetails] = useState(false)
  const [repairing, setRepairing] = useState(false)

  const isRepairing = appMode === 'repair'

  const errorMessage =
    rightPanelError?.message ?? activeJob?.error ?? 'An unexpected error occurred during the build.'

  const errorDetailText =
    rightPanelError?.errorDetails ??
    activeJob?.errorDetails ??
    rightPanelError?.stack ??
    'No additional details available.'

  const failureCategory =
    rightPanelError?.failureCategory ??
    activeJob?.failureCategory

  const categoryInfo = failureCategory
    ? (categoryLabels[failureCategory] ?? { label: failureCategory, color: 'text-white/40 bg-white/[0.04] border-white/[0.08]' })
    : null

  const handleRetry = () => {
    const planId = activeJob?.planId
    const projectId = activeJob?.projectId
    if (!planId || !projectId) return
    if (!getSocket().connected) {
      console.error('[ErrorView] Cannot retry: not connected to backend')
      return
    }
    getSocket().emit('plan:approve', { planId, projectId })
  }

  const handleAutoRepair = () => {
    if (activeJob?.id) {
      setRepairing(true)
      getSocket().emit('job:repair', { jobId: activeJob.id })
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 relative overflow-hidden bg-[#0a0a14]">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-red-500/[0.02] blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {isRepairing ? (
            <motion.div
              animate={{ rotate: [0, -8, 8, -8, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
              className="w-14 h-14 rounded-2xl bg-amber-400/[0.06] border border-amber-400/15 flex items-center justify-center"
            >
              <Wrench className="w-7 h-7 text-amber-400/70" />
            </motion.div>
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-white/25" />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-center mb-4">
          <h2 className="text-sm font-semibold text-white/80 mb-2">
            {isRepairing ? 'Auto-repairing...' : 'Build failed'}
          </h2>
          <p className="text-xs text-white/40 leading-relaxed">
            {isRepairing
              ? 'CoderXP is analyzing and fixing the issue automatically.'
              : errorMessage}
          </p>
        </div>

        {/* Category badge */}
        {!isRepairing && categoryInfo && (
          <div className="flex justify-center mb-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-medium border ${categoryInfo.color}`}>
              {categoryInfo.label}
            </span>
          </div>
        )}

        {/* Repair progress */}
        {isRepairing && (
          <div className="mb-6 p-4 rounded-xl bg-amber-400/[0.04] border border-amber-400/10">
            <div className="flex items-center gap-2 mb-3">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400/70" />
              </motion.div>
              <span className="text-xs font-medium text-amber-400/80">Repair in progress</span>
            </div>
            <div className="space-y-1.5">
              {['Analyzing error output', 'Identifying root cause', 'Applying fix'].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
                    className="w-1 h-1 rounded-full bg-amber-400"
                  />
                  <span className="text-2xs text-white/35">{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error details */}
        {!isRepairing && (
          <div className="mb-5">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.10] transition-all"
            >
              <span className="text-2xs text-white/35">Details</span>
              {showDetails
                ? <ChevronUp className="w-3 h-3 text-white/20" />
                : <ChevronDown className="w-3 h-3 text-white/20" />
              }
            </button>

            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden"
              >
                <pre className="text-2xs font-mono text-white/30 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto scrollbar-thin">
                  {errorDetailText}
                </pre>
              </motion.div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isRepairing && (
          <div className="flex flex-col gap-2">
            <Button
              variant="accent"
              size="sm"
              fullWidth
              leftIcon={<Zap className="w-3.5 h-3.5" />}
              onClick={handleAutoRepair}
              disabled={!activeJob?.id || repairing}
            >
              {repairing ? 'Repairing...' : 'Auto-Fix'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              fullWidth
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={handleRetry}
              disabled={!activeJob?.planId}
            >
              Retry Build
            </Button>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              leftIcon={<MessageSquare className="w-3.5 h-3.5" />}
              onClick={resetToIdle}
            >
              Back to Chat
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
