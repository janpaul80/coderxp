import React, { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ElegantShape } from '../ui/shape-landing-hero'

// ─── Card 1: Intelligence Brief — shape background + original content ────────
function ShapeHeroPreview() {
  return (
    <div className="relative w-full h-full bg-[#030303] overflow-hidden">
      {/* Ambient gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-rose-500/[0.05] blur-2xl" />

      {/* Floating ellipse shapes — scaled for 220px card */}
      <ElegantShape
        delay={0.2}
        width={200}
        height={50}
        rotate={12}
        gradient="from-indigo-500/[0.18]"
        className="left-[-8%] top-[18%]"
      />
      <ElegantShape
        delay={0.4}
        width={160}
        height={40}
        rotate={-15}
        gradient="from-rose-500/[0.18]"
        className="right-[-4%] top-[62%]"
      />
      <ElegantShape
        delay={0.3}
        width={100}
        height={28}
        rotate={-8}
        gradient="from-violet-500/[0.18]"
        className="left-[8%] bottom-[8%]"
      />
      <ElegantShape
        delay={0.5}
        width={70}
        height={20}
        rotate={20}
        gradient="from-amber-500/[0.18]"
        className="right-[18%] top-[12%]"
      />
      <ElegantShape
        delay={0.6}
        width={50}
        height={14}
        rotate={-25}
        gradient="from-cyan-500/[0.18]"
        className="left-[22%] top-[8%]"
      />

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />

      {/* Original content overlay */}
      <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center text-center px-5 gap-2">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 text-[7px] text-white/70 font-medium">
          <span className="w-1 h-1 rounded-full bg-white/60" />
          Trusted by industry leaders
        </div>

        {/* Heading */}
        <h3 className="text-[15px] font-bold text-white leading-tight tracking-tight">
          Create{' '}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(to right, #fff, #aaa, #666)' }}
          >
            exceptional
          </span>
          <br />
          experiences
        </h3>

        {/* Subtitle */}
        <p className="text-[7px] text-white/50 max-w-[180px] leading-relaxed">
          Transform your ideas into reality with our cutting-edge platform.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center gap-2 mt-1">
          <div className="group relative overflow-hidden px-3 py-1 rounded-full bg-white text-black text-[7px] font-semibold">
            Start Creating →
          </div>
          <div className="px-3 py-1 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm text-white text-[7px] font-medium">
            Learn More
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-1">
          {[['1M+', 'Users'], ['50+', 'Countries'], ['24/7', 'Support']].map(([val, label]) => (
            <div key={label} className="text-center">
              <div className="text-[9px] font-bold text-white">{val}</div>
              <div className="text-[5.5px] text-white/40">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Card 2: Developer Portfolio Hero ────────────────────────
function DeveloperHeroPreview() {
  return (
    <div className="relative w-full h-full bg-[#080808] overflow-hidden flex flex-col items-center justify-center gap-3 p-5">
      {/* Orb */}
      <div
        className="w-10 h-10 rounded-full mb-1"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #d1d5db, #6b7280 50%, #374151)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}
      />
      <div className="text-center">
        <h3 className="text-[15px] font-bold text-white mb-1">Full Stack Developer</h3>
        <p className="text-[8px] text-white/40 leading-relaxed max-w-[180px] text-center">
          Crafting beautiful, performant web applications with modern technologies.
          Passionate about clean code and exceptional user experiences.
        </p>
      </div>
      {/* Buttons */}
      <div className="flex items-center gap-2 mt-1">
        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 border border-white/15">
          <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
          <span className="text-[7px] text-white/70 font-medium">Get in Touch</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-1 rounded-full border border-white/15">
          <span className="text-[7px] text-white/50">View Projects →</span>
        </div>
      </div>
      {/* Social icons row */}
      <div className="flex items-center gap-3 mt-1">
        {['⬡', '⬡', '⬡'].map((_, i) => (
          <div key={i} className="w-4 h-4 rounded-full border border-white/15 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-sm bg-white/30" />
          </div>
        ))}
      </div>
      {/* Down arrow */}
      <div className="text-white/20 text-[10px] mt-1">↓</div>
    </div>
  )
}

// ─── Card 3: Animated Marquee Hero (colorful) ────────────────
const MARQUEE_IMAGES = [
  'https://images.unsplash.com/photo-1756312148347-611b60723c7a?w=400&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1757865579201-693dd2080c73?w=400&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1756786605218-28f7dd95a493?w=400&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1757519740947-eef07a74c4ab?w=400&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1757263005786-43d955f07fb1?w=400&auto=format&fit=crop&q=60',
  'https://images.unsplash.com/photo-1757207445614-d1e12b8f753e?w=400&auto=format&fit=crop&q=60',
]

function MarqueeHeroPreview() {
  const duplicated = [...MARQUEE_IMAGES, ...MARQUEE_IMAGES]
  return (
    <div className="relative w-full h-full bg-[#080808] overflow-hidden flex flex-col items-center justify-center text-center px-4">
      {/* Text content */}
      <div className="relative z-10 flex flex-col items-center gap-1.5 pb-10">
        <span className="px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-[7px] text-white/40 font-medium">
          Join over 100,000 happy creators
        </span>
        <h3 className="text-[14px] font-bold text-white leading-tight mt-1">
          Engage Audiences<br />
          <span className="text-white/80">with Stunning Videos</span>
        </h3>
        <p className="text-[7px] text-white/35 max-w-[180px] leading-relaxed">
          Boost your brand with high-impact short videos from expert creators.
        </p>
        {/* Red CTA button */}
        <div className="mt-2 px-4 py-1.5 rounded-full bg-red-500 text-white text-[8px] font-semibold shadow-[0_0_16px_rgba(239,68,68,0.4)]">
          Get Started
        </div>
      </div>

      {/* Scrolling image marquee at bottom */}
      <div
        className="absolute bottom-0 left-0 w-full h-[80px] overflow-hidden"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent, black 30%, black 80%, transparent)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%, black 80%, transparent)',
        }}
      >
        <motion.div
          className="flex gap-2 h-full"
          animate={{ x: ['-50%', '0%'] }}
          transition={{ ease: 'linear', duration: 18, repeat: Infinity }}
        >
          {duplicated.map((src, i) => (
            <div
              key={i}
              className="flex-shrink-0 h-full aspect-[3/4]"
              style={{ transform: `rotate(${i % 2 === 0 ? -2 : 3}deg)` }}
            >
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover rounded-lg"
                loading="lazy"
              />
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

// ─── Card 4: Network / Particle Hero ─────────────────────────
function NetworkHeroPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height

    // Generate nodes
    const nodes = Array.from({ length: 40 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }))

    let animId: number
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, W, H)

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 60) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(255,255,255,${0.15 * (1 - dist / 60)})`
            ctx.lineWidth = 0.5
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      nodes.forEach((n) => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.fill()

        n.x += n.vx
        n.y += n.vy
        if (n.x < 0 || n.x > W) n.vx *= -1
        if (n.y < 0 || n.y > H) n.vy *= -1
      })

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden">
      <canvas ref={canvasRef} width={320} height={220} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 flex flex-col items-end justify-end p-5">
        <div className="text-right">
          <div className="text-[7px] text-white/30 tracking-widest uppercase mb-1 font-mono">Global Network</div>
          <h3 className="text-[18px] font-bold text-white leading-tight">
            Connect<br />
            <span className="text-white/80">the World</span>
          </h3>
          <p className="text-[7px] text-white/35 mt-1 max-w-[140px] text-right leading-relaxed">
            Monitor solutions, high-performance and real-time global connectivity with unprecedented reliability.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Preview Card wrapper ─────────────────────────────────────
interface PreviewCardProps {
  label: string
  saves?: number
  children: React.ReactNode
  delay?: number
}

function PreviewCard({ label, saves = 0, children, delay = 0 }: PreviewCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay }}
      className="group relative rounded-xl overflow-hidden cursor-pointer"
      style={{
        border: '1px solid rgba(255,255,255,0.07)',
        background: '#0a0a0a',
      }}
    >
      {/* Preview area */}
      <div className="relative h-[220px] overflow-hidden">
        {children}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold shadow-lg">
            Try this style
          </div>
        </div>
      </div>

      {/* Card footer */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-white/10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-sm bg-white/50" />
          </div>
          <span className="text-xs text-white/60 font-medium">{label}</span>
        </div>
        {saves > 0 && (
          <div className="flex items-center gap-1 text-white/30">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-[10px]">{saves}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Main Section ─────────────────────────────────────────────
interface HeroShowcaseSectionProps {
  onCtaClick?: () => void
}

export function HeroShowcaseSection({ onCtaClick }: HeroShowcaseSectionProps) {
  const navigate = useNavigate()
  const handleCta = onCtaClick ?? (() => navigate('/auth?mode=register'))

  return (
    <section className="relative bg-black py-24 px-6 overflow-hidden">
      {/* Subtle top glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 30% at 50% 0%, rgba(124,106,247,0.07) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="text-center mb-14"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border border-white/[0.10] bg-white/[0.04] text-white/50 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            One prompt. Premium results.
          </span>
          <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            What CoderXP builds for you
          </h2>
          <p className="text-white/40 text-base max-w-lg mx-auto leading-relaxed">
            Describe your idea in plain English. CoderXP generates production-ready apps with premium designs like these — instantly.
          </p>
        </motion.div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <PreviewCard label="Intelligence Brief" saves={51} delay={0}>
            <ShapeHeroPreview />
          </PreviewCard>

          <PreviewCard label="Developer Portfolio" saves={38} delay={0.08}>
            <DeveloperHeroPreview />
          </PreviewCard>

          <PreviewCard label="Creator Platform" saves={44} delay={0.16}>
            <MarqueeHeroPreview />
          </PreviewCard>

          <PreviewCard label="Network Platform" saves={29} delay={0.24}>
            <NetworkHeroPreview />
          </PreviewCard>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center"
        >
          <button
            onClick={handleCta}
            className="group px-8 py-3.5 rounded-full text-sm font-semibold text-black bg-white hover:bg-white/90 transition-all duration-200 shadow-[0_0_24px_rgba(255,255,255,0.12)]"
          >
            Build yours now
            <span className="ml-2 inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
          <p className="mt-3 text-xs text-white/25">No credit card required · Free to start</p>
        </motion.div>
      </div>
    </section>
  )
}
