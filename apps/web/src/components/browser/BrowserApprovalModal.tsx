import React from 'react'
import { Shield, Globe, X, CheckCircle } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useSocket } from '@/hooks/useSocket'
import type { BrowserSessionSource } from '@/types'

const SOURCE_LABELS: Record<BrowserSessionSource, string> = {
  build: 'Build Process',
  repair: 'Auto-Repair',
  manual: 'Manual Request',
  live_test: 'Live Testing',
}

export function BrowserApprovalModal() {
  const pending = useAppStore((s) => s.pendingBrowserApproval)
  const { approveBrowserSession, denyBrowserSession } = useSocket()

  if (!pending) return null

  const { sessionId, domain, purpose, plannedActions, source } = pending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-[#0f1117] shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20
            flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white leading-tight">
              Browser Access Request
            </h2>
            <p className="text-xs text-white/40 mt-0.5">
              {SOURCE_LABELS[source]} · Explicit approval required
            </p>
          </div>
          <button
            onClick={() => denyBrowserSession(sessionId)}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
              text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Domain ── */}
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Domain</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <span className="text-sm font-mono text-white/90">{domain}</span>
          </div>
        </div>

        {/* ── Purpose ── */}
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Purpose</p>
          <p className="text-sm text-white/70 leading-relaxed">{purpose}</p>
        </div>

        {/* ── Planned actions ── */}
        {plannedActions.length > 0 && (
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">
              Planned Actions ({plannedActions.length})
            </p>
            <ul className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {plannedActions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                  <CheckCircle className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-0.5" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Security notice ── */}
        <div className="px-6 py-3 bg-amber-500/[0.04] border-b border-amber-500/10">
          <p className="text-xs text-amber-400/70 leading-relaxed">
            <span className="font-semibold text-amber-400">Security:</span> The agent will operate
            in an isolated browser context. No passwords will be captured or stored. You can
            terminate the session at any time.
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 px-6 py-4">
          <button
            onClick={() => denyBrowserSession(sessionId)}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/50
              border border-white/[0.08] hover:border-white/20 hover:text-white/70
              transition-all duration-150"
          >
            Deny
          </button>
          <button
            onClick={() => approveBrowserSession(sessionId)}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white
              bg-blue-600 hover:bg-blue-500 active:bg-blue-700
              transition-all duration-150 shadow-lg shadow-blue-900/30"
          >
            Approve & Start
          </button>
        </div>
      </div>
    </div>
  )
}
