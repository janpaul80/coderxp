import React, { useState } from 'react'
import { X, Settings, Brain, Shield, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RulesPanel } from './RulesPanel'
import { MemoryPanel } from './MemoryPanel'
import { IntegrationsPanel } from './IntegrationsPanel'

// ─── Props ────────────────────────────────────────────────────

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  projectId?: string | null
}

// ─── Modal ────────────────────────────────────────────────────

export function SettingsModal({ open, onClose, projectId }: SettingsModalProps) {
  const [tab, setTab] = useState<'rules' | 'memory' | 'integrations'>('rules')

  if (!open) return null

  return (
    <React.Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className={cn(
          'pointer-events-auto w-full max-w-md',
          'bg-base-card border border-white/[0.08] rounded-2xl shadow-card-lg',
          'flex flex-col max-h-[80vh]'
        )}>

          {/* ── Header ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
                <Settings className="w-3.5 h-3.5 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
                <p className="text-2xs text-text-muted">Customize your CodedXP experience</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.06] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Tabs ────────────────────────────────────── */}
          <div className="flex px-5 pt-3 gap-1 shrink-0">
            <button
              onClick={() => setTab('rules')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                tab === 'rules'
                  ? 'bg-accent/15 border border-accent/25 text-accent'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
              )}
            >
              <Shield className="w-3 h-3" />
              Rules
            </button>
            <button
              onClick={() => setTab('memory')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                tab === 'memory'
                  ? 'bg-accent/15 border border-accent/25 text-accent'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
              )}
            >
              <Brain className="w-3 h-3" />
              Memory
            </button>
            <button
              onClick={() => setTab('integrations')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                tab === 'integrations'
                  ? 'bg-accent/15 border border-accent/25 text-accent'
                  : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
              )}
            >
              <Plug className="w-3 h-3" />
              Integrations
            </button>
          </div>

          {/* ── Content ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {tab === 'rules' && <RulesPanel projectId={projectId} />}
            {tab === 'memory' && <MemoryPanel projectId={projectId} />}
            {tab === 'integrations' && <IntegrationsPanel />}
          </div>

        </div>
      </div>
    </React.Fragment>
  )
}
