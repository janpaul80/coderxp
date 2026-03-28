/**
 * MemoryPanel — Shows what the agent remembers about this project and user
 *
 * Fetches project memory + user memory from the server and displays:
 *  - Approved direction
 *  - Preferred stack
 *  - Integrations
 *  - Build history
 *  - Failure history (with fix status)
 *  - Key decisions
 *  - Repo snapshot summary
 */

import React, { useEffect, useState } from 'react'
import { Brain, RefreshCw, CheckCircle, XCircle, Loader2, Database, Code, Shield, Layers } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

interface MemoryPanelProps {
  projectId?: string | null
}

interface ProjectMemory {
  approvedDirection?: string
  preferredStack?: { frontend?: string[]; backend?: string[]; database?: string[]; auth?: string[]; deployment?: string[] }
  authProvider?: string
  integrations?: string[]
  lastBuildStatus?: string
  lastBuildMeta?: { completedAt?: string; fileCount?: number; totalBytes?: number }
  failureHistory?: Array<{ phase: string; category: string; error: string; fixed: boolean; fix?: string }>
  decisions?: Array<{ type: string; summary: string; at: string }>
  repoSnapshot?: { totalFiles?: number; components?: string[]; routes?: Array<{ path: string; component: string }>; dependencies?: string[] }
}

export function MemoryPanel({ projectId }: MemoryPanelProps) {
  const [memory, setMemory] = useState<ProjectMemory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMemory = async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/api/memory/project/${projectId}`)
      const data = res.data as { memory: ProjectMemory | null; hasMemory: boolean }
      setMemory(data.memory)
    } catch (err) {
      setError('Could not load memory')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMemory()
  }, [projectId])

  if (!projectId) {
    return (
      <div className="text-center py-6">
        <Brain className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
        <p className="text-xs text-text-muted">Select a project to view its memory</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
        <span className="text-xs text-text-muted">Loading project memory...</span>
      </div>
    )
  }

  if (error || !memory) {
    return (
      <div className="text-center py-6">
        <Brain className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-40" />
        <p className="text-xs text-text-muted">{error || 'No memory for this project yet'}</p>
        <button onClick={fetchMemory} className="mt-2 text-2xs text-accent hover:underline">Retry</button>
      </div>
    )
  }

  const stack = memory.preferredStack
  const failures = memory.failureHistory ?? []
  const decisions = memory.decisions ?? []
  const snap = memory.repoSnapshot

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-text-primary">Project Memory</span>
        </div>
        <button
          onClick={fetchMemory}
          className="p-1 rounded text-text-muted hover:text-text-secondary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Direction */}
      {memory.approvedDirection && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Direction</span>
          <p className="text-xs text-text-secondary mt-1">{memory.approvedDirection}</p>
        </div>
      )}

      {/* Stack */}
      {stack && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Tech Stack</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {stack.frontend?.map(t => (
              <span key={t} className="text-2xs px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                <Code className="w-2.5 h-2.5 inline mr-0.5" />{t}
              </span>
            ))}
            {stack.backend?.map(t => (
              <span key={t} className="text-2xs px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-300">
                <Layers className="w-2.5 h-2.5 inline mr-0.5" />{t}
              </span>
            ))}
            {stack.database?.map(t => (
              <span key={t} className="text-2xs px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">
                <Database className="w-2.5 h-2.5 inline mr-0.5" />{t}
              </span>
            ))}
            {stack.auth?.map(t => (
              <span key={t} className="text-2xs px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">
                <Shield className="w-2.5 h-2.5 inline mr-0.5" />{t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Build Status */}
      {memory.lastBuildStatus && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Last Build</span>
          <div className="mt-1 flex items-center gap-2">
            {memory.lastBuildStatus === 'complete' ? (
              <CheckCircle className="w-3 h-3 text-success" />
            ) : (
              <XCircle className="w-3 h-3 text-error" />
            )}
            <span className="text-xs text-text-secondary">
              {memory.lastBuildStatus === 'complete' ? 'Successful' : 'Failed'}
              {memory.lastBuildMeta?.fileCount && ` — ${memory.lastBuildMeta.fileCount} files`}
              {memory.lastBuildMeta?.totalBytes && ` (${(memory.lastBuildMeta.totalBytes / 1024).toFixed(0)} KB)`}
            </span>
          </div>
        </div>
      )}

      {/* Repo Snapshot */}
      {snap && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">Repo Snapshot</span>
          <div className="mt-1.5 space-y-1 text-2xs text-text-secondary">
            {snap.totalFiles && <p>{snap.totalFiles} files indexed</p>}
            {snap.components && snap.components.length > 0 && (
              <p>Components: {snap.components.slice(0, 8).join(', ')}{snap.components.length > 8 ? ` +${snap.components.length - 8} more` : ''}</p>
            )}
            {snap.routes && snap.routes.length > 0 && (
              <p>Routes: {snap.routes.slice(0, 5).map(r => r.path).join(', ')}{snap.routes.length > 5 ? ` +${snap.routes.length - 5} more` : ''}</p>
            )}
          </div>
        </div>
      )}

      {/* Failures */}
      {failures.length > 0 && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">
            Failure History ({failures.length})
          </span>
          <div className="mt-1.5 space-y-1">
            {failures.slice(-5).map((f, i) => (
              <div key={i} className="flex items-start gap-1.5 text-2xs">
                {f.fixed ? (
                  <CheckCircle className="w-3 h-3 text-success shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-3 h-3 text-error shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="text-text-secondary">{f.category}: {f.error.slice(0, 80)}</span>
                  {f.fixed && f.fix && <span className="text-success ml-1">(fixed: {f.fix.slice(0, 40)})</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
          <span className="text-2xs font-semibold text-text-muted uppercase tracking-wider">
            Key Decisions ({decisions.length})
          </span>
          <div className="mt-1.5 space-y-1">
            {decisions.slice(-5).map((d, i) => (
              <p key={i} className="text-2xs text-text-secondary">
                {d.summary.slice(0, 100)}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
