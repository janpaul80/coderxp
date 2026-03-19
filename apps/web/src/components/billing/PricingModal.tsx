import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Zap, Check, Star, Users, ArrowRight, Sparkles, Shield, Rocket
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

// ─── Plan data ────────────────────────────────────────────────

interface PlanFeature {
  text: string
  included: boolean
  highlight?: boolean
}

interface Plan {
  id: 'basic' | 'pro' | 'teams'
  name: string
  icon: React.ReactNode
  price: number
  promoPrice?: number
  promoLabel?: string
  period: string
  description: string
  credits: number
  badge?: string
  badgeVariant?: 'accent' | 'success' | 'warning'
  features: PlanFeature[]
  cta: string
  popular?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    icon: <Zap className="w-4 h-4" />,
    price: 9,
    promoPrice: 3,
    promoLabel: 'First month',
    period: '/month',
    description: 'Perfect for beginners and light builders exploring the platform.',
    credits: 100,
    features: [
      { text: '100 builder credits / month', included: true, highlight: true },
      { text: '5 active projects', included: true },
      { text: '1 concurrent preview', included: true },
      { text: '5 GB storage', included: true },
      { text: '10 GB file uploads', included: true },
      { text: '2 custom domains', included: true },
      { text: 'Landing pages & simple apps', included: true },
      { text: 'Plan + approval workflow', included: true },
      { text: 'Standard model access', included: true },
      { text: 'Full-stack app generation', included: false },
      { text: 'Auth & billing scaffolding', included: false },
      { text: 'Priority queue', included: false },
    ],
    cta: 'Start for $3',
  },
  {
    id: 'pro',
    name: 'Pro',
    icon: <Star className="w-4 h-4" />,
    price: 19,
    period: '/month',
    description: 'For serious solo founders, freelancers, and indie hackers.',
    credits: 400,
    badge: 'Most Popular',
    badgeVariant: 'accent',
    popular: true,
    features: [
      { text: '400 builder credits / month', included: true, highlight: true },
      { text: '25 active projects', included: true },
      { text: '3 concurrent previews', included: true },
      { text: '25 GB storage', included: true },
      { text: '50 GB file uploads', included: true },
      { text: '10 custom domains', included: true },
      { text: 'Full-stack app generation', included: true, highlight: true },
      { text: 'Auth + Stripe/PayPal scaffolding', included: true, highlight: true },
      { text: 'Supabase-oriented builds', included: true },
      { text: 'Better model access', included: true },
      { text: 'Priority queue', included: true },
      { text: 'Export / download artifacts', included: true },
    ],
    cta: 'Get Pro',
  },
  {
    id: 'teams',
    name: 'Teams',
    icon: <Users className="w-4 h-4" />,
    price: 49,
    period: '/month',
    description: 'For small agencies, startups, and internal product teams.',
    credits: 1500,
    badge: 'Best Value',
    badgeVariant: 'success',
    features: [
      { text: '1,500 builder credits / month', included: true, highlight: true },
      { text: 'Unlimited projects', included: true },
      { text: 'Multiple concurrent previews', included: true },
      { text: '100 GB storage', included: true },
      { text: '200 GB file uploads', included: true },
      { text: '25 custom domains', included: true },
      { text: 'Everything in Pro', included: true },
      { text: 'Shared team workspace', included: true, highlight: true },
      { text: 'Team billing visibility', included: true },
      { text: 'Highest queue priority', included: true },
      { text: 'Usage dashboard', included: true },
      { text: 'Premium support', included: true },
    ],
    cta: 'Get Teams',
  },
]

// ─── Feature row ──────────────────────────────────────────────

function FeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <li className={cn(
      'flex items-start gap-2.5 py-1',
      !feature.included && 'opacity-35'
    )}>
      <span className={cn(
        'shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center',
        feature.included
          ? feature.highlight
            ? 'bg-accent/20 text-accent'
            : 'bg-success/15 text-success'
          : 'bg-white/[0.04] text-text-muted'
      )}>
        {feature.included
          ? <Check className="w-2.5 h-2.5" />
          : <X className="w-2.5 h-2.5" />
        }
      </span>
      <span className={cn(
        'text-xs leading-relaxed',
        feature.highlight && feature.included
          ? 'text-text-primary font-medium'
          : 'text-text-secondary'
      )}>
        {feature.text}
      </span>
    </li>
  )
}

// ─── Plan card ────────────────────────────────────────────────

