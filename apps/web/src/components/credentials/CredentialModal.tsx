import React, { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import { useSocket } from '@/hooks/useSocket'
import { CredentialFieldInput } from './CredentialField'

// ─── Integration badge colours ────────────────────────────────

const INTEGRATION_BADGE: Record<string, string> = {
  supabase: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  stripe:   'bg-violet-500/20  text-violet-400  border-violet-500/30',
  paypal:   'bg-blue-500/20    text-blue-400    border-blue-500/30',
  openai:   'bg-teal-500/20    text-teal-400    border-teal-500/30',
  github:   'bg-slate-500/20   text-slate-300   border-slate-500/30',
  vercel:   'bg-white/10       text-white/80    border-white/20',
  custom:   'bg-accent/20      text-accent      border-accent/30',
}

function badgeClass(integration: string): string {
  return INTEGRATION_BADGE[integration] ?? INTEGRATION_BADGE.custom
}

// ─── Countdown formatter ──────────────────────────────────────

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Expired'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

// ─── Component ────────────────────────────────────────────────

export function CredentialModal() {
  const pendingCredentialRequest = useAppStore((s) => s.pendingCredentialRequest)
  const setPendingCredential     = useAppStore((s) => s.setPendingCredential)
  const { provideCredentials, skipCredentials } = useSocket()

  const [values,     setValues]     = useState<Record<string, string>>({})
  const [errors,     setErrors]     = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // ── Reset form when a new request arrives ─────────────────
  useEffect(() => {
    if (!pendingCredentialRequest) {
      setValues({})
      setErrors({})
      setSubmitting(false)
      setSecondsLeft(null)
      return
    }
    const initial: Record<string, string> = {}
    pendingCredentialRequest.fields.forEach((f) => {
      initial[f.key] = f.value ?? ''
    })
    setValues(initial)
    setErrors({})
    setSubmitting(false)
  }, [pendingCredentialRequest?.id])

  // ── Expiry countdown — recomputes from timestamp each tick ─
  useEffect(() => {
    if (!pendingCredentialRequest?.expiresAt) return

    const expiresAt = pendingCredentialRequest.expiresAt

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      )
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        setPendingCredential(null)
      }
    }

    tick() // immediate first tick
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [pendingCredentialRequest?.id, pendingCredentialRequest?.expiresAt, setPendingCredential])

  // ── Field change ──────────────────────────────────────────
  const handleFieldChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  // ── Provide ───────────────────────────────────────────────
  const handleProvide = useCallback(() => {
    if (!pendingCredentialRequest || submitting) return

    // Validate required fields
    const newErrors: Record<string, string> = {}
    pendingCredentialRequest.fields.forEach((f) => {
      if (f.required && !values[f.key]?.trim()) {
        newErrors[f.key] = `${f.label} is required`
      }
    })
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setSubmitting(true)
    provideCredentials(pendingCredentialRequest.id, values)
    // Modal cleared by credentials:provided socket event in useSocket.ts
    // Safety fallback: reset submitting after 5s if no ack
    const fallback = setTimeout(() => setSubmitting(false), 5000)
    return () => clearTimeout(fallback)
  }, [pendingCredentialRequest, values, submitting, provideCredentials])

  // ── Skip ──────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    if (!pendingCredentialRequest) return
    skipCredentials(pendingCredentialRequest.id)
    // Modal cleared by credentials:skipped socket event in useSocket.ts
  }, [pendingCredentialRequest, skipCredentials])

  // ── Keyboard: Escape → skip ───────────────────────────────
  useEffect(() => {
    if (!pendingCredentialRequest) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingCredentialRequest, handleSkip])

  if (!pendingCredentialRequest) return null

  const req        = pendingCredentialRequest
  const isExpired  = secondsLeft !== null && secondsLeft <= 0
  const isUrgent   = secondsLeft !== null && secondsLeft > 0 && secondsLeft < 30
  const allFilled  = req.fields
    .filter((f) => f.required)
    .every((f) => values[f.key]?.trim())
  const canSubmit  = !submitting && !isExpired && allFilled

  return (
    /* ── Backdrop ─────────────────────────────────────────── */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleSkip() }}
    >
      {/* ── Modal ──────────────────────────────────────────── */}
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ background: '#14141f' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">

            <div className="flex flex-col gap-2 min-w-0">
              {/* Integration badge + countdown */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-widest ${badgeClass(req.integration)}`}>
                  {req.integration}
                </span>
                {secondsLeft !== null && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
                    isUrgent
                      ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse'
                      : 'bg-white/[0.05] text-white/45 border-white/10'
                  }`}>
                    {formatCountdown(secondsLeft)}
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-[15px] font-semibold text-white leading-snug">
                {req.label}
              </h2>
            </div>

            {/* Lock icon */}
            <div className="shrink-0 w-9 h-9 rounded-xl bg-accent/10 border border-accent/20
              flex items-center justify-center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="text-accent">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          {/* Purpose */}
          {req.purpose && (
            <p className="mt-3 text-[13px] text-white/55 leading-relaxed">
              {req.purpose}
            </p>
          )}

          {/* Expired banner */}
          {isExpired && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-400 bg-red-500/10
              border border-red-500/20 rounded-lg px-3 py-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              This credential request has expired. The build will continue without it.
            </div>
          )}
        </div>

        {/* ── Fields ─────────────────────────────────────── */}
        {!isExpired && (
          <div className="px-6 py-5 flex flex-col gap-4">
            {req.fields.map((field) => (
              <div key={field.key}>
                <CredentialFieldInput
                  field={field}
                  value={values[field.key] ?? ''}
                  onChange={handleFieldChange}
                  disabled={submitting || isExpired}
                />
                {errors[field.key] && (
                  <p className="mt-1 text-[11px] text-red-400">{errors[field.key]}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Security note ───────────────────────────────── */}
        <div className="px-6 pb-4">
          <div className="flex items-center gap-1.5 text-[11px] text-white/25">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Credentials are sent directly to the build agent and never stored or logged.
          </div>
        </div>

        {/* ── Actions ────────────────────────────────────── */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleSkip}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white/55
              bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] hover:text-white/75
              transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isExpired ? 'Close' : 'Skip'}
          </button>

          {!isExpired && (
            <button
              onClick={handleProvide}
              disabled={!canSubmit}
              className="flex-[2] px-4 py-2.5 rounded-xl text-sm font-semibold text-white
                bg-accent hover:bg-accent/90 active:scale-[0.98] transition-all
                disabled:opacity-35 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending…
                </>
              ) : (
                'Provide Credentials'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
