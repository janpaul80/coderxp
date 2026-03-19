import React, { useState } from 'react'
import { motion } from 'framer-motion'

// ─── Testimonial data ─────────────────────────────────────────
// Avatars use randomuser.me — real human photos, no sign-up needed.
const TESTIMONIALS = [
  {
    name: 'Sarah Chen',
    handle: '@sarahbuilds',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    text: 'shipped my MVP in 4 hours using @codedxp. it wrote the entire react frontend, prisma schema, and auth flow. i just described what i wanted and approved the plan.',
    time: '2h ago',
    likes: 214,
  },
  {
    name: 'Marcus Webb',
    handle: '@marcuswebb_dev',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    text: 'the build telemetry in codedxp is genuinely impressive. watching every file get generated in real time feels like pair programming with a very fast senior engineer.',
    time: '1d ago',
    likes: 87,
  },
  {
    name: 'James Okafor',
    handle: '@jamesokafor',
    avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
    text: 'built a saas with stripe checkout, user auth, and a dashboard in one session. live preview meant i could iterate without any local setup. this is the future.',
    time: '5d ago',
    likes: 341,
  },
  {
    name: 'Lena Hoffmann',
    handle: '@lenahoffmann',
    avatar: 'https://randomuser.me/api/portraits/women/26.jpg',
    text: 'the browser agent is wild. it set up my oauth app on google cloud console autonomously. i just approved the plan and watched it happen. zero manual steps.',
    time: '1w ago',
    likes: 428,
  },
  {
    name: 'Aisha Patel',
    handle: '@aishapatel_dev',
    avatar: 'https://randomuser.me/api/portraits/women/90.jpg',
    text: 'tried 4 other ai coding tools. codedxp is the only one that actually runs the code and shows you a live preview. everything else just gives you files.',
    time: '2w ago',
    likes: 512,
  },
]

// ─── Card hover colors ────────────────────────────────────────
const HOVER_COLORS = [
  'rgba(124,106,247,0.08)',  // purple
  'rgba(59,130,246,0.08)',   // blue
  'rgba(16,185,129,0.08)',   // emerald
  'rgba(245,158,11,0.08)',   // amber
  'rgba(239,68,68,0.08)',    // red
]

function TestimonialCard({ item, index }: { item: typeof TESTIMONIALS[0]; index: number }) {
  const [hovered, setHovered] = useState(false)
  const hoverColor = HOVER_COLORS[index % HOVER_COLORS.length]

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative p-5 rounded-2xl cursor-default select-none transition-all duration-300"
      style={{
        background: hovered ? hoverColor : 'rgba(255,255,255,0.03)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.07)'}`,
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <img
            src={item.avatar}
            alt={item.name}
            className="w-9 h-9 rounded-full object-cover ring-1 ring-white/10"
            loading="lazy"
          />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{item.name}</p>
            <p className="text-xs text-white/40 leading-tight">{item.handle}</p>
          </div>
        </div>
        {/* X / Twitter icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-white/20 flex-shrink-0">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>

      {/* Text */}
      <p className="text-sm text-white/65 leading-relaxed mb-4">{item.text}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/25">{item.time}</span>
        <div className="flex items-center gap-1 text-white/30">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className="text-xs">{item.likes}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Section ──────────────────────────────────────────────────
export function TestimonialsSection() {
  return (
    <section
      className="py-28"
      style={{ backgroundColor: '#000000' }}
    >
      <div className="max-w-6xl mx-auto px-6 mb-14">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="text-center"
        >
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-white/40 mb-5">
            What developers say
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
            Loved by builders
          </h2>
          <p className="text-white/40 max-w-md mx-auto leading-relaxed">
            Thousands of developers ship faster with CodedXP every day.
          </p>
        </motion.div>
      </div>

      {/* 5 cards — top row of 3, bottom row of 2 centered */}
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {TESTIMONIALS.slice(0, 3).map((item, i) => (
            <TestimonialCard key={item.handle} item={item} index={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {TESTIMONIALS.slice(3, 5).map((item, i) => (
            <TestimonialCard key={item.handle} item={item} index={i + 3} />
          ))}
        </div>
      </div>
    </section>
  )
}
