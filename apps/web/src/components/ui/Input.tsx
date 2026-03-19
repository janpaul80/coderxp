import React from 'react'
import { cn } from '@/lib/utils'

// ─── Text Input ───────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightIcon, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-text-muted pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-base-elevated border border-white/[0.08] rounded-lg',
              'px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
              'transition-all duration-200',
              'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              error && 'border-error/40 focus:border-error/60 focus:ring-error/20',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 text-text-muted">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-text-muted">{hint}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

// ─── Textarea ─────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label className="text-xs font-medium text-text-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full bg-base-elevated border border-white/[0.08] rounded-lg',
            'px-3 py-2 text-sm text-text-primary placeholder:text-text-muted',
            'transition-all duration-200 resize-none',
            'focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'scrollbar-thin',
            error && 'border-error/40',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
