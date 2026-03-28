import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

// ─── Showcase cards — real app types CoderXP can build ────────
const SHOWCASE_ITEMS = [
  {
    label: 'SaaS Dashboard',
    prompt: 'Build a SaaS analytics dashboard with user auth, metrics cards, and a data table',
    tags: ['React', 'TypeScript', 'Prisma'],
    accent: 'rgba(124,106,247,0.12)',
    border: 'rgba(124,106,247,0.2)',
    dot: '#7c6af7',
    preview: (
      <div className="space-y-2">
        <div className="flex gap-2">
          {['#7c6af7', '#3b82f6', '#10b981'].map((c, i) => (
            <div key={i} className="flex-1 rounded-lg p-3" style={{ background: `${c}18`, border: `1px solid ${c}30` }}>
              <div className="text-[10px] text-white/30 mb-1">Metric {i + 1}</div>
              <div className="text-sm font-bold text-white">{['12.4k', '98.2%', '$4.2k'][i]}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex justify-between mb-2">
            <div className="text-[10px] text-white/30">Recent Activity</div>
            <div className="text-[10px] text-white/20">View all</div>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2 py-1">
              <div className="w-5 h-5 rounded-full bg-white/5" />
              <div className="flex-1 h-1.5 rounded bg-white/5" />
              <div className="w-8 h-1.5 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Landing Page',
    prompt: 'Create a startup landing page with hero, features, pricing, and testimonials',
    tags: ['React', 'Tailwind', 'Framer Motion'],
    accent: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.2)',
    dot: '#3b82f6',
    preview: (
      <div className="space-y-2">
        <div className="rounded-lg p-4 text-center" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <div className="text-xs font-bold text-white mb-1">Ship faster.</div>
          <div className="text-[10px] text-white/40 mb-2">AI-powered development platform</div>
          <div className="flex gap-1.5 justify-center">
            <div className="px-2 py-0.5 rounded text-[9px] font-semibold text-white" style={{ background: 'rgba(59,130,246,0.5)' }}>Get Started</div>
            <div className="px-2 py-0.5 rounded text-[9px] text-white/50" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>Learn more</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-4 h-4 rounded mb-1.5" style={{ background: 'rgba(59,130,246,0.2)' }} />
              <div className="h-1 rounded bg-white/10 mb-1" />
              <div className="h-1 rounded bg-white/5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'E-Commerce Store',
    prompt: 'Build an e-commerce store with product listings, cart, and Stripe checkout',
    tags: ['React', 'Node.js', 'Stripe'],
    accent: 'rgba(16,185,129,0.12)',
    border: 'rgba(16,185,129,0.2)',
    dot: '#10b981',
    preview: (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="h-10" style={{ background: `rgba(16,185,129,${0.05 + i * 0.03})` }} />
              <div className="p-1.5">
                <div className="h-1 rounded bg-white/10 mb-1" />
                <div className="text-[9px] font-bold text-emerald-400">${(i * 12 + 19)}.99</div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-2 flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <div className="text-[9px] text-white/50">2 items · $67.98</div>
          <div className="px-2 py-0.5 rounded text-[9px] font-semibold text-white" style={{ background: 'rgba(16,185,129,0.5)' }}>Checkout</div>
        </div>
      </div>
    ),
  },
  {
    label: 'Full-Stack App',
    prompt: 'Build a project management tool with auth, boards, tasks, and team collaboration',
    tags: ['React', 'Express', 'PostgreSQL'],
    accent: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.2)',
    dot: '#f59e0b',
    preview: (
      <div className="space-y-2">
        <div className="flex gap-2">
          {['To Do', 'In Progress', 'Done'].map((col, i) => (
            <div key={col} className="flex-1">
              <div className="text-[9px] text-white/30 mb-1.5 font-medium">{col}</div>
              <div className="space-y-1">
                {Array.from({ length: i === 1 ? 2 : 1 }).map((_, j) => (
                  <div key={j} className="rounded p-1.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="h-1 rounded bg-white/10 mb-1" />
                    <div className="h-1 rounded bg-white/5 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-lg p-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-amber-500/30" />
            <div className="text-[9px] text-white/40">3 team members active</div>
          </div>
        </div>
      </div>
    ),
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
}

export function ShowcaseSection() {
  return (
    <section
      id="showcase"
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
            What you can build
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
            From idea to live app
            <br />
            <span className="text-white/30">in minutes, not months</span>
          </h2>
          <p className="text-white/40 max-w-lg mx-auto leading-relaxed">
            Describe what you want to build. CoderXP writes the code, runs the preview, and iterates with you — no setup required.
          </p>
        </motion.div>

        {/* Cards grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {SHOWCASE_ITEMS.map((item) => (
            <motion.div
              key={item.label}
              variants={cardVariants}
              className="group relative rounded-2xl p-5 cursor-default transition-all duration-300"
              style={{
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
              whileHover={{
                background: item.accent,
                borderColor: item.border,
                y: -3,
                transition: { duration: 0.2 },
              }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.dot, boxShadow: `0 0 8px ${item.dot}` }}
                  />
                  <span className="text-sm font-semibold text-white">{item.label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-full text-white/40"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Mini preview */}
              <div className="mb-4 rounded-xl p-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {item.preview}
              </div>

              {/* Prompt */}
              <p className="text-xs text-white/35 leading-relaxed font-mono">
                &ldquo;{item.prompt}&rdquo;
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-12"
        >
          <Link
            to="/auth?mode=register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02]"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            Start building for free
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
