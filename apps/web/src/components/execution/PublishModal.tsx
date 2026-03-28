/**
 * PublishModal — Real backend-connected Publish / GitHub / Vercel actions
 *
 * Modes:
 *  - archive: Creates a downloadable .tar.gz of the workspace
 *  - github:  Pushes workspace to a GitHub repository (requires PAT)
 *  - vercel:  Deploys workspace to Vercel (requires Vercel token)
 */

import React, { useState, useEffect } from 'react'
import {
  X, Download, Github, Rocket, Loader2, CheckCircle,
  AlertCircle, ExternalLink, Eye, EyeOff, Copy
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { getSavedGithubToken, getSavedVercelToken } from '@/components/settings/IntegrationsPanel'

interface PublishModalProps {
  open: boolean
  onClose: () => void
  action: 'archive' | 'github' | 'vercel'
  jobId: string
}

type Status = 'idle' | 'loading' | 'success' | 'error'

const ACTION_CONFIG = {
  archive: { title: 'Publish — Download Archive', icon: Download, accent: 'success' },
  github:  { title: 'Push to GitHub', icon: Github, accent: 'accent' },
  vercel:  { title: 'Deploy to Vercel', icon: Rocket, accent: 'accent' },
}

export function PublishModal({ open, onClose, action, jobId }: PublishModalProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<Record<string, string | number | boolean> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // GitHub fields
  const [githubToken, setGithubToken] = useState('')
  const [repoName, setRepoName] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [showToken, setShowToken] = useState(false)

  // Vercel fields
  const [vercelToken, setVercelToken] = useState('')
  const [vercelProject, setVercelProject] = useState('')

  // Auto-fill tokens from saved settings when modal opens
  useEffect(() => {
    if (open) {
      if (action === 'github' && !githubToken) {
        const saved = getSavedGithubToken()
        if (saved) setGithubToken(saved)
      }
      if (action === 'vercel' && !vercelToken) {
        const saved = getSavedVercelToken()
        if (saved) setVercelToken(saved)
      }
    }
  }, [open, action])

  if (!open) return null

  const config = ACTION_CONFIG[action]
  const Icon = config.icon

  const handleSubmit = async () => {
    setStatus('loading')
    setError(null)
    setResult(null)

    try {
      let res: { data: unknown }

      if (action === 'archive') {
        res = await api.post(`/api/publish/${jobId}/archive`)
      } else if (action === 'github') {
        if (!githubToken || !repoName) {
          setError('GitHub token and repository name are required')
          setStatus('error')
          return
        }
        res = await api.post(`/api/publish/${jobId}/github`, {
          githubToken, repoName, isPrivate,
        })
      } else {
        if (!vercelToken) {
          setError('Vercel token is required')
          setStatus('error')
          return
        }
        res = await api.post(`/api/publish/${jobId}/vercel`, {
          vercelToken,
          projectName: vercelProject || undefined,
        })
      }

      const data = res.data as Record<string, string | number | boolean>
      if (data.success) {
        setResult(data)
        setStatus('success')
      } else {
        setError(String(data.error ?? 'Unknown error'))
        setStatus('error')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Request failed'
      setError(msg)
      setStatus('error')
    }
  }

  const handleClose = () => {
    setStatus('idle')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className={cn(
          'pointer-events-auto w-full max-w-md',
          'bg-base-card border border-white/[0.08] rounded-2xl shadow-card-lg',
          'flex flex-col max-h-[80vh]'
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-accent" />
              </div>
              <h2 className="text-sm font-semibold text-text-primary">{config.title}</h2>
            </div>
            <button onClick={handleClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 space-y-4">

            {/* ── Archive mode ──────────────────────────── */}
            {action === 'archive' && status === 'idle' && (
              <p className="text-xs text-text-secondary">
                Download your generated app as a .tar.gz archive. Includes all source files — no node_modules.
              </p>
            )}

            {/* ── GitHub mode ──────────────────────────── */}
            {action === 'github' && status === 'idle' && (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary">
                  Push your app to a GitHub repository. Creates the repo if it doesn't exist.
                </p>
                <div>
                  <label className="text-2xs font-medium text-text-secondary mb-1 block">GitHub Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-2 pr-8 rounded-lg bg-base border border-white/[0.08] text-xs text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-2xs text-text-muted mt-1">
                    Needs "repo" scope. <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Create token</a>
                  </p>
                </div>
                <div>
                  <label className="text-2xs font-medium text-text-secondary mb-1 block">Repository Name</label>
                  <input
                    type="text"
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="my-coderxp-app"
                    className="w-full px-3 py-2 rounded-lg bg-base border border-white/[0.08] text-xs text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-base"
                  />
                  <span className="text-xs text-text-secondary">Private repository</span>
                </label>
              </div>
            )}

            {/* ── Vercel mode ─────────────────────────── */}
            {action === 'vercel' && status === 'idle' && (
              <div className="space-y-3">
                <p className="text-xs text-text-secondary">
                  Deploy your app to Vercel. Your app will be live in minutes.
                </p>
                <div>
                  <label className="text-2xs font-medium text-text-secondary mb-1 block">Vercel Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={vercelToken}
                      onChange={(e) => setVercelToken(e.target.value)}
                      placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-3 py-2 pr-8 rounded-lg bg-base border border-white/[0.08] text-xs text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    >
                      {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-2xs text-text-muted mt-1">
                    <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Create token</a>
                  </p>
                </div>
                <div>
                  <label className="text-2xs font-medium text-text-secondary mb-1 block">Project Name (optional)</label>
                  <input
                    type="text"
                    value={vercelProject}
                    onChange={(e) => setVercelProject(e.target.value)}
                    placeholder="my-app (auto-generated if empty)"
                    className="w-full px-3 py-2 rounded-lg bg-base border border-white/[0.08] text-xs text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* ── Loading ─────────────────────────────── */}
            {status === 'loading' && (
              <div className="flex flex-col items-center py-8 gap-3">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
                <p className="text-xs text-text-secondary">
                  {action === 'archive' ? 'Creating archive...' :
                   action === 'github' ? 'Pushing to GitHub...' :
                   'Deploying to Vercel...'}
                </p>
              </div>
            )}

            {/* ── Success ─────────────────────────────── */}
            {status === 'success' && result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-success" />
                  <span className="text-sm font-semibold text-success">
                    {action === 'archive' ? 'Archive Ready' :
                     action === 'github' ? 'Pushed to GitHub' :
                     'Deployed to Vercel'}
                  </span>
                </div>

                {/* Archive result */}
                {action === 'archive' && result.downloadUrl && (
                  <a
                    href={String(result.downloadUrl)}
                    download
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-success/10 border border-success/20 text-success text-xs font-medium hover:bg-success/20 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download Archive ({(Number(result.sizeBytes) / 1024).toFixed(0)} KB)
                  </a>
                )}

                {/* GitHub result */}
                {action === 'github' && result.repoUrl && (
                  <a
                    href={String(result.repoUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-all"
                  >
                    <Github className="w-4 h-4" />
                    Open Repository
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                )}
                {action === 'github' && result.commitSha && (
                  <p className="text-2xs text-text-muted">
                    Branch: {String(result.branch)} &middot; Commit: {String(result.commitSha).slice(0, 7)}
                  </p>
                )}

                {/* Vercel result */}
                {action === 'vercel' && result.deploymentUrl && (
                  <a
                    href={String(result.deploymentUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/20 transition-all"
                  >
                    <Rocket className="w-4 h-4" />
                    Open Live Site
                    <ExternalLink className="w-3 h-3 ml-auto" />
                  </a>
                )}
                {action === 'vercel' && result.status && (
                  <p className="text-2xs text-text-muted">
                    Status: {String(result.status)} &middot; ID: {String(result.deploymentId ?? '').slice(0, 10)}
                  </p>
                )}
              </div>
            )}

            {/* ── Error ───────────────────────────────── */}
            {status === 'error' && (
              <div className="p-3 rounded-lg bg-error/[0.06] border border-error/15">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-error" />
                  <span className="text-xs font-medium text-error">Failed</span>
                </div>
                <p className="text-2xs text-error/80">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-white/[0.06] flex items-center justify-end gap-2">
            {status === 'idle' && (
              <>
                <button
                  onClick={handleClose}
                  className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-all"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {action === 'archive' ? 'Create Archive' :
                   action === 'github' ? 'Push to GitHub' :
                   'Deploy'}
                </button>
              </>
            )}
            {status === 'error' && (
              <>
                <button onClick={handleClose} className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => { setStatus('idle'); setError(null) }}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-all"
                >
                  Try Again
                </button>
              </>
            )}
            {(status === 'success' || status === 'loading') && (
              <button onClick={handleClose} className="px-4 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-text-secondary hover:bg-white/[0.10] transition-all">
                {status === 'success' ? 'Done' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
