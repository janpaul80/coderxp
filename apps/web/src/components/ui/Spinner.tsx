import React from 'react'
import { cn } from '@/lib/utils'

type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg'

interface SpinnerProps {
  size?: SpinnerSize
  className?: string
  label?: string
}

const sizeMap: Record<SpinnerSize, string> = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
}

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={cn('inline-flex items-center justify-center', className)}
    >
      <span
        className={cn(
          'rounded-full border-white/10 border-t-accent animate-spin',
          sizeMap[size]
        )}
      />
      {label && (
        <span className="sr-only">{label}</span>
      )}
    </span>
  )
}

// ─── Dots variant ─────────────────────────────────────────────

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-text-muted animate-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  )
}

// ─── Pulse ring ───────────────────────────────────────────────

export function PulseRing({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <span className="w-2.5 h-2.5 rounded-full bg-accent" />
      <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-40" />
    </span>
  )
}
