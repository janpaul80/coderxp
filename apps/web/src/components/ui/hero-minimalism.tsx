import React, { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
}

interface HeroMinimalismProps {
  title?: string
  subtitle?: string
  ctaLabel?: string
  onCtaClick?: () => void
  className?: string
}

export function HeroMinimalism({
  title = 'Build with AI.',
  subtitle = 'Turn your idea into a fully working app — real code, live preview, zero setup.',
  ctaLabel = 'Start building',
  onCtaClick,
  className,
}: HeroMinimalismProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const count = 60
    particlesRef.current = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const pts = particlesRef.current

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x
          const dy = pts[i].y - pts[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 100) {
            ctx.beginPath()
            ctx.strokeStyle = `rgba(255,255,255,${0.04 * (1 - dist / 100)})`
            ctx.lineWidth = 0.5
            ctx.moveTo(pts[i].x, pts[i].y)
            ctx.lineTo(pts[j].x, pts[j].y)
            ctx.stroke()
          }
        }
      }

      pts.forEach((p) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`
        ctx.fill()
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1
      })

      animRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <section
      className={cn(
        'relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black',
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Accent lines */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute left-0 right-0 h-px"
          style={{
            top: '38%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 70%, transparent 100%)',
          }}
        />
        <div
          className="absolute left-0 right-0 h-px"
          style={{
            top: '62%',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 70%, transparent 100%)',
          }}
        />
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: '20%',
            background:
              'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.05) 60%, transparent 100%)',
          }}
        />
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{
            right: '20%',
            background:
              'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.05) 60%, transparent 100%)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <span className="inline-flex items-center gap-2 text-xs font-mono tracking-[0.2em] uppercase text-white/30">
            <span className="w-8 h-px bg-white/20" />
            AI App Builder
            <span className="w-8 h-px bg-white/20" />
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-6xl sm:text-7xl md:text-8xl font-bold text-white tracking-tight leading-[0.95] mb-8"
        >
          {title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2 }}
          className="text-base sm:text-lg text-white/40 max-w-xl mx-auto leading-relaxed mb-12"
        >
          {subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center justify-center gap-4"
        >
          <button
            onClick={onCtaClick}
            className="group px-8 py-3.5 rounded-full text-sm font-semibold text-black bg-white hover:bg-white/90 transition-all duration-200"
          >
            {ctaLabel}
            <span className="ml-2 inline-block transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </button>
          <button
            onClick={onCtaClick}
            className="px-8 py-3.5 rounded-full text-sm font-medium text-white/50 border border-white/[0.12] hover:border-white/[0.25] hover:text-white/80 transition-all duration-200"
          >
            See demo
          </button>
        </motion.div>
      </div>
    </section>
  )
}
