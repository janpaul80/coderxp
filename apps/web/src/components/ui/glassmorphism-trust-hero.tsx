import React, { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, Star, Clock, Users, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Stat {
  icon: React.ReactNode
  value: string
  label: string
}

interface MarqueeItem {
  name: string
}

interface GlassmorphismTrustHeroProps {
  title?: string
  subtitle?: string
  ctaLabel?: string
  onCtaClick?: () => void
  stats?: Stat[]
  marqueeItems?: MarqueeItem[]
  className?: string
}

const DEFAULT_STATS: Stat[] = [
  { icon: <Zap className="w-4 h-4" />, value: '500+', label: 'Apps built' },
  { icon: <Star className="w-4 h-4" />, value: '4.9/5', label: 'Avg rating' },
  { icon: <Clock className="w-4 h-4" />, value: '<5 min', label: 'Build time' },
  { icon: <Users className="w-4 h-4" />, value: '2,400+', label: 'Developers' },
  { icon: <Shield className="w-4 h-4" />, value: '99.9%', label: 'Uptime' },
  { icon: <CheckCircle className="w-4 h-4" />, value: '100%', label: 'Real code' },
]

const DEFAULT_MARQUEE: MarqueeItem[] = [
  { name: 'React' },
  { name: 'TypeScript' },
  { name: 'Node.js' },
  { name: 'PostgreSQL' },
  { name: 'Tailwind CSS' },
  { name: 'Prisma' },
  { name: 'Redis' },
  { name: 'Docker' },
  { name: 'Stripe' },
  { name: 'Auth.js' },
  { name: 'Vite' },
  { name: 'Socket.io' },
]

function MarqueeTrack({ items }: { items: MarqueeItem[] }) {
  const doubled = [...items, ...items]
  return (
    <div className="relative overflow-hidden w-full">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, #000 0%, transparent 100%)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(270deg, #000 0%, transparent 100%)' }} />

      <motion.div
        className="flex gap-6 w-max"
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
      >
        {doubled.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.08] bg-white/[0.03] text-white/40 text-xs font-medium whitespace-nowrap"
          >
            <span className="w-1 h-1 rounded-full bg-white/30" />
            {item.name}
          </div>
        ))}
      </motion.div>
    </div>
  )
}

export function GlassmorphismTrustHero({
  title = 'The AI that builds real apps',
  subtitle = 'Not prototypes. Not mockups. Production-ready full-stack applications with real code you own.',
  ctaLabel = 'Start building free',
  onCtaClick,
  stats = DEFAULT_STATS,
  marqueeItems = DEFAULT_MARQUEE,
  className,
}: GlassmorphismTrustHeroProps) {
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = glowRef.current
    if (!el) return
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      el.style.setProperty('--gx', `${x}%`)
      el.style.setProperty('--gy', `${y}%`)
    }
    el.addEventListener('mousemove', handleMove)
    return () => el.removeEventListener('mousemove', handleMove)
  }, [])

  return (
    <section
      ref={glowRef}
      className={cn(
        'relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black px-6 py-24',
        className
      )}
      style={
        {
          '--gx': '50%',
          '--gy': '50%',
        } as React.CSSProperties
      }
    >
      {/* Mouse-follow glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background:
            'radial-gradient(600px circle at var(--gx) var(--gy), rgba(124,106,247,0.08) 0%, transparent 70%)',
        }}
      />

      {/* Static top glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(124,106,247,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium border border-white/[0.10] bg-white/[0.04] text-white/60 backdrop-blur-sm">
            <Shield className="w-3 h-3 text-emerald-400" />
            Trusted by 2,400+ developers worldwide
          </span>
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-6"
        >
          {title}
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="text-base sm:text-lg text-white/45 max-w-xl mb-12 leading-relaxed"
        >
          {subtitle}
        </motion.p>

        {/* Glassmorphism stats card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.24 }}
          className="w-full max-w-2xl mb-12"
        >
          <div
            className="rounded-2xl p-6 grid grid-cols-3 gap-4"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {stats.map((stat, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 py-2">
                <div className="text-white/30">{stat.icon}</div>
                <div className="text-2xl font-bold text-white tracking-tight">{stat.value}</div>
                <div className="text-xs text-white/35 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mb-16"
        >
          <button
            onClick={onCtaClick}
            className="group px-8 py-3.5 rounded-full text-sm font-semibold text-black bg-white hover:bg-white/90 transition-all duration-200 shadow-[0_0_24px_rgba(255,255,255,0.15)]"
          >
            {ctaLabel}
            <span className="ml-2 inline-block transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </button>
        </motion.div>

        {/* Tech stack marquee */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="w-full"
        >
          <p className="text-xs text-white/20 tracking-widest uppercase font-medium mb-4 text-center">
            Generates code using
          </p>
          <MarqueeTrack items={marqueeItems} />
        </motion.div>
      </div>
    </section>
  )
}
