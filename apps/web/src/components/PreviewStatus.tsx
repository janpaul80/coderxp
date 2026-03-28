import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, CheckCircle, RefreshCw, ExternalLink, Key, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────────

interface MissingEnv {
  key: string
  purpose: string
  integration: string
  docsUrl?: string
  isRequired: boolean
}

interface PreviewStatusProps {
  previewUrl: string | null
  previewStatus: string
  previewPort: number | null
  previewPid: number | null
  jobId: string
  onRetryPreview: () => void
}

// ─── Component ─────────────────────────────────────────────────

export function PreviewStatus({
  previewUrl,
  previewStatus,
  previewPort,
  previewPid,
  jobId,
  onRetryPreview,
}: PreviewStatusProps) {
  const [missingEnv, setMissingEnv] = useState<MissingEnv[]>([])
  const [envLoading, setEnvLoading] = useState(false)
  const [envExpanded, setEnvExpanded] = useState(true)

  // Fetch missing env vars from server when preview has issues
  useEffect(() => {
    if (!jobId) return
    if (previewStatus !== 'failed' && previewStatus !== 'stopped') return

    setEnvLoading(true)
    api.get(`/api/workspaces/${jobId}/env-check`)
      .then((res: { data: unknown }) => {
        const data = res.data as { missing: MissingEnv[]; total: number; healthy: boolean }
        setMissingEnv(data.missing ?? [])
      })
      .catch(() => {
        setMissingEnv([])
      })
      .finally(() => setEnvLoading(false))
  }, [jobId, previewStatus])

  const isLive = previewStatus === 'ready' && previewUrl
  const isInstalling = previewStatus === 'installing'
  const isStarting = previewStatus === 'starting'
  const isFailed = previewStatus === 'failed'
  const isStopped = previewStatus === 'stopped'

  // Group missing env by integration
  const envByIntegration = missingEnv.reduce<Record<string, MissingEnv[]>>((acc, env) => {
    const group = env.integration || 'generic'
    if (!acc[group]) acc[group] = []
    acc[group].push(env)
    return acc
  }, {})

  const requiredMissing = missingEnv.filter(e => e.isRequired)

  // ── Live ──────────────────────────────────────────────────
  if (isLive) {
    return (
      <div className="rounded-xl border border-success/20 bg-success/[0.06] p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-4 h-4 text-success" />
          <span className="text-sm font-semibold text-success">Preview Ready</span>
        </div>
        <p className="text-xs text-text-secondary mb-1">
          Your app is live at <code className="text-xs font-mono text-accent">{previewUrl}</code>
        </p>
        <p className="text-2xs text-text-muted">
          Port: {previewPort} &middot; PID: {previewPid}
        </p>
      </div>
    )
  }

  // ── Installing / Starting ─────────────────────────────────
  if (isInstalling || isStarting) {
    return (
      <div className="rounded-xl border border-accent/20 bg-accent/[0.06] p-4">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="w-4 h-4 text-accent animate-spin" />
          <span className="text-sm font-semibold text-accent">
            {isInstalling ? 'Installing Dependencies' : 'Starting Preview Server'}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {isInstalling
            ? 'Running npm install... This typically takes 30-90 seconds.'
            : 'Vite dev server is starting up... Almost ready.'}
        </p>
        <div className="mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full bg-accent/40 rounded-full animate-pulse" style={{ width: isInstalling ? '40%' : '70%' }} />
        </div>
      </div>
    )
  }

  // ── Failed / Stopped with env-var intelligence ────────────
  if (isFailed || isStopped) {
    return (
      <div className="rounded-xl border border-warning/20 bg-warning/[0.04] p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning" />
          <span className="text-sm font-semibold text-warning">
            {isFailed ? 'Preview Failed' : 'Preview Stopped'}
          </span>
        </div>

        {/* Missing env vars */}
        {envLoading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            Scanning for missing environment variables...
          </div>
        ) : requiredMissing.length > 0 ? (
          <div className="space-y-2">
            <button
              onClick={() => setEnvExpanded(!envExpanded)}
              className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              <Key className="w-3 h-3" />
              {requiredMissing.length} missing environment variable{requiredMissing.length > 1 ? 's' : ''} detected
              {envExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {envExpanded && (
              <div className="space-y-2">
                {Object.entries(envByIntegration).map(([integration, vars]) => (
                  <div key={integration} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5">
                    <span className="text-2xs font-semibold text-text-secondary uppercase tracking-wider">
                      {integration}
                    </span>
                    <div className="mt-1.5 space-y-1">
                      {vars.map(env => (
                        <div key={env.key} className="flex items-start gap-2">
                          <code className="text-2xs font-mono text-accent bg-accent/[0.08] px-1.5 py-0.5 rounded shrink-0">
                            {env.key}
                          </code>
                          <span className="text-2xs text-text-muted">{env.purpose}</span>
                          {env.docsUrl && (
                            <a
                              href={env.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-2xs text-accent hover:underline shrink-0 flex items-center gap-0.5"
                            >
                              Docs <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <p className="text-2xs text-text-muted">
                  Provide these via Settings &rarr; Credentials, or add a <code className="font-mono">.env</code> file to your workspace.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-text-secondary">
            {isFailed
              ? 'The preview server failed to start. Check the build logs for details.'
              : 'This preview has been stopped.'}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRetryPreview}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              'bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20'
            )}
          >
            <RefreshCw className="w-3 h-3" />
            Retry Preview
          </button>
        </div>
      </div>
    )
  }

  // ── Default: no status ────────────────────────────────────
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-text-muted" />
        <span className="text-sm text-text-muted">Preview status: {previewStatus || 'unknown'}</span>
      </div>
    </div>
  )
}
