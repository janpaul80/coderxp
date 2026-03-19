/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * HoleBackground — animate-ui exact implementation (defensive port).
 * Source: https://animate-ui.com/docs/components/backgrounds/hole
 *
 * Uses framer-motion (already in project) instead of motion/react.
 * Pure canvas tunnel/wormhole — no colors, no gradients, no overlays.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────

type Disc = { p: number; x: number; y: number; w: number; h: number }
type Point = { x: number; y: number }
type Particle = {
  x: number; sx: number; dx: number
  y: number; vy: number; p: number
  r: number; c: string
}
type ClipState = { disc?: Disc; i?: number; path?: Path2D }

interface State {
  discs: Disc[]
  lines: Point[][]
  particles: Particle[]
  clip: ClipState
  startDisc: Disc
  endDisc: Disc
  rect: { width: number; height: number }
  render: { width: number; height: number; dpi: number }
  particleArea: { sx: number; sw: number; ex: number; ew: number; h: number }
  linesCanvas: HTMLCanvasElement | null
  ready: boolean
}

export type HoleBackgroundProps = React.ComponentProps<'div'> & {
  strokeColor?: string
  numberOfLines?: number
  numberOfDiscs?: number
  particleRGBColor?: [number, number, number]
}

// ─── Easing ───────────────────────────────────────────────────

const easeInExpo = (p: number) => (p === 0 ? 0 : Math.pow(2, 10 * (p - 1)))

function tweenValue(
  start: number,
  end: number,
  p: number,
  ease?: 'inExpo',
): number {
  const delta = end - start
  return start + delta * (ease === 'inExpo' ? easeInExpo(p) : p)
}

// ─── Component ────────────────────────────────────────────────

