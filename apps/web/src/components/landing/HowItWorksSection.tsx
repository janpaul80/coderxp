import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

const STEPS = [
  {
    number: '01',
    title: 'Describe your app',
    description: 'Type what you want to build in plain English. Be as specific or as vague as you like — CoderXP asks clarifying questions when it needs to.',
    detail: 'No technical knowledge required. Just describe the problem you want to solve.',
    accent: '#7c6af7',
    accentBg: 'rgba(124,106,247,0.08)',
    accentBorder: 'rgba(124,106,247,0.18)',
    visual: (
      <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-white/20" />
          <div className="text-[10px] text-white/30 font-mono">CoderXP Chat</div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-xl rounded-tr-sm px-3 py-2 text-[11px] text-white/80" style={{ background: 'rgba(124,106,247,0.25)', border: '1px solid rgba(124,106,247,0.3)' }}>
              Build me a SaaS dashboard with user auth, metrics, and a billing page
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-xl rounded-tl-sm px-3 py-2 text-[11px] text-white/60" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              Got it. I'll build a React + Node.js SaaS with JWT auth, a metrics dashboard, and Stripe billing. Approve the plan?
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-xl rounded-tr-sm px-3 py-2 text-[11px] text-white/80" style={{ background: 'rgba(124,106,247,0.25)', border: '1px solid rgba(124,106,247,0.3)' }}>
              Yes, build it
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: '02',
    title: 'Approve the plan',
    description: 'CoderXP generates a structured build plan — tech stack, pages, API routes, database schema. Review it, tweak it, then approve.',
    detail: 'Full transparency before a single line of code is written.',
    accent: '#3b82f6',
    accentBg: 'rgba(59,130,246,0.08)',
    accentBorder: 'rgba(59,130,246,0.18)',
    visual: (
      <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-blue-400/60" />
          <div className="text-[10px] text-white/30 font-mono">Build Plan</div>
        </div>
        <div className="space-y-1.5">
          {[
            { label: 'Frontend', value: 'React + TypeScript + Tailwind', color: '#3b82f6' },
            { label: 'Backend', value: 'Node.js + Express + Prisma', color: '#3b82f6' },
            { label: 'Auth', value: 'JWT + bcrypt', color: '#3b82f6' },
            { label: 'Pages', value: 'Home, Dashboard, Billing, Settings', color: '#3b82f6' },
            { label: 'Database', value: 'PostgreSQL — User, Subscription', color: '#3b82f6' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <span className="text-[10px] text-white/30">{row.label}</span>
              <span className="text-[10px] font-medium" style={{ color: `${row.color}cc` }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex-1 py-1.5 rounded-lg text-center text-[10px] font-semibold text-white" style={{ background: 'rgba(59,130,246,0.4)' }}>
            Approve &amp; Build
          </div>
          <div className="px-3 py-1.5 rounded-lg text-center text-[10px] text-white/40" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            Edit
          </div>
        </div>
      </div>
    ),
  },
  {
    number: '03',
    title: 'Watch it build live',
    description: 'CoderXP generates every file, runs npm install, starts the server, and opens a live preview — all in real time. No local setup needed.',
    detail: 'Full build telemetry. Every step visible. Zero black boxes.',
    accent: '#10b981',
    accentBg: 'rgba(16,185,129,0.08)',
    accentBorder: 'rgba(16,185,129,0.18)',
    visual: (
      <div className="rounded-xl p-4" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-emerald-400/60 animate-pulse" />
          <div className="text-[10px] text-white/30 font-mono">Build Progress</div>
        </div>
        <div className="space-y-1.5">
          {[
            { step: 'Generating files', status: 'done', count: '14 files' },
            { step: 'npm install', status: 'done', count: '312 packages' },
            { step: 'Prisma migrate', status: 'done', count: '3 models' },
            { step: 'Starting server', status: 'done', count: 'port 3001' },
            { step: 'Preview ready', status: 'active', count: 'Live ✓' },
          ].map(row => (
            <div key={row.step} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                  style={{ background: row.status === 'active' ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.06)' }}
                >
                  {row.status === 'done' && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {row.status === 'active' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </div>
                <span className="text-[10px] text-white/50">{row.step}</span>
              </div>
              <span className="text-[10px]" style={{ color: row.status === 'active' ? '#10b981' : 'rgba(255,255,255,0.2)' }}>
                {row.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
]

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-28 px-6"
      style={{ backgroundColor: '#000000' }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="text-center mb-20"
        >
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-white/40 mb-5">
            How it works
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
            Three steps to a
            <br />
            <span className="text-white/30">production-ready app</span>
          </h2>
          <p className="text-white/40 max-w-md mx-auto leading-relaxed">
            No environment setup. No boilerplate. No waiting. Just describe, approve, and ship.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="space-y-6">
          {STEPS.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, delay: index * 0.08 }}
              className="group relative rounded-2xl p-6 md:p-8 transition-all duration-300"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
              whileHover={{
                background: step.accentBg,
                borderColor: step.accentBorder,
                transition: { duration: 0.25 },
              }}
            >
              <div className="flex flex-col md:flex-row gap-8 items-start">
                {/* Left: step info */}
                <div className="flex-1 min-w-0">
                  {/* Step number */}
                  <div
                    className="text-6xl font-black mb-4 leading-none select-none"
                    style={{ color: `${step.accent}20` }}
                  >
                    {step.number}
                  </div>

                  <h3 className="text-xl md:text-2xl font-bold text-white mb-3 tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-white/50 leading-relaxed mb-3">
                    {step.description}
                  </p>
                  <p className="text-sm font-medium" style={{ color: `${step.accent}99` }}>
                    {step.detail}
                  </p>
                </div>

                {/* Right: visual */}
                <div className="w-full md:w-80 flex-shrink-0">
                  {step.visual}
                </div>
              </div>

              {/* Connector line (not on last step) */}
              {index < STEPS.length - 1 && (
                <div
                  className="absolute left-8 md:left-12 -bottom-3 w-px h-6"
                  style={{ background: `linear-gradient(to bottom, ${step.accent}30, transparent)` }}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-center mt-14"
        >
          <Link
            to="/auth?mode=register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            Try it now — it's free
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
