import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Zap, CheckCircle2 } from 'lucide-react'
import { ApprovalControls } from './ApprovalControls'
import { cn } from '@/lib/utils'
import type { Plan } from '@/types'

// ─── Inline plan message ─────────────────────────────────────
// Renders the plan as a natural conversational message from the agent.
// No rigid "card" — the agent talks through what it will build.
// Details are expandable, approval is inline and compact.

interface PlanCardProps {
  plan: Plan
  isActive?: boolean
}

export function PlanCard({ plan, isActive = false }: PlanCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  const techFrontend = plan.techStack?.frontend ?? []
  const techBackend = plan.techStack?.backend ?? []
  const techDB = plan.techStack?.database ?? []
  const integrations = plan.integrations ?? []
  const features = plan.features ?? []
  const frontendScope = plan.frontendScope ?? []
  const backendScope = plan.backendScope ?? []
  const steps = plan.executionSteps ?? []

  return (
    <div className="flex items-start gap-3 px-4 py-2">
      {/* Agent avatar */}
      <div className="w-6 h-6 rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center shrink-0 mt-0.5">
        <Zap className="w-3 h-3 text-white/70" />
      </div>

      {/* Message bubble */}
      <div className="flex-1 min-w-0 max-w-[calc(100%-4rem)]">
        <div className={cn(
          'rounded-2xl rounded-tl-sm overflow-hidden',
          'bg-base-elevated border border-white/[0.06]',
          isActive && 'border-accent/20'
        )}>
          {/* Plan content — conversational */}
          <div className="px-4 py-3 space-y-3">
            {/* Summary — the agent's voice */}
            <p className="text-[13px] text-text-primary leading-relaxed">
              {plan.summary}
            </p>

            {/* Features list */}
            {features.length > 0 && (
              <div>
                <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                  What I'll build
                </p>
                <ul className="space-y-1">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-text-secondary leading-relaxed">
                      <CheckCircle2 className="w-3 h-3 text-accent/50 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tech stack — inline tags */}
            {(techFrontend.length > 0 || techBackend.length > 0 || techDB.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {[...techFrontend, ...techBackend, ...techDB].map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] font-medium text-text-muted"
                  >
                    {t}
                  </span>
                ))}
                {integrations.map((t, i) => (
                  <span
                    key={`int-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/[0.06] border border-accent/[0.10] text-[10px] font-medium text-accent/70"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Expandable details toggle */}
            {(steps.length > 0 || frontendScope.length > 0 || backendScope.length > 0) && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-2xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {showDetails
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />
                }
                <span>{showDetails ? 'Hide' : 'Show'} execution details</span>
                {!showDetails && steps.length > 0 && (
                  <span className="text-text-muted/50 ml-1">({steps.length} steps)</span>
                )}
              </button>
            )}

            {showDetails && (
              <div className="space-y-2 pt-1 border-t border-white/[0.04]">
                {steps.length > 0 && (
                  <div>
                    <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                      Execution plan
                    </p>
                    <ol className="space-y-1">
                      {steps.map((step, i) => (
                        <li key={step.id || i} className="flex items-start gap-2 text-xs text-text-secondary">
                          <span className="text-text-muted text-2xs font-mono w-4 text-right shrink-0 mt-px">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{step.title}</span>
                            {step.description && (
                              <span className="text-text-muted ml-1">— {step.description}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {frontendScope.length > 0 && (
                  <div>
                    <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-1">Pages</p>
                    <div className="flex flex-wrap gap-1">
                      {frontendScope.map((s, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-text-muted border border-white/[0.04]">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {backendScope.length > 0 && (
                  <div>
                    <p className="text-2xs font-semibold text-text-muted uppercase tracking-wider mb-1">API Endpoints</p>
                    <div className="flex flex-wrap gap-1">
                      {backendScope.map((s, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.03] text-text-muted border border-white/[0.04] font-mono">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Approval — compact, inline */}
          {isActive && plan.status === 'pending_approval' && (
            <div className="px-4 py-3 border-t border-white/[0.04] bg-white/[0.01]">
              <ApprovalControls plan={plan} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