export function HoleBackground({
  strokeColor = '#737373',
  numberOfLines = 50,
  numberOfDiscs = 50,
  particleRGBColor = [255, 255, 255],
  className,
  children,
  ...props
}: HoleBackgroundProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const rafRef = React.useRef<number>(0)
  const stateRef = React.useRef<State>({
    discs: [],
    lines: [],
    particles: [],
    clip: {},
    startDisc: { p: 0, x: 0, y: 0, w: 0, h: 0 },
    endDisc: { p: 1, x: 0, y: 0, w: 0, h: 0 },
    rect: { width: 0, height: 0 },
    render: { width: 0, height: 0, dpi: 1 },
    particleArea: { sx: 0, sw: 0, ex: 0, ew: 0, h: 0 },
    linesCanvas: null,
    ready: false,
  })

  // ── Helpers ─────────────────────────────────────────────────

  const tweenDisc = React.useCallback((disc: Disc) => {
    const { startDisc, endDisc } = stateRef.current
    disc.x = tweenValue(startDisc.x, endDisc.x, disc.p)
    disc.y = tweenValue(startDisc.y, endDisc.y, disc.p, 'inExpo')
    disc.w = tweenValue(startDisc.w, endDisc.w, disc.p)
    disc.h = tweenValue(startDisc.h, endDisc.h, disc.p)
  }, [])

  // ── setSize ─────────────────────────────────────────────────

  const setSize = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return false
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return false
    const dpi = window.devicePixelRatio || 1
    stateRef.current.rect = { width: rect.width, height: rect.height }
    stateRef.current.render = { width: rect.width, height: rect.height, dpi }
    canvas.width = rect.width * dpi
    canvas.height = rect.height * dpi
    return true
  }, [])

  // ── setDiscs ─────────────────────────────────────────────────

  const setDiscs = React.useCallback(() => {
    const { width, height } = stateRef.current.rect
    stateRef.current.discs = []
    stateRef.current.startDisc = {
      p: 0,
      x: width * 0.5,
      y: height * 0.45,
      w: width * 0.75,
      h: height * 0.7,
    }
    stateRef.current.endDisc = {
      p: 1,
      x: width * 0.5,
      y: height * 0.95,
      w: 0,
      h: 0,
    }

    let prevBottom = height
    stateRef.current.clip = {}

    for (let i = 0; i < numberOfDiscs; i++) {
      const p = i / numberOfDiscs
      const disc: Disc = { p, x: 0, y: 0, w: 0, h: 0 }
      tweenDisc(disc)
      const bottom = disc.y + disc.h
      if (bottom <= prevBottom) {
        stateRef.current.clip = { disc: { ...disc }, i }
      }
      prevBottom = bottom
      stateRef.current.discs.push(disc)
    }

    // Fallback: if no clip disc was found, use the last disc
    if (!stateRef.current.clip.disc && stateRef.current.discs.length > 0) {
      const last = stateRef.current.discs[stateRef.current.discs.length - 1]
      stateRef.current.clip = { disc: { ...last }, i: numberOfDiscs - 1 }
    }

    const clipDisc = stateRef.current.clip.disc!
    const clipPath = new Path2D()
    const rw = Math.max(0.001, clipDisc.w)
    const rh = Math.max(0.001, clipDisc.h)
    clipPath.ellipse(clipDisc.x, clipDisc.y, rw, rh, 0, 0, Math.PI * 2)
    clipPath.rect(clipDisc.x - rw, 0, rw * 2, clipDisc.y)
    stateRef.current.clip.path = clipPath
  }, [numberOfDiscs, tweenDisc])

  // ── setLines ─────────────────────────────────────────────────

  const setLines = React.useCallback(() => {
    const { width, height } = stateRef.current.rect
    if (!stateRef.current.clip.path || !stateRef.current.clip.disc) return

    stateRef.current.lines = Array.from({ length: numberOfLines }, () => [])
    const linesAngle = (Math.PI * 2) / numberOfLines

    stateRef.current.discs.forEach((disc) => {
      for (let i = 0; i < numberOfLines; i++) {
        const angle = i * linesAngle
        stateRef.current.lines[i].push({
          x: disc.x + Math.cos(angle) * disc.w,
          y: disc.y + Math.sin(angle) * disc.h,
        })
      }
    })

    const offCanvas = document.createElement('canvas')
    offCanvas.width = width
    offCanvas.height = height
    const ctx = offCanvas.getContext('2d')
    if (!ctx) return

    const clipPath = stateRef.current.clip.path

    stateRef.current.lines.forEach((line) => {
      ctx.save()
      let lineIsIn = false
      line.forEach((p1, j) => {
        if (j === 0) return
        const p0 = line[j - 1]
        if (
          !lineIsIn &&
          (ctx.isPointInPath(clipPath, p1.x, p1.y) ||
            ctx.isPointInStroke(clipPath, p1.x, p1.y))
        ) {
          lineIsIn = true
        } else if (lineIsIn) {
          ctx.clip(clipPath)
        }
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.strokeStyle = strokeColor
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.closePath()
      })
      ctx.restore()
    })

    stateRef.current.linesCanvas = offCanvas
  }, [numberOfLines, strokeColor])

  // ── setParticles ─────────────────────────────────────────────

  const makeParticle = React.useCallback(
    (start = false): Particle => {
      const { particleArea } = stateRef.current
      const sx = particleArea.sx + particleArea.sw * Math.random()
      const ex = particleArea.ex + particleArea.ew * Math.random()
      const dx = ex - sx
      const y = start ? particleArea.h * Math.random() : particleArea.h
      const r = 0.5 + Math.random() * 4
      const vy = 0.5 + Math.random()
      return {
        x: sx, sx, dx,
        y, vy, p: 0, r,
        c: `rgba(${particleRGBColor[0]},${particleRGBColor[1]},${particleRGBColor[2]},${Math.random()})`,
      }
    },
    [particleRGBColor],
  )

  const setParticles = React.useCallback(() => {
    if (!stateRef.current.clip.disc) return
    const { width, height } = stateRef.current.rect
    const disc = stateRef.current.clip.disc
    stateRef.current.particleArea = {
      sw: disc.w * 0.5,
      ew: disc.w * 2,
      h: height * 0.85,
      sx: (width - disc.w * 0.5) / 2,
      ex: (width - disc.w * 2) / 2,
    }
    stateRef.current.particles = Array.from({ length: 100 }, () =>
      makeParticle(true),
    )
  }, [makeParticle])

  // ── Draw ─────────────────────────────────────────────────────

  const drawDiscs = React.useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const { clip, startDisc, discs } = stateRef.current
      if (!clip.disc || !clip.path) return

      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2

      // Outer disc
      const rw = Math.max(0.001, startDisc.w)
      const rh = Math.max(0.001, startDisc.h)
      ctx.beginPath()
      ctx.ellipse(startDisc.x, startDisc.y, rw, rh, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.closePath()

      // Inner discs (every 5th)
      discs.forEach((disc, i) => {
        if (i % 5 !== 0) return
        const dw = Math.max(0.001, disc.w)
        const dh = Math.max(0.001, disc.h)
        const needsClip = disc.w < clip.disc!.w - 5
        if (needsClip) {
          ctx.save()
          ctx.clip(clip.path!)
        }
        ctx.beginPath()
        ctx.ellipse(disc.x, disc.y, dw, dh, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.closePath()
        if (needsClip) ctx.restore()
      })
    },
    [strokeColor],
  )

  const drawLines = React.useCallback((ctx: CanvasRenderingContext2D) => {
    if (stateRef.current.linesCanvas) {
      ctx.drawImage(stateRef.current.linesCanvas, 0, 0)
    }
  }, [])

  const drawParticles = React.useCallback((ctx: CanvasRenderingContext2D) => {
    const { clip, particles } = stateRef.current
    if (!clip.path) return
    ctx.save()
    ctx.clip(clip.path)
    particles.forEach((p) => {
      ctx.fillStyle = p.c
      ctx.beginPath()
      ctx.rect(p.x, p.y, p.r, p.r)
      ctx.closePath()
      ctx.fill()
    })
    ctx.restore()
  }, [])

  // ── Move ─────────────────────────────────────────────────────

  const moveDiscs = React.useCallback(() => {
    stateRef.current.discs.forEach((disc) => {
      disc.p = (disc.p + 0.001) % 1
      tweenDisc(disc)
    })
  }, [tweenDisc])

  const moveParticles = React.useCallback(() => {
    const { particles, particleArea } = stateRef.current
    particles.forEach((particle, idx) => {
      particle.p = 1 - particle.y / particleArea.h
      particle.x = particle.sx + particle.dx * particle.p
      particle.y -= particle.vy
      if (particle.y < 0) {
        stateRef.current.particles[idx] = makeParticle()
      }
    })
  }, [makeParticle])

  // ── Tick ─────────────────────────────────────────────────────

  const tick = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !stateRef.current.ready) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(stateRef.current.render.dpi, stateRef.current.render.dpi)

    moveDiscs()
    moveParticles()
    drawDiscs(ctx)
    drawLines(ctx)
    drawParticles(ctx)

    ctx.restore()
    rafRef.current = requestAnimationFrame(tick)
  }, [moveDiscs, moveParticles, drawDiscs, drawLines, drawParticles])

  // ── Init ─────────────────────────────────────────────────────

  const init = React.useCallback(() => {
    stateRef.current.ready = false
    const ok = setSize()
    if (!ok) return
    setDiscs()
    setLines()
    setParticles()
    stateRef.current.ready = true
  }, [setSize, setDiscs, setLines, setParticles])

  // ── Effect ───────────────────────────────────────────────────

  React.useEffect(() => {
    // Defer init to next frame so the canvas has been laid out
    const initFrame = requestAnimationFrame(() => {
      init()
      rafRef.current = requestAnimationFrame(tick)
    })

    const handleResize = () => {
      stateRef.current.ready = false
      init()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(initFrame)
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [init, tick])

  return (
    <div
      data-slot="hole-background"
      className={cn('relative size-full overflow-hidden', className)}
      {...props}
    >
      {children}

      {/* Canvas — the hole animation */}
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />

      {/* Dark radial vignette — fades edges to black, contains the effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 70% at 50% 50%, transparent 30%, black 75%)',
        }}
      />
    </div>
  )
}
