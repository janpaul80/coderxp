import React from 'react'
import { cn } from '@/lib/utils'
import type { AppMode } from '@/types'

interface StatusIndicatorProps {
  mode: AppMode
  className?: string
  showLabel?: boolean
}

const modeConfig: Record<AppMode, { label: string; color: string; pulse: boolean }> = {
  idle: {
    label: 'Idle',
    color: 'bg-text-muted',
    pulse: false,
  },
  chatting: {
    label: 'Chatting',
    color: 'bg-info',
    pulse: false,
  },
  planning: {
    label: 'Planning',
    color: 'bg-warning',
    pulse: true,
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    color: 'bg-accent',
    pulse: true,
  },
  building: {
    label: 'Building',
    color: 'bg-accent',
    pulse: true,
  },
  preview: {
    label: 'Preview Ready',
    color: 'bg-success',
    pulse: false,
  },
  repair: {
    label: 'Repairing',
    color: 'bg-warning',
    pulse: true,
  },
  error: {
    label: 'Error',
    color: 'bg-error',
    pulse: false,
  },
}

export function StatusIndicator({
  mode,
  className,
  showLabel = true,
}: StatusIndicatorProps) {
  const config = modeConfig[mode]

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="relative inline-flex">
        <span
          className={cn('w-2 h-2 rounded-full', config.color)}
        />
        {config.pulse && (
          <span
            className={cn(
              'absolute inset-0 rounded-full animate-ping opacity-60',
              config.color
            )}
          />
        )}
      </span>
      {showLabel && (
        <span className="text-xs text-text-muted font-medium">
          {config.label}
        </span>
      )}
    </div>
  )
}

// ─── Compact dot only ─────────────────────────────────────────

export function StatusDot({ mode, className }: { mode: AppMode; className?: string }) {
  return <StatusIndicator mode={mode} showLabel={false} className={className} />
}