function PlanCard({ plan, onSelect }: { plan: Plan; onSelect: (id: Plan['id']) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'relative flex flex-col rounded-2xl border overflow-hidden',
        'transition-all duration-300',
        plan.popular
          ? 'border-accent/40 bg-gradient-to-b from-accent/[0.08] to-base-card'
          : 'border-white/[0.08] bg-base-card hover:border-white/[0.14]'
      )}
      style={plan.popular ? {
        boxShadow: '0 0 40px rgba(124,106,247,0.12), 0 4px 24px rgba(0,0,0,0.4)'
      } : {
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
      }}
    >
      {/* Popular glow top border */}
      {plan.popular && (
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      )}

      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between mb-3">
          <div className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center',
            plan.popular
              ? 'bg-accent/20 text-accent border border-accent/30'
              : 'bg-white/[0.06] text-text-secondary border border-white/[0.08]'
          )}>
            {plan.icon}
          </div>
          {plan.badge && (
            <span className={cn(
              'text-2xs font-semibold px-2 py-0.5 rounded-full border',
              plan.badgeVariant === 'accent'
                ? 'bg-accent/15 text-accent border-accent/25'
                : plan.badgeVariant === 'success'
                  ? 'bg-success/15 text-success border-success/25'
                  : 'bg-warning/15 text-warning border-warning/25'
            )}>
              {plan.badge}
            </span>
          )}
        </div>

        <h3 className="text-base font-bold text-text-primary mb-1">{plan.name}</h3>
        <p className="text-xs text-text-muted leading-relaxed mb-4">{plan.description}</p>

        {/* Pricing */}
        <div className="mb-1">
          {plan.promoPrice ? (
            <div className="space-y-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-text-primary">${plan.promoPrice}</span>
                <span className="text-sm text-text-muted">{plan.period}</span>
                <span className="text-xs bg-success/15 text-success border border-success/20 px-1.5 py-0.5 rounded-md font-medium">
                  {plan.promoLabel}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                then{' '}
                <span className="text-text-secondary font-medium">${plan.price}/month</span>
              </p>
            </div>
          ) : (
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-text-primary">${plan.price}</span>
              <span className="text-sm text-text-muted">{plan.period}</span>
            </div>
          )}
        </div>

        {/* Credits badge */}
        <div className="flex items-center gap-1.5 mt-3">
          <Sparkles className="w-3 h-3 text-accent" />
          <span className="text-xs text-accent font-medium">
            {plan.credits.toLocaleString()} builder credits / month
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/[0.05] mx-5" />

      {/* Features */}
      <div className="flex-1 p-5 pt-4">
        <ul className="space-y-0.5">
          {plan.features.map((f, i) => (
            <FeatureRow key={i} feature={f} />
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="p-5 pt-0">
        <button
          onClick={() => onSelect(plan.id)}
          className={cn(
            'w-full py-2.5 rounded-xl text-sm font-semibold',
            'flex items-center justify-center gap-2',
            'transition-all duration-200',
            plan.popular
              ? 'bg-accent text-white hover:bg-accent-light'
              : 'bg-white/[0.06] text-text-primary hover:bg-white/[0.10] border border-white/[0.08]'
          )}
          style={plan.popular ? {
            boxShadow: '0 0 20px rgba(124,106,247,0.3)'
          } : undefined}
        >
          {plan.cta}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

// ─── Credits explainer ────────────────────────────────────────

function CreditsExplainer() {
  const items = [
    { label: 'Planning request', cost: '~2 credits' },
    { label: 'App generation step', cost: '~8 credits' },
    { label: 'Repair / fix loop', cost: '~5 credits' },
    { label: 'Full autonomous build', cost: '~20–40 credits' },
  ]

  return (
    <div className="mt-6 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-3.5 h-3.5 text-text-muted" />
        <p className="text-xs font-medium text-text-secondary">How builder credits work</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-2">
            <span className="text-2xs text-text-muted">{item.label}</span>
            <span className="text-2xs font-mono text-accent shrink-0">{item.cost}</span>
          </div>
        ))}
      </div>
      <p className="text-2xs text-text-muted mt-3 leading-relaxed">
        Credits reset monthly. No overage charges — builds pause when credits run out.
      </p>
    </div>
  )
}

// ─── Pricing modal ────────────────────────────────────────────

interface PricingModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectPlan?: (planId: Plan['id']) => void
  currentPlan?: Plan['id']
}

export function PricingModal({ isOpen, onClose, onSelectPlan, currentPlan }: PricingModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<Plan['id'] | null>(null)

  const handleSelect = (planId: Plan['id']) => {
    setSelectedPlan(planId)
    onSelectPlan?.(planId)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto pointer-events-auto rounded-2xl"
              style={{
                background: 'rgba(10, 10, 20, 0.97)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,106,247,0.1)',
              }}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.06]"
                style={{ background: 'rgba(10,10,20,0.95)', backdropFilter: 'blur(12px)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/25 flex items-center justify-center">
                    <Rocket className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-text-primary">Choose your plan</h2>
                    <p className="text-xs text-text-muted">Start building with CodedXP today</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-white/[0.08] transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Headline */}
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold gradient-text mb-2">
                    Build anything. Ship fast.
                  </h3>
                  <p className="text-sm text-text-muted max-w-md mx-auto">
                    Simple, transparent pricing. No hidden fees. Cancel anytime.
                  </p>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {PLANS.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>

                {/* Credits explainer */}
                <CreditsExplainer />

                {/* Footer note */}
                <p className="text-center text-2xs text-text-muted mt-4">
                  All plans include the plan + approval workflow, chat-based building, and live preview.
                  Stripe-secured payments. Cancel anytime.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
