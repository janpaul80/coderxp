import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Navbar } from '@/components/ui/mini-navbar'

// ─── Typing animation phrases ─────────────────────────────────
const PHRASES = [
  'a SaaS dashboard with auth and billing',
  'a booking system with calendar UI',
  'a full-stack todo app with Postgres',
  'a real-time chat app with Socket.io',
  'a REST API with Prisma and JWT',
  'an e-commerce store with Stripe checkout',
  'a portfolio site with dark mode',
  'a blog platform with MDX support',
]

function useTypingAnimation(phrases: string[], speed = 50, pause = 2200) {
  const [displayed, setDisplayed] = useState('')
  const [phraseIdx, setPhraseIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const current = phrases[phraseIdx]
    let timeout: ReturnType<typeof setTimeout>

    if (!deleting && charIdx < current.length) {
      timeout = setTimeout(() => setCharIdx((c) => c + 1), speed)
    } else if (!deleting && charIdx === current.length) {
      timeout = setTimeout(() => setDeleting(true), pause)
    } else if (deleting && charIdx > 0) {
      timeout = setTimeout(() => setCharIdx((c) => c - 1), speed / 2.5)
    } else if (deleting && charIdx === 0) {
      setDeleting(false)
      setPhraseIdx((i) => (i + 1) % phrases.length)
    }

    setDisplayed(current.slice(0, charIdx))
    return () => clearTimeout(timeout)
  }, [charIdx, deleting, phraseIdx, phrases, speed, pause])

  return displayed
}

// ─── Three.js wave background ─────────────────────────────────
function useThreeWave(canvasRef: React.RefObject<HTMLCanvasElement>) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight)
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, canvas.offsetWidth / canvas.offsetHeight, 0.1, 100)
    camera.position.set(0, 2, 5)
    camera.lookAt(0, 0, 0)

    // Wave plane geometry
    const SEGMENTS = 80
    const geometry = new THREE.PlaneGeometry(14, 8, SEGMENTS, SEGMENTS)
    geometry.rotateX(-Math.PI / 2.8)

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color(0x7c6af7) },
        uColor2: { value: new THREE.Color(0x4f46e5) },
      },
      vertexShader: `
        uniform float uTime;
        varying float vElevation;
        varying vec2 vUv;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float wave1 = sin(pos.x * 1.2 + uTime * 0.8) * 0.18;
          float wave2 = sin(pos.z * 1.5 + uTime * 0.6) * 0.12;
          float wave3 = sin((pos.x + pos.z) * 0.8 + uTime * 1.1) * 0.08;
          pos.y += wave1 + wave2 + wave3;
          vElevation = pos.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying float vElevation;
        varying vec2 vUv;

        void main() {
          float t = (vElevation + 0.4) / 0.8;
          t = clamp(t, 0.0, 1.0);
          vec3 color = mix(uColor2, uColor1, t);
          float alpha = 0.12 + t * 0.18;
          // Fade edges
          float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x)
                         * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          gl_FragColor = vec4(color, alpha * edgeFade);
        }
      `,
      transparent: true,
      wireframe: true,
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Ambient particles
    const particleCount = 120
    const positions = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8
    }
    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const particleMat = new THREE.PointsMaterial({
      color: 0x7c6af7,
      size: 0.025,
      transparent: true,
      opacity: 0.4,
    })
    const particles = new THREE.Points(particleGeo, particleMat)
    scene.add(particles)

    let animId: number
    const clock = new THREE.Clock()

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      material.uniforms.uTime.value = t
      particles.rotation.y = t * 0.04
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      particleGeo.dispose()
      particleMat.dispose()
    }
  }, [canvasRef])
}

// ─── Send icon ────────────────────────────────────────────────
function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

// ─── Component ────────────────────────────────────────────────
interface AIInputHeroProps {
  onPromptSubmit?: (prompt: string) => void
  showNavbar?: boolean
  className?: string
}

export function AIInputHero({
  onPromptSubmit,
  showNavbar = true,
  className,
}: AIInputHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState('')
  const typedText = useTypingAnimation(PHRASES)

  useThreeWave(canvasRef)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [prompt])

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    onPromptSubmit?.(trimmed)
  }, [prompt, onPromptSubmit])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <section
      className={cn(
        'relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black',
        className
      )}
    >
      {/* Three.js wave canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 0.85 }}
      />

      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 100% 60% at 50% 100%, rgba(0,0,0,0.8) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(0,0,0,0.6) 0%, transparent 60%)',
        }}
      />

      {/* Floating pill navbar */}
      {showNavbar && <Navbar />}

      {/* Content */}
      <div className="relative z-10 w-full max-w-3xl mx-auto px-6 flex flex-col items-center text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-7"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border border-white/[0.10] bg-white/[0.04] text-white/60 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            AI Fullstack Engineer
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08 }}
          className="text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-5"
        >
          Build with AI.
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="text-base sm:text-lg text-white/45 max-w-lg mb-10 leading-relaxed"
        >
          The AI Fullstack Engineer that turns your idea into a production-ready app — real code, live preview, zero setup.
        </motion.p>

        {/* AI Input box */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.24 }}
          className="w-full"
        >
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 32px 64px rgba(0,0,0,0.6), 0 0 80px rgba(124,106,247,0.08)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Textarea */}
            <div className="px-5 pt-5 pb-2">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Build me ${typedText}|`}
                rows={2}
                className="w-full bg-transparent text-white placeholder-white/25 text-sm resize-none outline-none leading-relaxed"
                style={{ minHeight: '56px', maxHeight: '160px' }}
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 pb-4 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/25 font-mono">
                  Press{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/[0.08] text-[10px] text-white/35">
                    Enter
                  </kbd>{' '}
                  to build
                </span>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200',
                  prompt.trim()
                    ? 'bg-white text-black hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                    : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
                )}
              >
                <SendIcon />
                Build
              </button>
            </div>
          </div>

          {/* No credit card note */}
          <p className="mt-3 text-xs text-white/20 text-center">
            No credit card required &nbsp;·&nbsp; Free to start
          </p>
        </motion.div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-5 text-sm text-white/35"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-2">
              {[
                { bg: '#7c6af7', letter: 'J' },
                { bg: '#6b7280', letter: 'S' },
                { bg: '#374151', letter: 'M' },
                { bg: '#1f2937', letter: 'A' },
              ].map((a, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: a.bg, borderColor: '#000' }}
                >
                  {a.letter}
                </div>
              ))}
            </div>
            <span>2,400+ developers building</span>
          </div>

          <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />

          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <svg key={s} width="11" height="11" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
            <span>4.9/5 from 180+ reviews</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
