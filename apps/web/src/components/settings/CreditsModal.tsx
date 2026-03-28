import React, { useState } from 'react'
import { X, Coins, Zap, Crown, Users, Check, ExternalLink, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import type { PlanTier } from '@/types'

const API_BASE = ((import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? 'http://localhost:3001')

// ─── Plan definitions ────────────────────────────────────────

interface PlanDef {
  tier: PlanTier
  name: string
  price: string
  period: string
  description: string
  features: string[]
  icon: React.ReactNode
  accent: string
  popular?: boolean
  stripePriceId?: string
}

const PLANS: PlanDef[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Get started building',
    features: [
      '50 credits included',
      'Community support',
      'Basic AI models',
      '1 project at a time',
    ],
    icon: <Zap className="w-4 h-4" />,
    accent: 'text-white/60 border-white/[0.08] bg-white/[0.02]',
  },
  {
    tier: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/month',
    description: 'For serious builders',
    features: [
      '2,000 credits/month',
      'Priority support',
      'All AI models',
      'Unlimited projects',
      'Custom deployments',
      'Visual builder access',
    ],
    icon: <Crown className="w-4 h-4" />,
    accent: 'text-accent border-accent/30 bg-accent/[0.06]',
    popular: true,
    stripePriceId: 'price_pro_monthly',
  },
  {
    tier: 'team',
    name: 'Team',
    price: '$49',
    period: '/month',
    description: 'Collaborate at scale',
    features: [
      '10,000 credits/month',
      'Dedicated support',
      'All AI models',
      'Unlimited projects',
      'Team collaboration',
      'Priority build queue',
      'Custom integrations',
    ],
    icon: <Users className="w-4 h-4" />,
    accent: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/[0.06]',
    stripePriceId: 'price_team_monthly',
  },
]

// ─── Credit top-up packages ──────────────────────────────────

interface CreditPack {
  credits: number
  price: string
  pricePerCredit: string
  popular?: boolean
  stripePriceId: string
}

const CREDIT_PACKS: CreditPack[] = [
  { credits: 1000, price: '$9', pricePerCredit: '$0.009', stripePriceId: 'price_credits_1000' },
  { credits: 5000, price: '$39', pricePerCredit: '$0.0078', popular: true, stripePriceId: 'price_credits_5000' },
  { credits: 15000, price: '$99', pricePerCredit: '$0.0066', stripePriceId: 'price_credits_15000' },
  { credits: 50000, price: '$279', pricePerCredit: '$0.0056', stripePriceId: 'price_credits_50000' },
]

// ─── Component ────────────────────────────────────────────────

interface CreditsModalProps {
  open: boolean
  onClose: () => void
}

export function CreditsModal({ open, onClose }: CreditsModalProps) {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const [tab, setTab] = useState<'plans' | 'credits'>('plans')
  const [loading, setLoading] = useState<string | null>(null)

  if (!open) return null

  const currentPlan = user?.plan ?? 'free'
  const currentCredits = user?.credits ?? 0

  async function handleCheckout(priceId: string) {
    if (!token) return
    setLoading(priceId)
    try {
      const res = await fetch(`${API_BASE}/api/billing/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Checkout failed:', err)
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className={cn(
          'pointer-events-auto w-full max-w-lg',
          'bg-[#0c0c18] border border-white/[0.08] rounded-2xl shadow-card-lg',
          'flex flex-col max-h-[85vh]'
        )}>

          {/* ── Header ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center">
                <Coins className="w-4 h-4 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Credits & Plans</h2>
                <p className="text-2xs text-white/40">Manage your subscription and credits</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Balance card ────────────────────────────── */}
          <div className="px-5 pt-4 pb-3 shrink-0">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div>
                <p className="text-2xs text-white/30 uppercase tracking-wider mb-1">Current Balance</p>
                <p className="text-2xl font-bold text-white tabular-nums">
                  {currentCredits.toLocaleString()}
                  <span className="text-sm font-normal text-white/30 ml-1.5">credits</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-white/30 uppercase tracking-wider mb-1">Plan</p>
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold border',
                  currentPlan === 'pro' ? 'text-accent border-accent/30 bg-accent/10' :
                  currentPlan === 'team' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' :
                  'text-white/50 border-white/[0.10] bg-white/[0.04]'
                )}>
                  {currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Tabs ────────────────────────────────────── */}
          <div className="px-5 shrink-0">
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
              {(['plans', 'credits'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 rounded-md text-xs font-medium transition-all',
                    tab === t
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/40 hover:text-white/60'
                  )}
                >
                  {t === 'plans' ? 'Upgrade Plan' : 'Buy Credits'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Content ─────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
            {tab === 'plans' ? (
              <div className="space-y-3">
                {PLANS.map((plan) => {
                  const isCurrent = plan.tier === currentPlan
                  return (
                    <div
                      key={plan.tier}
                      className={cn(
                        'relative p-4 rounded-xl border transition-all',
                        plan.popular
                          ? 'border-accent/30 bg-accent/[0.04]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]'
                      )}
                    >
                      {plan.popular && (
                        <div className="absolute -top-2 right-4">
                          <span className="px-2 py-0.5 rounded-full bg-accent text-[10px] font-bold text-white uppercase tracking-wider">
                            Popular
                          </span>
                        </div>
                      )}

                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center', plan.accent)}>
                            {plan.icon}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{plan.name}</p>
                            <p className="text-2xs text-white/40">{plan.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-white">{plan.price}</span>
                          <span className="text-2xs text-white/30">{plan.period}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mb-3">
                        {plan.features.map((f) => (
                          <div key={f} className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-400/70 shrink-0" />
                            <span className="text-2xs text-white/50">{f}</span>
                          </div>
                        ))}
                      </div>

                      {isCurrent ? (
                        <div className="py-2 text-center text-2xs font-medium text-white/30 border border-white/[0.06] rounded-lg bg-white/[0.02]">
                          Current plan
                        </div>
                      ) : plan.stripePriceId ? (
                        <button
                          onClick={() => handleCheckout(plan.stripePriceId!)}
                          disabled={loading === plan.stripePriceId}
                          className={cn(
                            'w-full py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5',
                            plan.popular
                              ? 'bg-accent hover:bg-accent/90 text-white'
                              : 'bg-white/[0.08] hover:bg-white/[0.12] text-white/80',
                            loading === plan.stripePriceId && 'opacity-60 cursor-not-allowed'
                          )}
                        >
                          {loading === plan.stripePriceId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>Upgrade to {plan.name}</>
                          )}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-white/40 mb-2">
                  Top up your credits without changing your plan.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {CREDIT_PACKS.map((pack) => (
                    <div
                      key={pack.credits}
                      className={cn(
                        'relative p-4 rounded-xl border transition-all cursor-pointer hover:border-accent/30',
                        pack.popular
                          ? 'border-accent/25 bg-accent/[0.04]'
                          : 'border-white/[0.06] bg-white/[0.02]'
                      )}
                    >
                      {pack.popular && (
                        <div className="absolute -top-2 right-3">
                          <span className="px-1.5 py-0.5 rounded-full bg-accent text-[9px] font-bold text-white uppercase tracking-wider">
                            Best value
                          </span>
                        </div>
                      )}

                      <p className="text-lg font-bold text-white mb-0.5">
                        {pack.credits.toLocaleString()}
                      </p>
                      <p className="text-2xs text-white/30 mb-3">credits</p>

                      <div className="flex items-baseline gap-1 mb-3">
                        <span className="text-base font-bold text-white">{pack.price}</span>
                        <span className="text-2xs text-white/30">{pack.pricePerCredit}/cr</span>
                      </div>

                      <button
                        onClick={() => handleCheckout(pack.stripePriceId)}
                        disabled={loading === pack.stripePriceId}
                        className={cn(
                          'w-full py-1.5 rounded-lg text-2xs font-semibold transition-all flex items-center justify-center gap-1',
                          pack.popular
                            ? 'bg-accent hover:bg-accent/90 text-white'
                            : 'bg-white/[0.08] hover:bg-white/[0.12] text-white/70',
                          loading === pack.stripePriceId && 'opacity-60 cursor-not-allowed'
                        )}
                      >
                        {loading === pack.stripePriceId ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Buy'
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ──────────────────────────────────── */}
          <div className="px-5 py-3 border-t border-white/[0.06] shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-2xs text-white/20">
              <ExternalLink className="w-3 h-3" />
              Powered by Stripe
            </div>
            <p className="text-2xs text-white/20">Secure checkout</p>
          </div>
        </div>
      </div>
    </>
  )
}
