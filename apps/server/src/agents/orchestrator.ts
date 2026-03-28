/**
 * Orchestrator — MaxClaw + OpenClaw execution control.
 *
 * MaxClaw:  High-level strategy — analyzes the user request, decides which
 *           agents to activate, creates the execution plan, and arbitrates
 *           conflicts between agents.
 *
 * OpenClaw: Execution dispatch — takes MaxClaw's strategy and dispatches
 *           tasks to the correct agents in the correct order, monitors
 *           their progress, and handles sequencing/dependencies.
 *
 * Flow:
 *   User prompt → MaxClaw (strategy) → OpenClaw (dispatch) → Agents → Results
 */

import {
  type AgentRole,
  type AgentConfig,
  getAgent,
  getAgentCredentials,
  resolveActiveAgents,
  getAlwaysActiveAgents,
} from './agentRegistry'
import { type AgentTask, type AgentTaskResult, dispatchToAgent } from './agentDispatch'
import { type StatusPayload, emitAgentStatus } from './statusEmitter'

// ─── Execution strategy (MaxClaw output) ─────────────────────

export interface ExecutionStrategy {
  /** Original user request */
  userRequest: string
  /** High-level approach description */
  approach: string
  /** Ordered list of agent tasks to execute */
  tasks: AgentTask[]
  /** Which agents are activated for this request */
  activeAgents: AgentRole[]
  /** Whether image generation is needed */
  needsImage: boolean
  /** Whether mobile output is needed */
  needsMobile: 'android' | 'ios' | 'both' | 'none'
  /** Whether DevOps complexity is needed */
  needsDevOps: boolean
  /** Estimated complexity */
  complexity: 'low' | 'medium' | 'high'
  /** Memory context injected */
  memoryContext?: string
}

// ─── Execution result (final output) ─────────────────────────

export interface ExecutionResult {
  /** Whether the full pipeline succeeded */
  success: boolean
  /** Results from each agent task */
  taskResults: AgentTaskResult[]
  /** Errors encountered (if any) */
  errors: Array<{ agent: AgentRole; error: string }>
  /** Duration of the full execution */
  durationMs: number
  /** Final status */
  status: 'complete' | 'partial' | 'failed'
}

// ─── Conflict record ─────────────────────────────────────────

export interface ConflictRecord {
  agentA: AgentRole
  agentB: AgentRole
  resource: string
  resolution: string
  resolvedBy: 'maxclaw' | 'priority' | 'manual'
  timestamp: string
}

// ─── MaxClaw — Strategy Orchestrator ─────────────────────────

/**
 * MaxClaw analyzes the user's request and produces an execution strategy.
 * This is the "brain" that decides what to do and in what order.
 */
export function createExecutionStrategy(
  userRequest: string,
  options?: {
    memoryContext?: string
    repoContext?: string
    existingPlan?: Record<string, unknown>
    mode?: 'build' | 'repair' | 'continuation'
    complaint?: string
  }
): ExecutionStrategy {
  const activeAgents = resolveActiveAgents(userRequest)
  const activeRoles = activeAgents.map(a => a.role)

  // Detect specialist needs
  const lower = userRequest.toLowerCase()
  const needsImage = activeRoles.includes('image')
  const needsAndroid = activeRoles.includes('android')
  const needsIos = activeRoles.includes('ios')
  const needsDevOps = activeRoles.includes('devops')
  const needsMobile: ExecutionStrategy['needsMobile'] =
    needsAndroid && needsIos ? 'both' :
    needsAndroid ? 'android' :
    needsIos ? 'ios' : 'none'

  // Estimate complexity
  const featureIndicators = ['authentication', 'payment', 'stripe', 'supabase', 'real-time', 'websocket', 'api', 'database', 'admin', 'dashboard']
  const featureCount = featureIndicators.filter(f => lower.includes(f)).length
  const complexity: ExecutionStrategy['complexity'] =
    featureCount >= 4 || needsMobile !== 'none' ? 'high' :
    featureCount >= 2 ? 'medium' : 'low'

  // Build task sequence based on mode
  const tasks = buildTaskSequence(options?.mode ?? 'build', activeRoles, {
    userRequest,
    complaint: options?.complaint,
    existingPlan: options?.existingPlan,
    memoryContext: options?.memoryContext,
    repoContext: options?.repoContext,
    needsImage,
    needsMobile,
    needsDevOps,
  })

  const approach = options?.mode === 'repair'
    ? `Targeted repair: analyze complaint, identify affected files, regenerate with fixes applied.`
    : options?.mode === 'continuation'
    ? `Continuation build: extend existing workspace with new pages/features. Preserve existing files, generate only new content, update routing.`
    : `Full build pipeline: plan → scaffold → install → generate frontend + backend → fix errors → QA → deploy prep.`

  return {
    userRequest,
    approach,
    tasks,
    activeAgents: activeRoles,
    needsImage,
    needsMobile,
    needsDevOps,
    complexity,
    memoryContext: options?.memoryContext,
  }
}

