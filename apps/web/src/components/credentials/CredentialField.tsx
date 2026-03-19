import React, { useState } from 'react'
import type { CredentialField as CredentialFieldDef } from '@/types'

interface Props {
  field: CredentialFieldDef
  value: string
  onChange: (key: string, value: string) => void
  disabled?: boolean
}

export function CredentialFieldInput({ field, value, onChange, disabled }: Props) {
  const [showPassword, setShowPassword] = useState(false)

  const inputType =
    field.type === 'password' && !showPassword
      ? 'password'
      : field.type === 'url'
      ? 'url'
      : 'text'

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-white/70 flex items-center gap-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      <div className="relative">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder ?? ''}
          disabled={disabled}
          autoComplete={field.type === 'password' ? 'off' : undefined}
          spellCheck={false}
          className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 text-sm text-white
            placeholder:text-white/25 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{ paddingRight: field.type === 'password' ? '2.5rem' : undefined }}
        />

        {field.type === 'password' && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            disabled={disabled}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide value' : 'Show value'}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/65
              transition-colors disabled:cursor-not-allowed focus:outline-none"
          >
            {showPassword ? (
              /* Eye-off */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              /* Eye */
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
