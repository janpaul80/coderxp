import React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'outline'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  variant?: BadgeVariant
  size?: BadgeSize
  dot?: boolean
  className?: string
  children: React.ReactNode
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.06] text-text-secondary border-white/[0.08]',
  accent: 'bg-accent/15 text-accent-light border-accent/20',
  success: 'bg-success/15 text-success border-success/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  error: 'bg-error/15 text-error border-error/20',
  info: 'bg-info/15 text-info border-info/20',
  outline: 'bg-transparent text-text-secondary border-white/[0.12]',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-2xs px-1.5 py-0.5 rounded-md',
  md: 'text-xs px-2 py-0.5 rounded-lg',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-text-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-info',
  outline: 'bg-text-muted',
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            dotColors[variant]
          )}
        />
      )}
      {children}
    </span>
  )
}
