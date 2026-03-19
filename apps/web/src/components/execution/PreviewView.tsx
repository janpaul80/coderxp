import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw, ExternalLink, Monitor, Smartphone, Tablet,
  ArrowLeft, CheckCircle2, Maximize2, AlertTriangle
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/Button'
import { BuildSummary } from '@/components/execution/BuildSummary'
import { cn } from '@/lib/utils'

type ViewportSize = 'desktop' | 'tablet' | 'mobile'

const viewportConfig: Record<ViewportSize, { width: string; icon: React.ReactNode; label: string }> = {
  desktop: { width: '100%', icon: <Monitor className="w-3.5 h-3.5" />, label: 'Desktop' },
  tablet: { width: '768px', icon: <Tablet className="w-3.5 h-3.5" />, label: 'Tablet' },
  mobile: { width: '390px', icon: <Smartphone className="w-3.5 h-3.5" />, label: 'Mobile' },
}

export function PreviewView() {
  const previewUrl = useAppStore((s) => s.rightPanel.previewUrl)
  const activeJob = useAppStore((s) => s.activeJob)
  const buildSummary = useAppStore((s) => s.buildSummary)
  const resetToIdle = useAppStore((s) => s.resetToIdle)

  const [viewport, setViewport] = useState<ViewportSize>('desktop')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  // Auto-collapse build summary after 8s
  const [summaryExpanded, setSummaryExpanded] = useState(true)

  useEffect(() => {
    if (!buildSummary) return
    setSummaryExpanded(true)
    const t = setTimeout(() => setSummaryExpanded(false), 8000)
    return () => clearTimeout(t)
  }, [buildSummary])

  const url = previewUrl ?? 'about:blank'
  const isLive = !!previewUrl
  const previewFailed = activeJob?.previewStatus === 'failed' && !previewUrl
  const previewPort = activeJob?.previewPort

  const handleRefresh = () => {
    setIsRefreshing(true)
    setIframeKey((k) => k + 1)
    setTimeout(() => setIsRefreshing(false), 800)
  }

  const handleOpenExternal = () => {
    if (previewUrl) window.open(previewUrl, '_blank')
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Browser chrome ──────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06] bg-base-elevated/60">
        {/* Back to chat */}
        <Button
          variant="ghost"
          size="xs"
          leftIcon={<ArrowLeft className="w-3 h-3" />}
          onClick={resetToIdle}
          className="shrink-0"
        >
          Back
        </Button>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-base border border-white/[0.06] min-w-0">
          {isLive && (
            <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
          )}
          <span className="text-xs text-text-secondary truncate font-mono">
            {isLive ? url : 'Building preview...'}
          </span>
        </div>

        {/* Viewport toggles */}
        <div className="flex items-center gap-0.5 bg-base border border-white/[0.06] rounded-lg p-0.5">
          {(Object.keys(viewportConfig) as ViewportSize[]).map((v) => (
            <button
              key={v}
              onClick={() => setViewport(v)}
              title={viewportConfig[v].label}
              className={cn(
                'p-1.5 rounded-md transition-all duration-150',
                viewport === v
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
              )}
            >
              {viewportConfig[v].icon}
            </button>
          ))}
        </div>

        {/* Actions */}
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-all"
          title="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
        </button>

        <button
          onClick={handleOpenExternal}
          disabled={!isLive}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-white/[0.05] transition-all disabled:opacity-30"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Build summary (shown briefly after completion) ───── */}
      {buildSummary && (
        <div className="shrink-0 px-3 pt-3">
          <BuildSummary summary={buildSummary} defaultExpanded={summaryExpanded} />
        </div>
      )}

      {/* ── Preview area ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex items-start justify-center bg-base overflow-auto p-4">
        <motion.div
          animate={{ width: viewportConfig[viewport].width }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="h-full rounded-xl overflow-hidden border border-white/[0.08] shadow-card-lg"
          style={{ minWidth: '320px', maxWidth: '100%' }}
        >
          {isLive ? (
            <iframe
              key={iframeKey}
              src={url}
              className="w-full h-full border-0 bg-white"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : previewFailed ? (
            // Preview process failed to start
            <div className="w-full h-full flex flex-col items-center justify-center bg-base-surface px-8">
              <div className="w-16 h-16 rounded-2xl bg-error/10 border border-error/20 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-error" />
              </div>
              <p className="text-sm font-semibold text-text-primary mb-2">
                Preview Failed
              </p>
              <p className="text-xs text-text-secondary text-center max-w-xs mb-4">
                The app was built but the preview server failed to start. Check the build logs for details.
              </p>
              <button
                onClick={resetToIdle}
                className="text-xs text-accent hover:text-accent-light transition-colors"
              >
                Back to Chat
              </button>
            </div>
          ) : (
            // Placeholder when no preview URL yet
            <div className="w-full h-full flex flex-col items-center justify-center bg-base-surface">
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center mb-4"
              >
                <CheckCircle2 className="w-8 h-8 text-success" />
              </motion.div>
              <p className="text-sm font-semibold text-text-primary mb-2">
                Build Complete
              </p>
              <p className="text-xs text-text-secondary text-center max-w-xs">
                Your app has been built successfully. The preview will load momentarily.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Status bar ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-white/[0.04] bg-base-elevated/20">
        <div className="flex items-center gap-2">
          <span className="relative flex">
            <span className={`w-1.5 h-1.5 rounded-full ${previewFailed ? 'bg-error' : 'bg-success'} ${isLive ? 'animate-ping absolute opacity-60' : ''}`} />
            <span className={`w-1.5 h-1.5 rounded-full ${previewFailed ? 'bg-error' : 'bg-success'}`} />
          </span>
          <span className="text-2xs text-text-muted">
            {previewFailed ? 'Preview failed' : isLive ? `Live preview running${previewPort ? ` · :${previewPort}` : ''}` : 'Preparing preview...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xs text-text-muted">
            {viewportConfig[viewport].label}
          </span>
          <button
            className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
            title="Fullscreen"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