// ─── Task sequence builder ───────────────────────────────────

function buildTaskSequence(
  mode: 'build' | 'repair' | 'continuation',
  activeRoles: AgentRole[],
  context: {
    userRequest: string
    complaint?: string
    existingPlan?: Record<string, unknown>
    memoryContext?: string
    repoContext?: string
    needsImage: boolean
    needsMobile: ExecutionStrategy['needsMobile']
    needsDevOps: boolean
  }
): AgentTask[] {
  const tasks: AgentTask[] = []
  let order = 1

  if (mode === 'repair') {
    // Repair mode: fixer → qa
    tasks.push({
      id: `task-${order}`,
      agent: 'fixer',
      action: 'repair',
      input: {
        complaint: context.complaint ?? context.userRequest,
        repoContext: context.repoContext,
      },
      order: order++,
      status: 'pending',
      dependsOn: [],
    })
    tasks.push({
      id: `task-${order}`,
      agent: 'qa',
      action: 'validate_repair',
      input: { complaint: context.complaint ?? context.userRequest },
      order: order++,
      status: 'pending',
      dependsOn: [`task-${order - 2}`],
    })
    return tasks
  }

  if (mode === 'continuation') {
    // Continuation: planner (incremental) → frontend/backend → fixer → qa
    tasks.push({
      id: `task-${order}`,
      agent: 'planner',
      action: 'plan_continuation',
      input: {
        userRequest: context.userRequest,
        repoContext: context.repoContext,
        memoryContext: context.memoryContext,
      },
      order: order++,
      status: 'pending',
      dependsOn: [],
    })
    tasks.push({
      id: `task-${order}`,
      agent: 'frontend',
      action: 'generate_continuation',
      input: { userRequest: context.userRequest },
      order: order++,
      status: 'pending',
      dependsOn: [`task-${order - 2}`],
    })
    if (activeRoles.includes('backend')) {
      tasks.push({
        id: `task-${order}`,
        agent: 'backend',
        action: 'generate_continuation',
        input: { userRequest: context.userRequest },
        order: order++,
        status: 'pending',
        dependsOn: [`task-1`],
      })
    }
    tasks.push({
      id: `task-${order}`,
      agent: 'fixer',
      action: 'validate_and_fix',
      input: {},
      order: order++,
      status: 'pending',
      dependsOn: [`task-${order - 2}`, `task-${order - 3}`],
    })
    tasks.push({
      id: `task-${order}`,
      agent: 'qa',
      action: 'validate',
      input: {},
      order: order++,
      status: 'pending',
      dependsOn: [`task-${order - 2}`],
    })
    return tasks
  }

  // Full build mode
  // 1. Plan
  tasks.push({
    id: `task-${order}`,
    agent: 'planner',
    action: 'generate_plan',
    input: {
      userRequest: context.userRequest,
      memoryContext: context.memoryContext,
      repoContext: context.repoContext,
    },
    order: order++,
    status: 'pending',
    dependsOn: [],
  })

  // 2. Environment setup
  tasks.push({
    id: `task-${order}`,
    agent: 'installer',
    action: 'scaffold_and_install',
    input: {},
    order: order++,
    status: 'pending',
    dependsOn: [`task-1`],
  })

  // 3. Frontend generation
  tasks.push({
    id: `task-${order}`,
    agent: 'frontend',
    action: 'generate',
    input: {},
    order: order++,
    status: 'pending',
    dependsOn: [`task-2`],
  })

  // 4. Backend generation
  tasks.push({
    id: `task-${order}`,
    agent: 'backend',
    action: 'generate',
    input: {},
    order: order++,
    status: 'pending',
    dependsOn: [`task-2`],
  })

  // 5. Fixer — auto-fix any errors
  tasks.push({
    id: `task-${order}`,
    agent: 'fixer',
    action: 'validate_and_fix',
    input: {},
    order: order++,
    status: 'pending',
    dependsOn: [`task-3`, `task-4`],
  })

  // 6. QA / Hardening
  tasks.push({
    id: `task-${order}`,
    agent: 'qa',
    action: 'validate_and_harden',
    input: {},
    order: order++,
    status: 'pending',
    dependsOn: [`task-5`],
  })

  // 7. Deploy preparation
  tasks.push({
    id: `task-${order}`,
    agent: 'deploy',
    action: 'prepare',
    input: {},
    order: order++,
    status: 'pending',
    dependsOn: [`task-6`],
  })

  // 8. Conditional: Image generation (parallel with frontend)
  if (context.needsImage && activeRoles.includes('image')) {
    tasks.push({
      id: `task-${order}`,
      agent: 'image',
      action: 'generate_assets',
      input: { userRequest: context.userRequest },
      order: order++,
      status: 'pending',
      dependsOn: [`task-1`], // only depends on plan
    })
  }

  // 9. Conditional: DevOps
  if (context.needsDevOps && activeRoles.includes('devops')) {
    tasks.push({
      id: `task-${order}`,
      agent: 'devops',
      action: 'configure_infrastructure',
      input: { userRequest: context.userRequest },
      order: order++,
      status: 'pending',
      dependsOn: [`task-6`], // after QA
    })
  }

  // 10. Conditional: Mobile
  if (context.needsMobile !== 'none') {
    if (context.needsMobile === 'android' || context.needsMobile === 'both') {
      if (activeRoles.includes('android')) {
        tasks.push({
          id: `task-${order}`,
          agent: 'android',
          action: 'generate_mobile',
          input: { userRequest: context.userRequest },
          order: order++,
          status: 'pending',
          dependsOn: [`task-3`], // after frontend
        })
      }
    }
    if (context.needsMobile === 'ios' || context.needsMobile === 'both') {
      if (activeRoles.includes('ios')) {
        tasks.push({
          id: `task-${order}`,
          agent: 'ios',
          action: 'generate_mobile',
          input: { userRequest: context.userRequest },
          order: order++,
          status: 'pending',
          dependsOn: [`task-3`], // after frontend
        })
      }
    }
  }

  return tasks
}

