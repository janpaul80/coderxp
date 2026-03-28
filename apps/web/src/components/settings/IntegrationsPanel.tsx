import React, { useState, useEffect } from 'react'
import { Github, Rocket, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'

const STORAGE_KEY_GITHUB = 'coderxp:github_pat'
const STORAGE_KEY_VERCEL = 'coderxp:vercel_token'

export function IntegrationsPanel() {
  const [githubToken, setGithubToken] = useState('')
  const [vercelToken, setVercelToken] = useState('')
  const [showGithub, setShowGithub] = useState(false)
  const [showVercel, setShowVercel] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    setGithubToken(localStorage.getItem(STORAGE_KEY_GITHUB) ?? '')
    setVercelToken(localStorage.getItem(STORAGE_KEY_VERCEL) ?? '')
  }, [])

  const handleSaveGithub = () => {
    if (githubToken.trim()) {
      localStorage.setItem(STORAGE_KEY_GITHUB, githubToken.trim())
    } else {
      localStorage.removeItem(STORAGE_KEY_GITHUB)
    }
    setSaved('github')
    setTimeout(() => setSaved(null), 2000)
  }

  const handleSaveVercel = () => {
    if (vercelToken.trim()) {
      localStorage.setItem(STORAGE_KEY_VERCEL, vercelToken.trim())
    } else {
      localStorage.removeItem(STORAGE_KEY_VERCEL)
    }
    setSaved('vercel')
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <div className="space-y-5">
      {/* GitHub */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-text-secondary" />
          <span className="text-xs font-semibold text-text-primary">GitHub</span>
        </div>
        <p className="text-2xs text-text-muted">
          Personal Access Token with <code className="text-accent">repo</code> scope.{' '}
          <a
            href="https://github.com/settings/tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Create token
          </a>
        </p>
        <div className="relative">
          <input
            type={showGithub ? 'text' : 'password'}
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 pr-16 rounded-lg bg-base border border-white/[0.08] text-xs text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowGithub(!showGithub)}
              className="p-1 text-text-muted hover:text-text-secondary"
            >
              {showGithub ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleSaveGithub}
              className="px-2 py-0.5 rounded text-2xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-all"
            >
              {saved === 'github' ? <Check className="w-3 h-3" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Vercel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-text-secondary" />
          <span className="text-xs font-semibold text-text-primary">Vercel</span>
        </div>
        <p className="text-2xs text-text-muted">
          Vercel API token.{' '}
          <a
            href="https://vercel.com/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Create token
          </a>
        </p>
        <div className="relative">
          <input
            type={showVercel ? 'text' : 'password'}
            value={vercelToken}
            onChange={(e) => setVercelToken(e.target.value)}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full px-3 py-2 pr-16 rounded-lg bg-base border border-white/[0.08] text-xs text-text-primary placeholder:text-text-muted focus:border-accent/40 focus:outline-none"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowVercel(!showVercel)}
              className="p-1 text-text-muted hover:text-text-secondary"
            >
              {showVercel ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleSaveVercel}
              className="px-2 py-0.5 rounded text-2xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-all"
            >
              {saved === 'vercel' ? <Check className="w-3 h-3" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
        <AlertCircle className="w-3.5 h-3.5 text-text-muted mt-0.5 shrink-0" />
        <p className="text-2xs text-text-muted leading-relaxed">
          Tokens are stored locally in your browser. They are never sent to CoderXP servers —
          they are only used client-to-API for GitHub and Vercel operations.
        </p>
      </div>
    </div>
  )
}

// Export helpers for other components to read saved tokens
export function getSavedGithubToken(): string {
  return localStorage.getItem(STORAGE_KEY_GITHUB) ?? ''
}

export function getSavedVercelToken(): string {
  return localStorage.getItem(STORAGE_KEY_VERCEL) ?? ''
}
