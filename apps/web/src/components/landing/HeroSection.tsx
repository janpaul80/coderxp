import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '@/store/authStore'
import { HoleBackground } from '@/components/ui/HoleBackground'

// ─── Typing animation phrases ─────────────────────────────────
const PHRASES = [
  'a booking system with calendar UI',
  'a SaaS landing page with Stripe checkout',
  'a full-stack todo app with auth',
  'a real-time dashboard with charts',
  'a REST API with Postgres and Prisma',
  'a portfolio site with dark mode',
  'an e-commerce store with cart logic',
  'a blog platform with MDX support',
]

// ─── Example prompt chips ─────────────────────────────────────
const EXAMPLE_CHIPS = [
  'Image compressor',
  'QR code maker',
  'Tic Tac Toe game',
  'Modern landing page',
  'Invoice generator',
  'Habit tracker',
]

// ─── Model options ────────────────────────────────────────────
const MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o', badge: 'Fast' },
  { id: 'claude-3-5-sonnet', label: 'Claude 3.5', badge: 'Smart' },
  { id: 'gemini-2-flash', label: 'Gemini 2.0', badge: 'New' },
]

// ─── SVG Icons ────────────────────────────────────────────────
function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? 'text-red-400' : ''}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// ─── Typing hook ──────────────────────────────────────────────
function useTypingAnimation(phrases: string[], speed = 52, pause = 2400) {
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
      timeout = setTimeout(() => setCharIdx((c) => c - 1), speed / 2.2)
    } else if (deleting && charIdx === 0) {
      setDeleting(false)
      setPhraseIdx((i) => (i + 1) % phrases.length)
    }

    setDisplayed(current.slice(0, charIdx))
    return () => clearTimeout(timeout)
  }, [charIdx, deleting, phraseIdx, phrases, speed, pause])

  return displayed
}

export function HeroSection() {
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState(MODELS[0])
  const [modelOpen, setModelOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const typedText = useTypingAnimation(PHRASES)

  useEffect(() => {
    setVoiceSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [prompt])

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    sessionStorage.setItem('codedxp_pending_prompt', trimmed)
    if (isAuthenticated) {
      navigate('/workspace')
    } else {
      navigate('/auth?mode=register')
    }
  }, [prompt, isAuthenticated, navigate])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChip = (chip: string) => {
    setPrompt(chip)
    textareaRef.current?.focus()
  }

  const handleVoice = () => {
    if (!voiceSupported) return
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SpeechRecognitionAPI = win.webkitSpeechRecognition ?? win.SpeechRecognition
    if (!SpeechRecognitionAPI) return
    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } }; length: number } }) => {
      const transcript = Array.from({ length: event.results.length })
        .map((_, i) => event.results[i][0].transcript)
        .join('')
      setPrompt(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-20 overflow-hidden"
      style={{ backgroundColor: '#000000' }}
    >
      {/* Hole background effect — hero-only, behind headline + chatbox */}
      <div className="absolute inset-0 pointer-events-none">
        <HoleBackground
          strokeColor="rgba(255,255,255,0.07)"
          numberOfLines={40}
          numberOfDiscs={40}
          particleRGBColor={[200, 200, 220]}
          className="w-full h-full"
        />
      </div>

      <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center text-center">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-7"
        >
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border border-white/[0.10] bg-white/[0.04] text-white/70">
            <span className="w-5 h-5 rounded-md bg-[#7c6af7] flex items-center justify-center flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </span>
            CodedXP Horizons
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider bg-white/[0.08] text-white/50 uppercase">
              Early Access
            </span>
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08 }}
          className="text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-5"
        >
          Describe it.
          <br />
          We build it.
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="text-base sm:text-lg text-white/45 max-w-lg mb-10 leading-relaxed"
        >
          CodedXP turns your idea into a fully working app, with real code, live
          preview, and zero setup.
        </motion.p>

        {/* ── Chatbox ─────────────────────────────────────────── */}
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
              boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 32px 64px rgba(0,0,0,0.6)',
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
                className="w-full bg-transparent text-white placeholder-white/30 text-sm resize-none outline-none leading-relaxed"
                style={{ minHeight: '56px', maxHeight: '160px' }}
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 pb-3.5 pt-1">
              {/* Left tools */}
              <div className="flex items-center gap-0.5">
                {/* Attach */}
                <button
                  className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                  title="Attach file"
                  onClick={() => navigate(isAuthenticated ? '/workspace' : '/auth?mode=register')}
                >
                  <PaperclipIcon />
                </button>

                {/* GitHub — subtle toolbar icon, not a link block */}
                <button
                  className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                  title="Import from GitHub"
                  onClick={() => navigate(isAuthenticated ? '/workspace' : '/auth?mode=register')}
                >
                  <GitHubIcon />
                </button>

                {/* Voice */}
                {voiceSupported && (
                  <button
                    onClick={handleVoice}
                    className={`p-2 rounded-lg transition-all ${
                      listening
                        ? 'text-red-400 bg-red-400/10'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/[0.05]'
                    }`}
                    title={listening ? 'Stop recording' : 'Voice input'}
                  >
                    <MicIcon active={listening} />
                  </button>
                )}

                {/* Divider */}
                <div className="w-px h-4 bg-white/[0.08] mx-1.5" />

                {/* Model selector */}
                <div ref={modelRef} className="relative">
                  <button
                    onClick={() => setModelOpen(!modelOpen)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/[0.05] border border-white/[0.08] transition-all"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    {selectedModel.label}
                    <ChevronDownIcon />
                  </button>

                  <AnimatePresence>
                    {modelOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        className="absolute bottom-full left-0 mb-2 w-44 rounded-xl overflow-hidden"
                        style={{
                          background: 'rgba(18,18,18,0.98)',
                          border: '1px solid rgba(255,255,255,0.09)',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                        }}
                      >
                        {MODELS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => { setSelectedModel(m); setModelOpen(false) }}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-xs transition-all hover:bg-white/[0.05] ${
                              selectedModel.id === m.id ? 'text-white' : 'text-white/50'
                            }`}
                          >
                            <span>{m.label}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.07] text-white/40">
                              {m.badge}
                            </span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Build button — dark, not purple */}
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  prompt.trim()
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
                }`}
              >
                <SendIcon />
                Build
              </button>
            </div>
          </div>

          {/* Hint */}
          <p className="mt-3 text-xs text-white/25 text-center">
            Press{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/[0.08] text-[10px] font-mono text-white/40">
              Enter
            </kbd>{' '}
            to build &nbsp;·&nbsp; No credit card required
          </p>
        </motion.div>

        {/* ── Social proof ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-5 text-sm text-white/40"
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
            <span>Trusted by 2,400+ developers</span>
          </div>

          <div className="hidden sm:block w-px h-4 bg-white/[0.08]" />

          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            ))}
            <span>4.9/5 from 180+ reviews</span>
          </div>
        </motion.div>

        {/* ── Example chips ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2"
        >
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => handleChip(chip)}
              className="px-3.5 py-1.5 rounded-full text-xs text-white/45 border border-white/[0.09] hover:border-white/[0.18] hover:text-white/70 hover:bg-white/[0.04] transition-all duration-200"
            >
              {chip}
            </button>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
