import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw, ExternalLink, Monitor, Smartphone, Tablet,
  ArrowLeft, CheckCircle2, AlertTriangle,
  Github, Globe, Rocket
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/Button'
import { BuildSummary } from '@/components/execution/BuildSummary'
import { PublishModal } from '@/components/execution/PublishModal'
import { useChatStore } from '@/store/chatStore'
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
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [publishAction, setPublishAction] = useState<'archive' | 'github' | 'vercel'>('archive')
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
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
  const jobId = activeJob?.id ?? ''

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    setIframeKey((k) => k + 1)
    setTimeout(() => setIsRefreshing(false), 800)
  }, [])

  const handleOpenExternal = () => {
    if (previewUrl) window.open(previewUrl, '_blank')
  }

  const handlePublish = () => {
    setPublishAction('archive')
    setPublishModalOpen(true)
  }

  const handlePushGitHub = () => {
    setPublishAction('github')
    setPublishModalOpen(true)
  }

  const handleDeployVercel = () => {
    setPublishAction('vercel')
    setPublishModalOpen(true)
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a14]">
      {/* ── Browser chrome ──────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
        {/* Back */}
        <button
          onClick={resetToIdle}
          className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>

        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] min-w-0">
          {isLive && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
          <span className="text-2xs text-white/40 truncate font-mono">
            {isLive ? url : 'Building preview...'}
          </span>
        </div>

        {/* Viewport toggles */}
        <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-lg p-0.5">
          {(Object.keys(viewportConfig) as ViewportSize[]).map((v) => (
            <button
              key={v}
              onClick={() => setViewport(v)}
              title={viewportConfig[v].label}
              className={cn(
                'p-1.5 rounded-md transition-all duration-150',
                viewport === v
                  ? 'bg-white/[0.08] text-white/70'
                  : 'text-white/20 hover:text-white/40 hover:bg-white/[0.04]'
              )}
            >
              {viewportConfig[v].icon}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.05] transition-all"
          title="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', isRefreshing && 'animate-spin')} />
        </button>

        {/* External */}
        <button
          onClick={handleOpenExternal}
          disabled={!isLive}
          className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.05] transition-all disabled:opacity-20"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>

        {/* Publish actions */}
        {isLive && (
          <div className="flex items-center gap-1 ml-1 pl-1 border-l border-white/[0.06]">
            <button
              onClick={handlePublish}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium bg-emerald-400/10 border border-emerald-400/15 text-emerald-400 hover:bg-emerald-400/15 transition-all"
              title="Publish"
            >
              <Globe className="w-3 h-3" />
              Publish
            </button>
            <button
              onClick={handlePushGitHub}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
              title="Push to GitHub"
            >
              <Github className="w-3 h-3" />
            </button>
            <button
              onClick={handleDeployVercel}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-2xs font-medium bg-white/[0.04] border border-white/[0.06] text-white/40 hover:text-white/60 hover:bg-white/[0.06] transition-all"
              title="Deploy to Vercel"
            >
              <Rocket className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ── Build summary (collapsible) ─────────────────────── */}
      {buildSummary && (
        <div className="shrink-0 px-3 pt-2">
          <BuildSummary summary={buildSummary} defaultExpanded={summaryExpanded} />
        </div>
      )}

      {/* ── Preview area ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex items-start justify-center overflow-auto p-3">
        <motion.div
          animate={{ width: viewportConfig[viewport].width }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="h-full rounded-xl overflow-hidden border border-white/[0.06]"
          style={{ minWidth: '320px', maxWidth: '100%' }}
        >
          {isLive ? (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={url}
              className="w-full h-full border-0 bg-white"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : previewFailed ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a14] px-8">
              <div className="flex flex-col items-center text-center max-w-xs">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                  <AlertTriangle className="w-5 h-5 text-white/25" />
                </div>
                <p className="text-sm font-medium text-white/50 mb-2">Preview unavailable</p>
                <p className="text-2xs text-white/25 leading-relaxed mb-4">
                  The preview server couldn't start. Try rebuilding or check the build logs.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="xs" onClick={handleRefresh}>
                    Retry
                  </Button>
                  <Button variant="ghost" size="xs" onClick={resetToIdle}>
                    Back to Chat
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a14]">
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img
                  src="/logo-white.png"
                  alt="CoderXP"
                  className="h-8 w-auto mb-4 opacity-30"
                  draggable={false}
                />
              </motion.div>
              <p className="text-xs text-white/25">Loading preview...</p>
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Status bar ───────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="relative flex">
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              previewFailed ? 'bg-red-400' : isLive ? 'bg-emerald-400' : 'bg-white/20'
            )} />
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute opacity-40" />
            )}
          </span>
          <span className="text-2xs text-white/25">
            {previewFailed ? 'Preview failed' : isLive ? `Live${previewPort ? ` · :${previewPort}` : ''}` : 'Preparing...'}
          </span>
        </div>
        <span className="text-2xs text-white/20">{viewportConfig[viewport].label}</span>
      </div>

      {/* ── Publish modal ──────────────────────────────────────── */}
      <PublishModal
        open={publishModalOpen}
        onClose={() => setPublishModalOpen(false)}
        action={publishAction}
        jobId={jobId}
      />
    </div>
  )
}
