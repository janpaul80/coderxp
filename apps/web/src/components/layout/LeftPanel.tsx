import React, { useState, useRef, useEffect } from 'react'
import { Plus, Zap, LogIn, UserPlus, ChevronDown, LogOut, Settings } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useAuth } from '@/hooks/useAuth'
import { StatusIndicator } from '@/components/ui/StatusIndicator'
import { Button } from '@/components/ui/Button'
import { ChatThread } from '@/components/chat/ChatThread'
import { ChatInput } from '@/components/chat/ChatInput'
import { cn } from '@/lib/utils'

// ─── Auth dropdown ────────────────────────────────────────────

function AuthDropdown() {
  const user = useAuthStore((s) => s.user)
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
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
    // Authenticated: avatar + dropdown
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
          <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/25 flex items-center justify-center shrink-0">
            <span className="text-2xs font-semibold text-accent-light">
              {user.name?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
          <span className="text-xs text-text-secondary max-w-[80px] truncate hidden sm:block">
            {user.name}
          </span>
          <ChevronDown className={cn('w-3 h-3 text-text-muted transition-transform duration-150', open && 'rotate-180')} />
        </button>

        {open && (
          <div className={cn(
            'absolute right-0 top-full mt-1.5 w-44 z-50',
            'bg-base-card border border-white/[0.08] rounded-xl shadow-card-lg',
            'py-1 overflow-hidden'
          )}>
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-2xs text-text-muted truncate">{user.email}</p>
            </div>
            <button
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

  // Unauthenticated: sign in button + dropdown
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
          'bg-accent/10 border border-accent/20 hover:bg-accent/15 hover:border-accent/30',
          'text-xs font-medium text-accent transition-all duration-150',
          open && 'bg-accent/15 border-accent/30'
        )}
      >
        <LogIn className="w-3.5 h-3.5 shrink-0" />
        <span>Sign In</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(
          'absolute right-0 top-full mt-1.5 w-44 z-50',
          'bg-base-card border border-white/[0.08] rounded-xl shadow-card-lg',
          'py-1 overflow-hidden'
        )}>
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all"
          >
            <LogIn className="w-3.5 h-3.5 shrink-0 text-accent" />
            <div className="text-left">
              <p className="font-medium text-text-primary">Sign In</p>
              <p className="text-2xs text-text-muted">Access your projects</p>
            </div>
          </button>
          <button
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-text-secondary hover:text-text-primary hover:bg-white/[0.04] transition-all"
          >
            <UserPlus className="w-3.5 h-3.5 shrink-0 text-accent" />
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

  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-accent" />
            </div>
            <span className="text-sm font-semibold gradient-text">CodedXP</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <StatusIndicator mode={appMode} showLabel={false} />

          {/* New project */}
          <Button
            variant="ghost"
            size="xs"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {/* TODO: new project */}}
          >
            New
          </Button>

          {/* Auth dropdown */}
          <AuthDropdown />
        </div>
      </div>

      {/* ── Project name bar ────────────────────────────────── */}
      {activeProject && (
        <div className="px-4 py-2 border-b border-white/[0.04] bg-base-elevated/50 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                activeProject.status === 'ready' ? 'bg-success' :
                activeProject.status === 'building' ? 'bg-accent animate-pulse' :
                activeProject.status === 'error' ? 'bg-error' :
                'bg-text-muted'
              )}
            />
            <span className="text-xs font-medium text-text-secondary truncate">
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
      <div className="shrink-0 px-4 py-2.5 border-t border-white/[0.04] bg-base-elevated/30">
        <div className="flex items-center justify-between">
          <span className="text-2xs text-text-muted">CodedXP</span>
          <StatusIndicator mode={appMode} showLabel={true} className="shrink-0" />
        </div>
      </div>
    </div>
  )
}
