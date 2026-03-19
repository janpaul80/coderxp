import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, MessageSquare, ChevronDown, ChevronUp, Wrench } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/Button'
import { getSocket } from '@/lib/socket'

// ─── Failure category display map ────────────────────────────

const categoryLabels: Record<string, { label: string; color: string }> = {
  scaffold_failure:        { label: 'Scaffold Error',       color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  install_failure:         { label: 'Install Failed',       color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  llm_failure:             { label: 'AI Generation Error',  color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  preview_start_failure:   { label: 'Preview Start Failed', color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  preview_health_failure:  { label: 'Preview Unhealthy',    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  workspace_failure:       { label: 'Workspace Error',      color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  unknown:                 { label: 'Unknown Error',        color: 'text-text-muted bg-white/[0.04] border-white/[0.08]' },
}

export function ErrorView() {
  const activeJob = useAppStore((s) => s.activeJob)
  const rightPanelError = useAppStore((s) => s.rightPanel.error)
  const resetToIdle = useAppStore((s) => s.resetToIdle)
  const appMode = useAppStore((s) => s.appMode)

  const [showDetails, setShowDetails] = useState(false)

  const isRepairing = appMode === 'repair'

  const errorMessage =
    rightPanelError?.message ?? activeJob?.error ?? 'An unexpected error occurred during the build process.'

  // Prefer server's detailed errorDetails, fall back to stack, then message
  const errorDetailText =
    rightPanelError?.errorDetails ??
    activeJob?.errorDetails ??
    rightPanelError?.stack ??
    'No additional details available.'

  const failureCategory =
    rightPanelError?.failureCategory ??
    activeJob?.failureCategory

  const categoryInfo = failureCategory
    ? (categoryLabels[failureCategory] ?? { label: failureCategory, color: 'text-text-muted bg-white/[0.04] border-white/[0.08]' })
    : null

  const handleRetry = () => {
    const planId = activeJob?.planId
    const projectId = activeJob?.projectId
    if (planId && projectId) {
      getSocket().emit('plan:approve', { planId, projectId })
    }
  }

  const handleBackToChat = () => {
    resetToIdle()
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-error/[0.04] blur-3xl" />
      </div>
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {isRepairing ? (
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
              className="w-16 h-16 rounded-2xl bg-warning/10 border border-warning/20 flex items-center justify-center"
            >
              <Wrench className="w-8 h-8 text-warning" />
            </motion.div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-error" />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="text-center mb-4">
          <h2 className="text-base font-semibold text-text-primary mb-2">
            {isRepairing ? 'Attempting Auto-Repair' : 'Build Failed'}
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            {isRepairing
              ? 'CodedXP detected an issue and is attempting to fix it automatically...'
              : errorMessage}
          </p>
        </div>

        {/* Failure category badge */}
        {!isRepairing && categoryInfo && (
          <div className="flex justify-center mb-4">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-2xs font-semibold border ${categoryInfo.color}`}>
              {categoryInfo.label}
            </span>
          </div>
        )}

        {/* Repair progress */}
        {isRepairing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-6 p-4 rounded-xl bg-warning/[0.06] border border-warning/15"
          >
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <RefreshCw className="w-3.5 h-3.5 text-warning" />
              </motion.div>
              <span className="text-xs font-medium text-warning">Repair in progress</span>
            </div>
            <div className="space-y-1.5">
              {['Inspecting error output', 'Identifying root cause', 'Applying patch'].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.5 }}
                    className="w-1.5 h-1.5 rounded-full bg-warning"
                  />
                  <span className="text-2xs text-text-secondary">{step}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Error details (collapsible) */}
        {!isRepairing && (
          <div className="mb-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-base-elevated border border-white/[0.06] hover:border-white/[0.10] transition-all"
            >
              <span className="text-xs text-text-secondary">Error details</span>
              {showDetails ? (
                <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
              )}
            </button>

            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-2 p-3 rounded-lg bg-error/[0.05] border border-error/10 overflow-hidden"
              >
                <pre className="text-2xs font-mono text-error/80 whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto scrollbar-thin">
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
              onClick={handleBackToChat}
            >
              Back to Chat
            </Button>
          </div>
        )}

        {/* Info */}
        <p className="text-2xs text-text-muted text-center mt-4">
          {isRepairing
            ? 'CodedXP will notify you when the repair is complete'
            : 'You can describe the issue in chat and CodedXP will attempt a fix'}
        </p>
      </motion.div>
    </div>
  )
}
