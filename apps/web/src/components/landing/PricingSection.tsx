import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    priceMonthly: 9,
    priceAnnual: 3,
    period: '/mo',
    annualNote: 'billed annually',
    monthlyNote: 'billed monthly',
    description: 'Perfect for solo developers and side projects.',
    cta: 'Start free trial',
    ctaHref: '/auth?mode=register&plan=basic',
    highlight: false,
    features: [
      '10 builds per month',
      'Live preview sandbox',
      'AI chat refinement',
      'File upload context',
      '1 concurrent project',
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 29,
    priceAnnual: 19,
    period: '/mo',
    annualNote: 'billed annually',
    monthlyNote: 'billed monthly',
    description: 'For professionals shipping real products.',
    cta: 'Get started',
    ctaHref: '/auth?mode=register&plan=pro',
    highlight: true,
    badge: 'Most popular',
    features: [
      'Unlimited builds',
      'Live preview sandbox',
      'AI chat refinement',
      'File & GitHub import',
      'Credential vault',
      'Browser agent (10 sessions/mo)',
      '5 concurrent projects',
      'Priority support',
    ],
  },
  {
    id: 'teams',
    name: 'Teams',
    priceMonthly: 79,
    priceAnnual: 59,
    period: '/mo',
    annualNote: 'per seat, billed annually',
    monthlyNote: 'per seat, billed monthly',
    description: 'For engineering teams moving fast together.',
    cta: 'Contact sales',
    ctaHref: 'mailto:hello@codedxp.com',
    highlight: false,
    features: [
      'Everything in Pro',
      'Unlimited browser agent sessions',
      'Shared credential vault',
      'Team project workspace',
      'SSO / SAML',
      'Audit logs',
      'Dedicated Slack support',
      'Custom SLA',
    ],
  },
]

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function PricingSection() {
  const [annual, setAnnual] = useState(true)

  return (
    <section id="pricing" className="py-24 px-6 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-muted mb-4">
            Simple pricing
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight mb-4">
            Start free. Scale as you grow.
          </h2>
          <p className="text-text-muted max-w-md mx-auto mb-8">
            No hidden fees. Cancel anytime. All plans include a 7-day free trial.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 p-1 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                !annual ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                annual ? 'bg-white/[0.08] text-text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              Annual
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                Save 35%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.highlight
                  ? 'border-accent/30 bg-accent/[0.04]'
                  : 'border-white/[0.07] bg-white/[0.02]'
              }`}
              style={plan.highlight ? { boxShadow: '0 0 0 1px rgba(124,106,247,0.15), 0 16px 40px rgba(124,106,247,0.08)' } : {}}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-accent text-white"
                    style={{ boxShadow: '0 0 16px rgba(124,106,247,0.4)' }}>
                    {plan.badge}
                  </span>
                </div>
              )}

              {/* Plan name */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-text-primary mb-1">{plan.name}</h3>
                <p className="text-xs text-text-muted leading-relaxed">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-text-primary tracking-tight">
                    ${annual ? plan.priceAnnual : plan.priceMonthly}
                  </span>
                  <span className="text-text-muted text-sm mb-1">{plan.period}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  {annual ? plan.annualNote : plan.monthlyNote}
                </p>
              </div>

              {/* CTA */}
              <Link
                to={plan.ctaHref}
                className={`w-full text-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 mb-6 ${
                  plan.highlight
                    ? 'bg-accent text-white hover:bg-accent-light'
                    : 'bg-white/[0.06] text-text-primary hover:bg-white/[0.10] border border-white/[0.08]'
                }`}
                style={plan.highlight ? { boxShadow: '0 0 16px rgba(124,106,247,0.25)' } : {}}
              >
                {plan.cta}
              </Link>

              {/* Features */}
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-text-muted">
                    <CheckIcon />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center text-xs text-text-muted mt-8"
        >
          All plans include a 7-day free trial. No credit card required to start.
          &nbsp;·&nbsp;
          <a href="mailto:hello@codedxp.com" className="text-accent hover:underline">Questions? Talk to us.</a>
        </motion.p>
      </div>
    </section>
  )
}
