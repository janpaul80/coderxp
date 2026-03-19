import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Settings, LogOut, Zap, Rocket, LogIn, UserPlus,
  Sparkles, ChevronUp, CreditCard, Star
} from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuth } from '@/hooks/useAuth'
import { ProjectList } from './ProjectList'
import { Button } from '@/components/ui/Button'
import { PricingModal } from '@/components/billing/PricingModal'
import { cn } from '@/lib/utils'

// ─── Plan label map ───────────────────────────────────────────

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:   { label: 'Free',   color: 'text-text-muted' },
  basic:  { label: 'Basic',  color: 'text-text-secondary' },
  pro:    { label: 'Pro',    color: 'text-accent' },
  teams:  { label: 'Teams',  color: 'text-success' },
}

// ─── Credits bar ──────────────────────────────────────────────

function CreditsBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const isLow = pct >= 80

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-text-muted">Builder credits</span>
        <span className={cn('text-2xs font-mono font-medium', isLow ? 'text-warning' : 'text-text-secondary')}>
          {limit - used} left
        </span>
      </div>
      <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isLow ? 'bg-warning' : 'bg-accent'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────

export function Sidebar() {
  const setActiveProject = useAppStore((s) => s.setActiveProject)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [pricingOpen, setPricingOpen] = useState(false)
  const [accountExpanded, setAccountExpanded] = useState(false)

  const isAuthenticated = !!user

  // Mock subscription data — will come from authStore/API in Phase 2
  const plan = 'basic'
  const creditsUsed = 34
  const creditsLimit = 100
  const planInfo = PLAN_LABELS[plan] ?? PLAN_LABELS.basic

  const handleNewProject = () => {
    setActiveProject(null)
  }

  return (
    <>
      <div className="flex flex-col h-full bg-base-surface">

        {/* ── Logo header ───────────────────────────────────── */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
          <div
            className="w-7 h-7 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center shrink-0"
            style={{ boxShadow: '0 0 12px rgba(124,106,247,0.2)' }}
          >
            <Zap className="w-4 h-4 text-accent" />
          </div>
          <div>
            <span className="text-sm font-bold gradient-text">CodedXP</span>
            <p className="text-2xs text-text-muted leading-none mt-0.5">App Builder</p>
          </div>
        </div>

        {/* ── New project button ────────────────────────────── */}
        {isAuthenticated && (
          <div className="px-3 py-3">
            <Button
              variant="outline"
              size="sm"
              fullWidth
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={handleNewProject}
              className="justify-start"
            >
              New Project
            </Button>
          </div>
        )}

        {/* ── Project list ──────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2">
          {isAuthenticated ? (
            <>
              <p className="px-2 py-1.5 text-2xs font-semibold text-text-muted uppercase tracking-wider">
                Projects
              </p>
              <ProjectList />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full px-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-3">
                <Rocket className="w-5 h-5 text-accent/60" />
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Sign in to save projects and access your build history.
              </p>
            </div>
          )}
        </div>


        {/* ── Footer (authenticated) ────────────────────────── */}
        {isAuthenticated && (
          <div className="shrink-0 border-t border-white/[0.06] p-3 space-y-1">

            {/* Credits bar */}
            <div className="px-3 py-2 mb-1">
              <CreditsBar used={creditsUsed} limit={creditsLimit} />
            </div>

            {/* Settings */}
            <button
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg',
                'text-xs text-text-muted hover:text-text-secondary',
                'hover:bg-white/[0.04] transition-all duration-150'
              )}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span>Settings</span>
            </button>

            {/* Sign out */}
            <button
              onClick={logout}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg',
                'text-xs text-text-muted hover:text-error',
                'hover:bg-error/[0.06] transition-all duration-150'
              )}
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Sign out</span>
            </button>

            {/* User info + plan */}
            <button
              onClick={() => setAccountExpanded(!accountExpanded)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-lg mt-1',
                'hover:bg-white/[0.04] transition-all duration-150 group'
              )}
            >
              <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/20 flex items-center justify-center shrink-0">
                <span className="text-2xs font-semibold text-accent-light">
                  {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-text-secondary truncate">
                  {user?.name}
                </p>
                <div className="flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 text-accent" />
                  <span className={cn('text-2xs font-medium', planInfo.color)}>
                    {planInfo.label}
                  </span>
                </div>
              </div>
              <ChevronUp className={cn(
                'w-3 h-3 text-text-muted transition-transform duration-200',
                !accountExpanded && 'rotate-180'
              )} />
            </button>

            {/* Expanded account actions */}
            {accountExpanded && (
              <div className="px-3 pb-1 space-y-1">
                <button
                  onClick={() => setPricingOpen(true)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg',
                    'text-xs text-accent hover:bg-accent/[0.08]',
                    'transition-all duration-150'
                  )}
                >
                  <CreditCard className="w-3 h-3 shrink-0" />
                  <span>Upgrade plan</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Footer (unauthenticated) ──────────────────────── */}
        {!isAuthenticated && (
          <div className="shrink-0 border-t border-white/[0.06] p-3">
            <p className="text-center text-2xs text-text-muted">
              Free to explore. Sign up to build.
            </p>
          </div>
        )}
      </div>

      {/* Pricing modal */}
      <PricingModal
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        currentPlan={plan as 'basic' | 'pro' | 'teams'}
        onSelectPlan={(planId) => {
          setPricingOpen(false)
          // TODO: wire to Stripe checkout in Phase 7
          console.log('Selected plan:', planId)
        }}
      />
    </>
  )
}
