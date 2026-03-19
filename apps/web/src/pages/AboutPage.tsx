import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NavBar } from '@/components/landing/NavBar'
import { FooterSection } from '@/components/landing/FooterSection'

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  )
}

const TIMELINE = [
  {
    year: '2023',
    title: 'The idea',
    description: 'Frustrated by the gap between AI chat tools and actual deployable apps, we started building CodedXP — a platform that goes all the way from prompt to running preview.',
  },
  {
    year: '2024',
    title: 'First autonomous build',
    description: 'The first end-to-end autonomous build completed: a React + Prisma app generated, installed, and previewed without a single manual step. The core loop worked.',
  },
  {
    year: '2025',
    title: 'AI Builders layer',
    description: 'Launched the AI Builders intake system, browser agent, credential vault, and real-time telemetry. CodedXP became a full autonomous delivery platform.',
  },
]

const TECH_STACK = [
  { name: 'React + TypeScript', desc: 'Frontend' },
  { name: 'Node.js + Express', desc: 'Backend API' },
  { name: 'PostgreSQL + Prisma', desc: 'Database' },
  { name: 'Redis + BullMQ', desc: 'Job queue' },
  { name: 'Socket.IO', desc: 'Real-time events' },
  { name: 'Vite + Tailwind', desc: 'Build tooling' },
]

export default function AboutPage() {
  useEffect(() => {
    document.body.classList.add('landing-page')
    return () => document.body.classList.remove('landing-page')
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-base)' }}>
      <NavBar />

      <main className="pt-24 pb-0">
        {/* Hero */}
        <section className="relative py-20 px-6 overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(124,106,247,0.07) 0%, transparent 70%)',
            }}
          />
          <div className="relative z-10 max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-muted mb-6">
                About CodedXP
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold text-text-primary tracking-tight mb-5 leading-[1.1]">
                We're building the future<br />
                <span className="text-text-secondary">of software delivery</span>
              </h1>
              <p className="text-lg text-text-muted leading-relaxed max-w-xl mx-auto">
                CodedXP is an autonomous AI app builder that takes you from idea to live, running application — with real code, real infrastructure, and zero manual setup.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Mission */}
        <section className="py-16 px-6 border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55 }}
            >
              <h2 className="text-2xl font-bold text-text-primary mb-5">Our mission</h2>
              <div className="space-y-4 text-text-muted leading-relaxed">
                <p>
                  Software development has a delivery problem. Ideas are cheap. Execution is expensive. The gap between "I have an idea" and "here's a working app" is filled with boilerplate, configuration, environment setup, and hours of work that has nothing to do with the actual product.
                </p>
                <p>
                  CodedXP exists to close that gap. We believe that describing what you want to build should be enough — the platform should handle the rest. Not just code generation, but the full delivery loop: scaffolding, dependency installation, environment configuration, live preview, and iterative refinement.
                </p>
                <p>
                  We're not building a toy. We're building a serious autonomous delivery platform for developers who want to move fast without cutting corners.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Timeline */}
        <section className="py-16 px-6 border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55 }}
            >
              <h2 className="text-2xl font-bold text-text-primary mb-10">How we got here</h2>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[52px] top-0 bottom-0 w-px bg-white/[0.06]" />

                <div className="space-y-10">
                  {TIMELINE.map((item, i) => (
                    <motion.div
                      key={item.year}
                      initial={{ opacity: 0, x: -16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.45, delay: i * 0.1 }}
                      className="flex gap-6"
                    >
                      <div className="flex-shrink-0 w-[52px] flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center z-10">
                          <div className="w-2 h-2 rounded-full bg-accent" />
                        </div>
                        <span className="text-xs text-text-muted mt-1.5 font-mono">{item.year}</span>
                      </div>
                      <div className="pt-1 pb-2">
                        <h3 className="text-sm font-semibold text-text-primary mb-1.5">{item.title}</h3>
                        <p className="text-sm text-text-muted leading-relaxed">{item.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Tech stack */}
        <section className="py-16 px-6 border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55 }}
            >
              <h2 className="text-2xl font-bold text-text-primary mb-2">Built on solid foundations</h2>
              <p className="text-text-muted mb-8">
                CodedXP is built with the same stack it generates. We eat our own cooking.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TECH_STACK.map((t) => (
                  <div
                    key={t.name}
                    className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all"
                  >
                    <div className="text-sm font-medium text-text-primary mb-0.5">{t.name}</div>
                    <div className="text-xs text-text-muted">{t.desc}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Creator */}
        <section className="py-16 px-6 border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55 }}
            >
              <h2 className="text-2xl font-bold text-text-primary mb-8">The builder</h2>
              <div className="flex flex-col sm:flex-row gap-6 p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-xl font-bold text-accent">
                    JP
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-text-primary mb-1">Jan Paul Hart</h3>
                  <p className="text-sm text-text-muted mb-4 leading-relaxed">
                    Full-stack developer and builder. Creator of CodedXP and{' '}
                    <a
                      href="https://app.heftcoder.icu"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      HeftCoder IDE
                    </a>
                    {' '}— a browser-based development environment. Passionate about developer tooling, autonomous systems, and shipping things that actually work.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href="https://github.com/janpaul80"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-text-muted hover:text-text-primary hover:border-white/[0.14] transition-all text-sm"
                    >
                      <GitHubIcon />
                      github.com/janpaul80
                    </a>
                    <a
                      href="https://jphart.dev"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-text-muted hover:text-text-primary hover:border-white/[0.14] transition-all text-sm"
                    >
                      <ExternalLinkIcon />
                      jphart.dev
                    </a>
                    <a
                      href="https://app.heftcoder.icu"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-text-muted hover:text-text-primary hover:border-white/[0.14] transition-all text-sm"
                    >
                      <ExternalLinkIcon />
                      HeftCoder IDE
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 border-t border-white/[0.04]">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55 }}
            >
              <h2 className="text-3xl font-bold text-text-primary mb-4 tracking-tight">
                Ready to build something?
              </h2>
              <p className="text-text-muted mb-8">
                Start with a free trial. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  to="/auth?mode=register"
                  className="px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-light transition-all duration-200 text-sm"
                  style={{ boxShadow: '0 0 20px rgba(124,106,247,0.25)' }}
                >
                  Get started free
                </Link>
                <Link
                  to="/#features"
                  className="px-6 py-3 rounded-xl border border-white/[0.08] text-text-secondary hover:text-text-primary hover:border-white/[0.14] transition-all text-sm"
                >
                  See features
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  )
}