// ─── OpenClaw — Execution Dispatcher ─────────────────────────

/**
 * OpenClaw executes the strategy by dispatching tasks in dependency order.
 * It handles sequencing, parallel execution where possible, and error recovery.
 */
export async function executeStrategy(
  strategy: ExecutionStrategy,
  callbacks: {
    onTaskStart?: (task: AgentTask) => void
    onTaskComplete?: (task: AgentTask, result: AgentTaskResult) => void
    onTaskFailed?: (task: AgentTask, error: string) => void
    onConflict?: (conflict: ConflictRecord) => void
    onStatusUpdate?: (payload: StatusPayload) => void
  } = {}
): Promise<ExecutionResult> {
  const start = Date.now()
  const taskResults: AgentTaskResult[] = []
  const errors: Array<{ agent: AgentRole; error: string }> = []
  const completed = new Set<string>()

  // Clone tasks to track mutable state
  const tasks = strategy.tasks.map(t => ({ ...t }))

  // Emit initial status
  callbacks.onStatusUpdate?.({
    type: 'pipeline',
    status: 'running',
    agent: 'openclaw',
    message: `Starting ${strategy.approach}`,
    timestamp: new Date().toISOString(),
    meta: {
      totalTasks: tasks.length,
      completedTasks: 0,
      activeAgents: strategy.activeAgents,
    },
  })

  // Execute tasks in dependency order
  while (completed.size < tasks.length) {
    // Find tasks that are ready to run (all dependencies completed)
    const ready = tasks.filter(t =>
      t.status === 'pending' &&
      t.dependsOn.every(dep => completed.has(dep))
    )

    if (ready.length === 0) {
      // Check if we're stuck (remaining tasks have unmet dependencies on failed tasks)
      const remaining = tasks.filter(t => t.status === 'pending')
      if (remaining.length > 0) {
        for (const t of remaining) {
          t.status = 'skipped'
          completed.add(t.id)
          errors.push({
            agent: t.agent,
            error: `Skipped — dependency not met`,
          })
        }
      }
      break
    }

    // Execute ready tasks (in parallel when possible)
    const results = await Promise.allSettled(
      ready.map(async (task) => {
        task.status = 'running'
        callbacks.onTaskStart?.(task)

        callbacks.onStatusUpdate?.({
          type: 'agent',
          status: 'running',
          agent: task.agent,
          message: `${task.agent}: ${task.action}`,
          timestamp: new Date().toISOString(),
          meta: { taskId: task.id },
        })

        try {
          const result = await dispatchToAgent(task)
          task.status = 'completed'
          completed.add(task.id)
          callbacks.onTaskComplete?.(task, result)

          callbacks.onStatusUpdate?.({
            type: 'agent',
            status: 'complete',
            agent: task.agent,
            message: `${task.agent}: ${task.action} complete`,
            timestamp: new Date().toISOString(),
            meta: { taskId: task.id, durationMs: result.durationMs },
          })

          return result
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          task.status = 'failed'
          completed.add(task.id)
          errors.push({ agent: task.agent, error: errMsg })
          callbacks.onTaskFailed?.(task, errMsg)

          callbacks.onStatusUpdate?.({
            type: 'agent',
            status: 'error',
            agent: task.agent,
            message: `${task.agent}: ${task.action} failed — ${errMsg.slice(0, 100)}`,
            timestamp: new Date().toISOString(),
            meta: { taskId: task.id, error: errMsg },
          })

          // Return a failure result
          const failResult: AgentTaskResult = {
            taskId: task.id,
            agent: task.agent,
            success: false,
            output: null,
            error: errMsg,
            durationMs: 0,
          }
          return failResult
        }
      })
    )

    // Collect results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        taskResults.push(result.value)
      }
    }
  }

  const durationMs = Date.now() - start
  const failedCount = errors.length
  const status: ExecutionResult['status'] =
    failedCount === 0 ? 'complete' :
    failedCount < tasks.length ? 'partial' : 'failed'

  callbacks.onStatusUpdate?.({
    type: 'pipeline',
    status: status === 'complete' ? 'complete' : status === 'partial' ? 'recovering' : 'error',
    agent: 'openclaw',
    message: `Pipeline ${status}: ${tasks.length - failedCount}/${tasks.length} tasks succeeded (${durationMs}ms)`,
    timestamp: new Date().toISOString(),
    meta: {
      totalTasks: tasks.length,
      completedTasks: tasks.length - failedCount,
      failedTasks: failedCount,
      durationMs,
    },
  })

  return {
    success: failedCount === 0,
    taskResults,
    errors,
    durationMs,
    status,
  }
}

// ─── Conflict resolution ─────────────────────────────────────

/**
 * MaxClaw conflict resolution — when two agents try to modify the same resource.
 * Uses priority order: higher-priority agent wins unless overridden.
 */
export function resolveConflict(
  agentA: AgentRole,
  agentB: AgentRole,
  resource: string
): ConflictRecord {
  const configA = getAgent(agentA)
  const configB = getAgent(agentB)

  // Lower priority number = higher priority
  const priorityA = configA?.priority ?? 999
  const priorityB = configB?.priority ?? 999

  const winner = priorityA <= priorityB ? agentA : agentB
  const loser = priorityA <= priorityB ? agentB : agentA

  const record: ConflictRecord = {
    agentA,
    agentB,
    resource,
    resolution: `${winner} has priority over ${loser} for resource: ${resource}`,
    resolvedBy: 'priority',
    timestamp: new Date().toISOString(),
  }

  console.log(
    `[Orchestrator] Conflict resolved: ${agentA} vs ${agentB} for "${resource}" → winner: ${winner} (priority)`
  )

  return record
}
