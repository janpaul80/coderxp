import React, { useState } from 'react'
import {
  ChevronDown, ChevronUp, Layers, Code2, Server, Plug, Database,
  ListChecks, Cpu, BarChart3, Zap
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ApprovalControls } from './ApprovalControls'
import { cn } from '@/lib/utils'
import type { Plan, ExecutionStep } from '@/types'

// ─── Section ──────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="plan-section">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-1 group"
      >
        <div className="flex items-center gap-2">
          <span className="text-text-muted">{icon}</span>
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {title}
          </span>
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-text-muted" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        )}
      </button>
      {open && <div className="mt-2 pb-1">{children}</div>}
    </div>
  )
}

// ─── Tag list ─────────────────────────────────────────────────

function TagList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <Badge key={i} variant="default" size="sm">
          {item}
        </Badge>
      ))}
    </div>
  )
}

// ─── Execution steps ──────────────────────────────────────────

function ExecutionSteps({ steps }: { steps: ExecutionStep[] }) {
  return (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-2.5">
          <div className={cn(
            'w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5',
            step.status === 'complete' ? 'bg-success/15 border-success/30' :
            step.status === 'running' ? 'bg-accent/15 border-accent/30' :
            step.status === 'failed' ? 'bg-error/15 border-error/30' :
            'bg-white/[0.04] border-white/[0.10]'
          )}>
            <span className={cn(
              'text-2xs font-bold',
              step.status === 'complete' ? 'text-success' :
              step.status === 'running' ? 'text-accent' :
              step.status === 'failed' ? 'text-error' :
              'text-text-muted'
            )}>
              {i + 1}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-text-secondary">{step.title}</p>
            {step.description && (
              <p className="text-2xs text-text-muted mt-0.5 leading-relaxed">
                {step.description}
              </p>
            )}
          </div>
          {step.estimatedDuration && (
            <span className="text-2xs text-text-muted shrink-0">{step.estimatedDuration}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Complexity badge ─────────────────────────────────────────

const complexityConfig = {
  low: { label: 'Low complexity', variant: 'success' as const },
  medium: { label: 'Medium complexity', variant: 'warning' as const },
  high: { label: 'High complexity', variant: 'error' as const },
}

// ─── Plan card ────────────────────────────────────────────────

interface PlanCardProps {
  plan: Plan
  isActive?: boolean
}

export function PlanCard({ plan, isActive = false }: PlanCardProps) {
  const complexity = complexityConfig[plan.estimatedComplexity]

  return (
    <div className={cn(
      'plan-card w-full',
      isActive && 'glow-ring'
    )}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="plan-card-header">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/25 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Build Plan
              </h3>
              <p className="text-2xs text-text-muted mt-0.5">
                Review and approve to begin building
              </p>
            </div>
          </div>
          <Badge variant={complexity.variant} size="sm" dot>
            {complexity.label}
          </Badge>
        </div>

        {/* Summary */}
        <p className="mt-3 text-xs text-text-secondary leading-relaxed">
          {plan.summary}
        </p>
      </div>

      {/* ── Sections ────────────────────────────────────────── */}
      <div className="divide-y divide-white/[0.04]">
        {/* Features */}
        {plan.features?.length > 0 && (
          <Section icon={<ListChecks className="w-3.5 h-3.5" />} title="Features">
            <ul className="space-y-1">
              {plan.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                  <span className="text-accent mt-0.5 shrink-0">•</span>
                  {f}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Tech stack */}
        {plan.techStack && (
          <Section icon={<Cpu className="w-3.5 h-3.5" />} title="Tech Stack">
            <div className="space-y-2">
              {plan.techStack.frontend?.length > 0 && (
                <div>
                  <p className="text-2xs text-text-muted mb-1.5 font-medium">Frontend</p>
                  <TagList items={plan.techStack.frontend} />
                </div>
              )}
              {plan.techStack.backend?.length > 0 && (
                <div>
                  <p className="text-2xs text-text-muted mb-1.5 font-medium">Backend</p>
                  <TagList items={plan.techStack.backend} />
                </div>
              )}
              {(plan.techStack.database?.length ?? 0) > 0 && (
                <div>
                  <p className="text-2xs text-text-muted mb-1.5 font-medium">Database</p>
                  <TagList items={plan.techStack.database ?? []} />
                </div>
              )}
              {(plan.techStack.integrations?.length ?? 0) > 0 && (
                <div>
                  <p className="text-2xs text-text-muted mb-1.5 font-medium">Integrations</p>
                  <TagList items={plan.techStack.integrations ?? []} />
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Frontend scope */}
        {plan.frontendScope?.length > 0 && (
          <Section icon={<Layers className="w-3.5 h-3.5" />} title="Frontend" defaultOpen={false}>
            <TagList items={plan.frontendScope} />
          </Section>
        )}

        {/* Backend scope */}
        {plan.backendScope?.length > 0 && (
          <Section icon={<Server className="w-3.5 h-3.5" />} title="Backend" defaultOpen={false}>
            <TagList items={plan.backendScope} />
          </Section>
        )}

        {/* Integrations */}
        {plan.integrations?.length > 0 && (
          <Section icon={<Plug className="w-3.5 h-3.5" />} title="Integrations" defaultOpen={false}>
            <TagList items={plan.integrations} />
          </Section>
        )}

        {/* Execution steps */}
        {plan.executionSteps?.length > 0 && (
          <Section icon={<BarChart3 className="w-3.5 h-3.5" />} title="Execution Steps" defaultOpen={false}>
            <ExecutionSteps steps={plan.executionSteps} />
          </Section>
        )}
      </div>

      {/* ── Approval controls ────────────────────────────────── */}
      {isActive && plan.status === 'pending_approval' && (
        <div className="px-5 py-4 border-t border-white/[0.06] bg-base-elevated/30">
          <ApprovalControls plan={plan} />
        </div>
      )}
    </div>
  )
}
