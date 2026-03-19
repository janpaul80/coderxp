
import React from 'react'
import { motion } from 'framer-motion'

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="m13 2-2 2.5h3L12 7" />
        <path d="M10 14v-3" />
        <path d="M14 14v-3" />
        <path d="M11 19H6.5a3.5 3.5 0 0 1 0-7H17a3 3 0 0 0 0-6h-2" />
      </svg>
    ),
    title: 'AI-Powered Code Generation',
    description: 'Describe your app in plain English. Our AI writes production-quality React, TypeScript, and Node.js code — not boilerplate.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
    ),
    title: 'Live Preview Sandbox',
    description: 'Every build spins up a real preview environment. See your app running in seconds — no local setup, no Docker, no config.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: 'Secure Credential Vault',
    description: 'API keys and secrets are encrypted at rest and injected at build time. They never appear in generated code or logs.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
      </svg>
    ),
    title: 'Autonomous Browser Agent',
    description: 'Need OAuth setup or third-party config? Our browser agent handles it autonomously — you just approve the plan.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: 'Real-Time Build Telemetry',
    description: 'Watch every step of the build live — file generation, npm install, server start. Full transparency, zero black boxes.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: 'Iterative Chat Refinement',
    description: 'Not quite right? Chat with your app. Request changes, add features, or pivot direction — the AI updates the code in place.',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

export function FeaturesSection() {
  return (
    <section
      id="features"
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
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-white/40 mb-5">
            Everything you need
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
            Built for serious developers
          </h2>
          <p className="text-white/40 max-w-lg mx-auto leading-relaxed">
            CodedXP isn't a toy. It's a full autonomous delivery platform that writes, runs, and iterates on real production code.
          </p>
        </motion.div>

        {/* Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              className="group relative p-6 rounded-2xl transition-all duration-300 cursor-default"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
              whileHover={{
                background: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.11)',
                y: -2,
                transition: { duration: 0.2 },
              }}
            >
              <h3 className="text-sm font-semibold text-white/85 mb-2 leading-snug">
                {feature.title}
              </h3>
              <p className="text-sm text-white/40 leading-relaxed">
                {feature.description}
              </p>

              {/* Subtle hover glow */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 0%, rgba(124,106,247,0.05) 0%, transparent 70%)' }}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
