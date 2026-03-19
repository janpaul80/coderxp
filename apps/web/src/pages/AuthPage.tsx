import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { Zap, Mail, Lock, User, Eye, EyeOff, ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PricingModal } from '@/components/billing/PricingModal'
import { cn } from '@/lib/utils'

type AuthMode = 'login' | 'register'

export function AuthPage() {
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login'
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [pricingOpen, setPricingOpen] = useState(false)

  // Sync mode if query param changes
  useEffect(() => {
    const m = searchParams.get('mode')
    if (m === 'register' || m === 'login') setMode(m)
  }, [searchParams])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const { login, register, isLoading } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        if (!name.trim()) {
          setError('Name is required')
          return
        }
        await register(name, email, password)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
    }
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-info/[0.03] blur-3xl" />
      </div>
      <div className="absolute inset-0 bg-dots opacity-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div
              className="w-14 h-14 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center"
              style={{ boxShadow: '0 0 40px rgba(124,106,247,0.2)' }}
            >
              <Zap className="w-7 h-7 text-accent" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-xl" />
          </div>
          <h1 className="text-xl font-bold gradient-text">CodedXP</h1>
          <p className="text-xs text-text-muted mt-1">AI-powered autonomous app builder</p>
        </div>

        {/* Card */}
        <div className="glass-card p-6">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-base border border-white/[0.06] mb-6">
            {(['login', 'register'] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={cn(
                  'flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                  mode === m
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Input
                    label="Full name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    leftIcon={<User className="w-3.5 h-3.5" />}
                    autoComplete="name"
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              leftIcon={<Mail className="w-3.5 h-3.5" />}
              autoComplete={mode === 'login' ? 'email' : 'new-email'}
              required
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Min. 8 characters' : 'Your password'}
              leftIcon={<Lock className="w-3.5 h-3.5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              }
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="text-xs text-error bg-error/[0.08] border border-error/15 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              variant="accent"
              size="md"
              fullWidth
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-text-muted mt-4">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
              className="text-accent hover:text-accent-light transition-colors font-medium"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Pricing entry */}
        <button
          onClick={() => setPricingOpen(true)}
          className="w-full flex items-center justify-center gap-2 mt-4 py-2.5 rounded-xl border border-accent/20 bg-accent/[0.06] hover:bg-accent/[0.10] hover:border-accent/30 transition-all duration-200 group"
        >
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-medium text-accent">View Pricing — from $3/month</span>
        </button>

        {/* Terms */}
        <p className="text-center text-2xs text-text-muted mt-4">
          By continuing, you agree to our{' '}
          <span className="text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Terms</span>
          {' '}and{' '}
          <span className="text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Privacy Policy</span>
        </p>
      </motion.div>

      {/* Pricing modal */}
      <PricingModal
        isOpen={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onSelectPlan={(planId) => {
          setPricingOpen(false)
          // After plan selection, keep user on auth page to complete signup
          setMode('register')
        }}
      />
    </div>
  )
}
