import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GlowCard } from '@/components/ui/spotlight-card'

// ─── Testimonial data ─────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: 'Sarah Chen',
    handle: '@sarahbuilds',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    text: 'shipped my MVP in 4 hours using @codedxp. it wrote the entire react frontend, prisma schema, and auth flow. i just described what i wanted and approved the plan.',
    time: '2h ago',
    likes: 214,
    glowColor: 'purple' as const,
  },
  {
    name: 'Marcus Webb',
    handle: '@marcuswebb_dev',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    text: 'the build telemetry in codedxp is genuinely impressive. watching every file get generated in real time feels like pair programming with a very fast senior engineer.',
    time: '1d ago',
    likes: 87,
    glowColor: 'blue' as const,
  },
  {
    name: 'James Okafor',
    handle: '@jamesokafor',
    avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
    text: 'built a saas with stripe checkout, user auth, and a dashboard in one session. live preview meant i could iterate without any local setup. this is the future.',
    time: '5d ago',
    likes: 341,
    glowColor: 'green' as const,
  },
  {
    name: 'Lena Hoffmann',
    handle: '@lenahoffmann',
    avatar: 'https://randomuser.me/api/portraits/women/26.jpg',
    text: 'the browser agent is wild. it set up my oauth app on google cloud console autonomously. i just approved the plan and watched it happen. zero manual steps.',
    time: '1w ago',
    likes: 428,
    glowColor: 'orange' as const,
  },
  {
    name: 'Aisha Patel',
    handle: '@aishapatel_dev',
    avatar: 'https://randomuser.me/api/portraits/women/90.jpg',
    text: 'tried 4 other ai coding tools. codedxp is the only one that actually runs the code and shows you a live preview. everything else just gives you files.',
    time: '2w ago',
    likes: 512,
    glowColor: 'red' as const,
  },
  {
    name: 'Dev Kapoor',
    handle: '@devkapoor_io',
    avatar: 'https://randomuser.me/api/portraits/men/52.jpg',
    text: 'codedxp generated a full prisma schema, seeded the db, and wired up the api routes in one build. i just reviewed the plan and hit approve. insane productivity.',
    time: '3d ago',
    likes: 193,
    glowColor: 'purple' as const,
  },
  {
    name: 'Mia Torres',
    handle: '@mia_builds',
    avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
    text: 'non-technical founder here. i described my app idea in plain english and codedxp built a working prototype with auth and a dashboard. showed it to investors the same day.',
    time: '4d ago',
    likes: 677,
    glowColor: 'blue' as const,
  },
]

// ─── Marquee keyframe injected once ──────────────────────────
const MARQUEE_STYLE = `
@keyframes marquee-ltr {
  from { transform: translateX(-50%); }
  to   { transform: translateX(0%);   }
}
@keyframes marquee-rtl {
  from { transform: translateX(0%);   }
  to   { transform: translateX(-50%); }
}
.marquee-track {
  display: flex;
  width: max-content;
  animation: marquee-ltr 40s linear infinite;
}
.marquee-track:hover {
  animation-play-state: paused;
}
`

// ─── Single testimonial card ──────────────────────────────────
function TestimonialCard({ item }: { item: typeof TESTIMONIALS[0] }) {
  return (
    <GlowCard
      customSize
      glowColor={item.glowColor}
      width={320}
      className="flex-shrink-0 p-5 flex flex-col gap-0 cursor-default select-none"
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
      <p className="text-sm text-white/65 leading-relaxed mb-4 flex-1">{item.text}</p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xs text-white/25">{item.time}</span>
        <div className="flex items-center gap-1 text-white/30">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className="text-xs">{item.likes}</span>
        </div>
      </div>
    </GlowCard>
  )
}

// ─── Section ──────────────────────────────────────────────────
export function TestimonialsSection() {
  // Duplicate for seamless infinite loop
  const doubled = [...TESTIMONIALS, ...TESTIMONIALS]

  return (
    <section className="py-28 overflow-hidden" style={{ backgroundColor: '#000000' }}>
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_STYLE }} />

      {/* Header */}
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

      {/* Carousel — full-bleed, left-to-right infinite scroll */}
      <div className="relative w-full">
        {/* Left fade mask — narrower on mobile so cards aren't obscured */}
        <div
          className="absolute left-0 top-0 bottom-0 w-8 sm:w-20 md:w-32 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to right, #000000 0%, transparent 100%)' }}
        />
        {/* Right fade mask — narrower on mobile so cards aren't obscured */}
        <div
          className="absolute right-0 top-0 bottom-0 w-8 sm:w-20 md:w-32 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to left, #000000 0%, transparent 100%)' }}
        />

        {/* Scrolling track */}
        <div className="marquee-track gap-5 px-5">
          {doubled.map((item, i) => (
            <div key={`${item.handle}-${i}`} className="px-2">
              <TestimonialCard item={item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
