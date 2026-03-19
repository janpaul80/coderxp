import React from 'react'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

type ButtonVariant = 'accent' | 'ghost' | 'danger' | 'success' | 'outline' | 'subtle'
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
}

// ─── Variant styles ───────────────────────────────────────────

const variantStyles: Record<ButtonVariant, string> = {
  accent: [
    'bg-accent text-white font-medium',
    'hover:bg-accent-light',
    'shadow-glow-accent hover:shadow-[0_0_24px_rgba(124,106,247,0.45)]',
    'active:scale-[0.98]',
  ].join(' '),

  ghost: [
    'text-text-secondary font-medium',
    'hover:bg-white/[0.05] hover:text-text-primary',
    'border border-transparent hover:border-white/[0.08]',
    'active:scale-[0.98]',
  ].join(' '),

  danger: [
    'bg-error/10 text-error font-medium',
    'border border-error/20',
    'hover:bg-error/20 hover:border-error/30',
    'active:scale-[0.98]',
  ].join(' '),

  success: [
    'bg-success/10 text-success font-medium',
    'border border-success/20',
    'hover:bg-success/20 hover:border-success/30',
    'active:scale-[0.98]',
  ].join(' '),

  outline: [
    'text-text-primary font-medium',
    'border border-white/[0.10]',
    'hover:bg-white/[0.04] hover:border-white/[0.16]',
    'active:scale-[0.98]',
  ].join(' '),

  subtle: [
    'text-text-muted font-medium',
    'hover:bg-white/[0.03] hover:text-text-secondary',
    'active:scale-[0.98]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs rounded-md gap-1',
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-9 px-4 text-sm rounded-lg gap-2',
  lg: 'h-11 px-5 text-sm rounded-xl gap-2',
}

// ─── Component ────────────────────────────────────────────────

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'ghost',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center',
          'transition-all duration-150 cursor-pointer',
          'select-none whitespace-nowrap',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
