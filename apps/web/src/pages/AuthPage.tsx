import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { PricingModal } from '@/components/billing/PricingModal'

type AuthMode = 'login' | 'register'

// ─── Google icon ──────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

// ─── GitHub icon ──────────────────────────────────────────────
function GithubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )
}

// ─── Checkmark icon ───────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// ─── Left panel step list ─────────────────────────────────────
function StepList() {
  const steps = [
    { label: 'Sign up your account', done: true },
    { label: 'Set up your workspace', done: false },
    { label: 'Set up your profile', done: false },
  ]
  return (
    <div className="flex flex-col gap-0 mt-5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                step.done
                  ? 'bg-white text-purple-700'
                  : 'bg-white/[0.15] text-white/50 border border-white/25'
              }`}
            >
              {step.done ? <CheckIcon /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className="w-px h-7 bg-white/20 my-1" />
            )}
          </div>
          <span className={`text-sm pt-1 leading-tight ${step.done ? 'text-white font-semibold' : 'text-white/45'}`}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Reusable field ───────────────────────────────────────────
function Field({
  label, type, value, onChange, placeholder, autoComplete, required, hint,
  rightSlot,
}: {
  label: string
  type: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  hint?: string
  rightSlot?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5 font-medium">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className="w-full px-3.5 py-3 rounded-xl bg-white/[0.06] border border-white/[0.10] text-white text-sm placeholder-white/25 outline-none focus:border-white/30 focus:bg-white/[0.09] transition-all pr-11"
        />
        {rightSlot && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      {hint && <p className="text-xs text-white/30 mt-1.5">{hint}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────
export function AuthPage() {
  const [searchParams] = useSearchParams()
  const initialMode: AuthMode = searchParams.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [pricingOpen, setPricingOpen] = useState(false)

  useEffect(() => {
    const m = searchParams.get('mode')
    if (m === 'register' || m === 'login') setMode(m as AuthMode)
  }, [searchParams])

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [confirmationMsg, setConfirmationMsg] = useState('')

  const { login, register, loginWithGoogle, loginWithGithub, isLoading } = useAuth()

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'login') {
      const result = await login(email, password)
      if (!result.success) setError(result.error ?? 'Login failed')
    } else {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      if (!fullName) { setError('First name is required'); return }
      if (password.length < 8) { setError('Password must be at least 8 characters'); return }
      const result = await register(fullName, email, password)
      if (!result.success) {
        setError(result.error ?? 'Registration failed')
      } else if ((result as { requiresConfirmation?: boolean }).requiresConfirmation) {
        setError('')
        // Show confirmation message in the error slot (reuse with green styling via state)
        setConfirmationMsg((result as { message?: string }).message ?? 'Check your email to confirm your account.')
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-hidden">

      {/* ══ LEFT PANEL — radial spotlight gradient (desktop only) ══ */}
      <div
        className="hidden md:flex md:w-[44%] lg:w-[40%] flex-col items-center justify-center p-10 lg:p-14 relative overflow-hidden flex-shrink-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 45%, #8b5cf6 0%, #6d28d9 30%, #4c1d95 55%, #1e0a3c 80%, #0a0118 100%)',
        }}
      >
        {/* Subtle noise/grain overlay for depth */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }}
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Logo — actual brand image, centered */}
          {/* PNG is 500×500 with transparent padding; use explicit px width so the logo fills the panel */}
          <div className="mb-2 flex items-center justify-center">
            <img
              src="/logo-white.png"
              alt="CoderXP"
              style={{ width: '260px', height: 'auto' }}
              className="select-none"
              draggable={false}
            />
          </div>

          {/* Headline — centered, single line */}
          <h2 className="text-[1.45rem] lg:text-[1.85rem] font-bold text-white leading-tight mb-4 whitespace-nowrap">
            Get Started with Us
          </h2>

          {/* Steps — centered container */}
          <StepList />
        </div>
      </div>

      {/* ══ RIGHT PANEL — dark form ══════════════════════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0c0c0c] px-6 py-12 min-h-screen">

        {/* Mobile logo */}
        <div className="md:hidden mb-8 text-center flex flex-col items-center">
          <img
            src="/logo-white.png"
            alt="CoderXP"
            className="h-10 w-auto select-none mb-1"
            draggable={false}
          />
          <p className="text-white/40 text-xs mt-1">AI-powered autonomous app builder</p>
        </div>

        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="w-full max-w-[420px]"
        >
          {/* Title */}
          <h1 className="text-2xl font-bold text-white mb-7 text-center">
            {mode === 'register' ? 'Sign Up Account' : 'Sign In'}
          </h1>

          {/* OAuth buttons */}
          <div className="flex gap-3 mb-5">
            <button
              type="button"
              onClick={loginWithGoogle}
              className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-white text-sm font-medium transition-all duration-200 active:scale-[0.98]"
            >
              <GoogleIcon />
              Google
            </button>
            <button
              type="button"
              onClick={loginWithGithub}
              className="flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-white text-sm font-medium transition-all duration-200 active:scale-[0.98]"
            >
              <GithubIcon />
              Github
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-white/[0.10]" />
            <span className="text-xs text-white/35 px-1">Or</span>
            <div className="flex-1 h-px bg-white/[0.10]" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* First + Last name (register only) */}
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="name-row"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-2 gap-3"
                >
                  <Field
                    label="First Name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="eg. John"
                    autoComplete="given-name"
                  />
                  <Field
                    label="Last Name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="eg. Francisco"
                    autoComplete="family-name"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="eg. johnfrans@gmail.com"
              autoComplete="email"
              required
            />

            {/* Password */}
            <Field
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              hint={mode === 'register' ? 'Must be at least 8 characters.' : undefined}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            {/* Error / confirmation messages */}
            <AnimatePresence>
              {error && (
                <motion.p
                  key="error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-red-400 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-2.5"
                >
                  {error}
                </motion.p>
              )}
              {confirmationMsg && !error && (
                <motion.p
                  key="confirm"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-green-400 bg-green-500/[0.08] border border-green-500/20 rounded-xl px-3.5 py-2.5"
                >
                  {confirmationMsg}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl bg-white text-black text-sm font-bold hover:bg-white/90 active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-1"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Sign Up'
              )}
            </button>
          </form>

          {/* Toggle */}
          <p className="text-center text-sm text-white/40 mt-5">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-white font-semibold underline underline-offset-2 hover:text-white/80 transition-colors"
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>

          {/* Terms */}
          <p className="text-center text-xs text-white/25 mt-4">
            By continuing, you agree to our{' '}
            <span className="text-white/40 hover:text-white/60 cursor-pointer transition-colors">Terms</span>
            {' '}and{' '}
            <span className="text-white/40 hover:text-white/60 cursor-pointer transition-colors">Privacy Policy</span>
          </p>
        </motion.div>
      </div>

      {/* Pricing modal */}
      <PricingModal
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onSelectPlan={() => {
          setPricingOpen(false)
          setMode('register')
        }}
      />
    </div>
  )
}
