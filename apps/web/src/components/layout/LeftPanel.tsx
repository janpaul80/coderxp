import React, { useState, useRef, useEffect } from 'react'
import { LogIn, UserPlus, ChevronDown, LogOut, Settings, Coins, Shield, Plug } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useAuth } from '@/hooks/useAuth'
import { StatusIndicator } from '@/components/ui/StatusIndicator'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput } from '@/components/chat/ChatInput'
import { cn } from '@/lib/utils'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { CreditsModal } from '@/components/settings/CreditsModal'
import { ApiProviderModal } from '@/components/settings/ApiProviderModal'
import { McpMarketplaceModal } from '@/components/settings/McpMarketplaceModal'

// ─── Plugins dropdown ──────────────────────────────────────────

function PluginsDropdown({ onOpenApi, onOpenMcp }: { onOpenApi: () => void, onOpenMcp: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          'bg-white/[0.04] border border-white/[0.06] text-white/60',
          'hover:bg-white/[0.08] hover:border-white/[0.12]',
          open && 'bg-white/[0.08] border-white/[0.12]'
        )}
      >
        <span>Plugins</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 top-full mt-1.5 w-48 z-50',
          'bg-[#1D1D1D] border border-white/[0.08] rounded-xl shadow-card-lg',
          'py-1 overflow-hidden'
        )}>
          <button
            onClick={() => { onOpenApi(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-white hover:bg-white/[0.04] transition-all"
          >
            <Shield className="w-4 h-4 text-white/40 shrink-0" />
            <div className="text-left">
              <p className="font-medium text-white/90">API Settings</p>
              <p className="text-2xs text-white/40">Manage AI providers</p>
            </div>
          </button>
          <button
            onClick={() => { onOpenMcp(); setOpen(false) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-white hover:bg-white/[0.04] transition-all"
          >
            <Plug className="w-4 h-4 text-emerald-400/60 shrink-0" />
            <div className="text-left">
              <p className="font-medium text-white/90">MCP Tools</p>
              <p className="text-2xs text-white/40">Browse external tools</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Auth dropdown ────────────────────────────────────────────

function AuthDropdown({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const user = useAuthStore((s) => s.user)
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (user) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded-lg',
            'hover:bg-white/[0.05] transition-all duration-150',
            open && 'bg-white/[0.05]'
          )}
        >
          <div className="w-6 h-6 rounded-full bg-[#1D1D1D] border border-white/[0.08] flex items-center justify-center shrink-0">
            <span className="text-2xs font-semibold text-white/80">
              {user.name?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
          <ChevronDown className={cn('w-3 h-3 text-white/30 transition-transform duration-150', open && 'rotate-180')} />
        </button>

        {open && (
          <div className={cn(
            'absolute right-0 top-full mt-1.5 w-44 z-50',
            'bg-[#1D1D1D] border border-white/[0.08] rounded-xl shadow-card-lg',
            'py-1 overflow-hidden'
          )}>
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-2xs text-text-muted truncate">{user.email}</p>
            </div>
            <button
              onClick={() => { onOpenSettings?.(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all"
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              Settings
            </button>
            <button
              onClick={() => { logout(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-muted hover:text-error hover:bg-error/[0.06] transition-all"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              Sign out
            </button>
          </div>
        )}
      </div>
    )
  }

  // Unauthenticated
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
          'bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12]',
          'text-xs font-medium text-white/60 transition-all duration-150',
          open && 'bg-white/[0.08] border-white/[0.12]'
        )}
      >
        <LogIn className="w-3.5 h-3.5 shrink-0" />
        <span>Sign In</span>
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 top-full mt-1.5 w-44 z-50',
          'bg-[#1D1D1D] border border-white/[0.08] rounded-xl shadow-card-lg',
          'py-1 overflow-hidden'
        )}>
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all"
          >
            <LogIn className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <div className="text-left">
              <p className="font-medium text-text-primary">Sign In</p>
              <p className="text-2xs text-text-muted">Access your projects</p>
            </div>
          </button>
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all"
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0 text-white/40" />
            <div className="text-left">
              <p className="font-medium text-text-primary">Create Account</p>
              <p className="text-2xs text-text-muted">Free to get started</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Left panel ───────────────────────────────────────────────

export function LeftPanel() {
  const appMode = useAppStore((s) => s.appMode)
  const activeProjectId = useChatStore((s) => s.activeProjectId)
  const projects = useChatStore((s) => s.projects)
  const user = useAuthStore((s) => s.user)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [apiModalOpen, setApiModalOpen] = useState(false)
  const [mcpModalOpen, setMcpModalOpen] = useState(false)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          {/* Real CoderXP logo — increased size */}
          <img
            src="/logo-white.png"
            alt="CoderXP"
            className="h-20 w-auto select-none"
            draggable={false}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {/* Status indicator */}
          <StatusIndicator mode={appMode} showLabel={false} />

          {/* Plugins dropdown */}
          <PluginsDropdown onOpenApi={() => setApiModalOpen(true)} onOpenMcp={() => setMcpModalOpen(true)} />

          {/* Credits button */}
          <button
            onClick={() => setCreditsOpen(true)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all',
              'bg-white/[0.04] border border-white/[0.06] text-white/50',
              'hover:bg-accent/10 hover:border-accent/20 hover:text-accent-light'
            )}
          >
            <Coins className="w-3.5 h-3.5" />
            <span className="tabular-nums">{user?.credits ?? 0}</span>
          </button>

          {/* Auth dropdown */}
          <AuthDropdown onOpenSettings={() => setSettingsOpen(true)} />
        </div>
      </div>

      {/* ── Project name bar ────────────────────────────────── */}
      {activeProject && (
        <div className="px-4 py-2 border-b border-white/[0.04] bg-white/[0.015] shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                activeProject.status === 'ready' ? 'bg-emerald-400' :
                activeProject.status === 'building' ? 'bg-accent animate-pulse' :
                activeProject.status === 'error' ? 'bg-red-400' :
                'bg-white/20'
              )}
            />
            <span className="text-xs font-medium text-white/50 truncate">
              {activeProject.name}
            </span>
          </div>
        </div>
      )}

      {/* ── Chat thread ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatThread />
      </div>

      {/* ── Input area ──────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/[0.06]">
        <ChatInput />
      </div>

      {/* ── Status footer ───────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 border-t border-white/[0.04] bg-transparent">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50 tracking-wider w-20">CoderXP</span>
          
          <div className="flex-1 flex justify-center">
            <span className="text-xs text-white/40 hidden xl:inline font-medium">
              Upgrade to Team for more credits.<span className="mx-1.5 opacity-40">•</span>
              <a href="https://coderxp.pro/pricing" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300">
                Upgrade Plan
              </a>
            </span>

            <span className="text-[10px] text-white/40 hidden md:inline xl:hidden text-center">
              Upgrade to Team for more c...
              <a href="https://coderxp.pro/pricing" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 ml-1">
                Upgrade Plan
              </a>
            </span>
          </div>

          <div className="w-20 flex justify-end">
            <StatusIndicator mode={appMode} showLabel={true} className="shrink-0" />
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────── */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projectId={activeProjectId}
      />
      <CreditsModal
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
      />
      <ApiProviderModal open={apiModalOpen} onClose={() => setApiModalOpen(false)} />
      <McpMarketplaceModal open={mcpModalOpen} onClose={() => setMcpModalOpen(false)} />
    </div>
  )
}
