/**
 * Memory Service — Phase 7 Slice 1
 *
 * Provides persistent cross-session memory for MaxClaw.
 *
 * Two scopes:
 *   - ProjectMemory: per-project decisions, failures, confirmed stack, build outcomes
 *   - UserMemory:    per-user preferences, project history, known integrations
 *
 * Design principles:
 *   - Structured fields are the primary source of truth (not just text blobs)
 *   - All writes are async/non-blocking — never block the build or chat flow
 *   - Context injection is compact and high-signal (not a raw dump)
 *   - Observability: every read and write is logged with [Memory] prefix
 */

import fs from 'fs'
import path from 'path'
import { prisma } from '../lib/prisma'
import { Prisma } from '@prisma/client'

// ─── Type definitions for JSON fields ────────────────────────

export interface StackPreference {
  frontend: string[]
  backend: string[]
  database: string[]
  auth: string[]
  deployment?: string[]
}

export interface FailureRecord {
  at: string        // ISO timestamp
  phase: string     // build phase where failure occurred
  category: string  // failure category (e.g. 'install_failure', 'scaffold_failure')
  error: string     // short error message (max 200 chars)
  fixed: boolean    // whether it was auto-repaired
  fix?: string      // what fixed it (e.g. '--legacy-peer-deps')
}

export interface DecisionRecord {
  at: string  // ISO timestamp
  type: 'plan_approved' | 'plan_rejected' | 'plan_modified' | 'stack_confirmed' | 'integration_added'
  summary: string  // max 200 chars
}

export interface ProjectHistoryEntry {
  projectId: string
  name: string
  summary: string  // max 200 chars
  status: 'complete' | 'failed' | 'building'
  builtAt: string  // ISO timestamp
}

export interface LastBuildMeta {
  completedAt: string
  fileCount: number
  totalBytes: number
  previewPort?: number
  workerName?: string
}

// ─── Context retrieval (for planner injection) ────────────────

/**
 * Returns a compact, high-signal context string for planner injection.
 * Reads ProjectMemory for the given project.
 * Returns '' if no memory exists or on error (never throws).
 */
export async function getProjectContext(projectId: string, userId: string): Promise<string> {
  try {
    const memory = await prisma.projectMemory.findUnique({
      where: { projectId },
    })

    if (!memory || memory.userId !== userId) {
      console.log(`[Memory] No project memory for ${projectId} — starting fresh`)
      return ''
    }

    const lines: string[] = ['=== PROJECT MEMORY ===']

    if (memory.approvedDirection) {
      lines.push(`Project direction: ${memory.approvedDirection}`)
    }

    if (memory.preferredStack) {
      const stack = memory.preferredStack as unknown as StackPreference
      const parts: string[] = []
      if (stack.frontend?.length) parts.push(`${stack.frontend.join(' + ')} (frontend)`)
      if (stack.backend?.length)  parts.push(`${stack.backend.join(' + ')} (backend)`)
      if (stack.database?.length) parts.push(`${stack.database.join(' + ')} (database)`)
      if (stack.auth?.length)     parts.push(`${stack.auth.join(' + ')} (auth)`)
      if (stack.deployment?.length) parts.push(`${stack.deployment.join(' + ')} (deployment)`)
      if (parts.length) lines.push(`Preferred stack: ${parts.join(', ')}`)
    }

    if (memory.authProvider) {
      lines.push(`Auth provider: ${memory.authProvider}`)
    }

    const integrations = memory.integrations as unknown as string[]
    if (integrations?.length) {
      lines.push(`Integrations: ${integrations.join(', ')}`)
    }

    if (memory.lastBuildStatus && memory.lastBuildMeta) {
      const meta = memory.lastBuildMeta as unknown as LastBuildMeta
      const date = meta.completedAt ? new Date(meta.completedAt).toLocaleDateString() : 'unknown'
      const sizeMb = meta.totalBytes ? ` ${(meta.totalBytes / 1024 / 1024).toFixed(1)} MB` : ''
      const files = meta.fileCount ? ` ${meta.fileCount} files,` : ''
      lines.push(`Last build: ${memory.lastBuildStatus} (${date},${files}${sizeMb})`)
    }

    const failures = memory.failureHistory as unknown as FailureRecord[]
    const unresolvedFailures = failures?.filter(f => !f.fixed).slice(-3) ?? []
    if (unresolvedFailures.length) {
      lines.push(`Unresolved failures:`)
      unresolvedFailures.forEach(f => {
        lines.push(`  - [${f.category}] ${f.phase}: ${f.error.slice(0, 100)}`)
      })
    }

    const decisions = memory.decisions as unknown as DecisionRecord[]
    const recentDecisions = decisions?.slice(-5) ?? []
    if (recentDecisions.length) {
      lines.push(`Key decisions:`)
      recentDecisions.forEach(d => {
        lines.push(`  - ${d.summary}`)
      })
    }

    lines.push('=== END PROJECT MEMORY ===')

    const context = lines.join('\n')
    console.log(
      `[Memory] Read project context for ${projectId}` +
      ` (${context.length} chars, ${decisions?.length ?? 0} decisions,` +
      ` ${failures?.length ?? 0} failures, scope=project)`
    )
    return context
  } catch (err) {
    console.warn('[Memory] getProjectContext failed (non-fatal):', err)
    return ''
  }
}

/**
 * Returns a compact user context string for planner injection.
 * Returns '' if no memory exists or on error (never throws).
 */
export async function getUserContext(userId: string): Promise<string> {
  try {
    const memory = await prisma.userMemory.findUnique({
      where: { userId },
    })

    if (!memory) {
      console.log(`[Memory] No user memory for ${userId} — starting fresh`)
      return ''
    }

    const lines: string[] = ['=== USER MEMORY ===']

    if (memory.preferredStack) {
      const stack = memory.preferredStack as unknown as StackPreference
      const parts: string[] = []
      if (stack.frontend?.length) parts.push(`${stack.frontend.join(' + ')} (frontend)`)
      if (stack.backend?.length)  parts.push(`${stack.backend.join(' + ')} (backend)`)
      if (stack.database?.length) parts.push(`${stack.database.join(' + ')} (database)`)
      if (stack.auth?.length)     parts.push(`${stack.auth.join(' + ')} (auth)`)
      if (parts.length) lines.push(`Preferred stack: ${parts.join(', ')}`)
    }

    const integrations = memory.knownIntegrations as unknown as string[]
    if (integrations?.length) {
      lines.push(`Known integrations: ${integrations.join(', ')}`)
    }

    const history = memory.projectHistory as unknown as ProjectHistoryEntry[]
    if (history?.length) {
      const complete = history.filter(p => p.status === 'complete').length
      const failed   = history.filter(p => p.status === 'failed').length
      lines.push(`Project history: ${history.length} projects (${complete} complete, ${failed} failed)`)
      // Show last 2 for context
      history.slice(-2).forEach(p => {
        lines.push(`  - ${p.name}: ${p.summary.slice(0, 100)} [${p.status}]`)
      })
    }

    lines.push('=== END USER MEMORY ===')

    const context = lines.join('\n')
    console.log(
      `[Memory] Read user context for ${userId}` +
      ` (${context.length} chars, ${history?.length ?? 0} projects in history, scope=user)`
    )
    return context
  } catch (err) {
    console.warn('[Memory] getUserContext failed (non-fatal):', err)
    return ''
  }
}

/**
 * Combines project + user context into a single block for planner injection.
 * Returns '' if both are empty.
 */
export async function getCombinedContext(projectId: string, userId: string): Promise<string> {
  const [projectCtx, userCtx] = await Promise.all([
    getProjectContext(projectId, userId),
    getUserContext(userId),
  ])
  const parts = [projectCtx, userCtx].filter(Boolean)
  return parts.join('\n\n')
}

// ─── Write operations (all async/non-blocking) ────────────────

/**
 * Record that a plan was approved.
 * Updates: approvedDirection, preferredStack, authProvider, integrations, decisions.
 * Safe to call without await — errors are caught and logged.
 */
export async function recordPlanApproved(
  projectId: string,
  userId: string,
  plan: {
    summary: string
    techStack: Record<string, unknown>
    integrations: string[]
  }
): Promise<void> {
  try {
    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })

    const stack = plan.techStack as Record<string, string[]>
    const preferredStack: StackPreference = {
      frontend:   Array.isArray(stack.frontend)   ? stack.frontend   : [],
      backend:    Array.isArray(stack.backend)    ? stack.backend    : [],
      database:   Array.isArray(stack.database)   ? stack.database   : [],
      auth:       Array.isArray(stack.auth)       ? stack.auth       : [],
      deployment: Array.isArray(stack.deployment) ? stack.deployment : [],
    }

    // Infer auth provider from stack.auth array
    const authArr = preferredStack.auth
    let authProvider: string | null = null
    if (authArr.some(a => a.toLowerCase().includes('supabase')))  authProvider = 'supabase'
    else if (authArr.some(a => a.toLowerCase().includes('clerk')))     authProvider = 'clerk'
    else if (authArr.some(a => a.toLowerCase().includes('nextauth')))  authProvider = 'nextauth'
    else if (authArr.some(a => a.toLowerCase().includes('jwt')))       authProvider = 'jwt'
    else if (authArr.length)                                           authProvider = authArr[0].toLowerCase()

    const newDecision: DecisionRecord = {
      at:      new Date().toISOString(),
      type:    'plan_approved',
      summary: `Plan approved: ${plan.summary.slice(0, 150)}`,
    }

    const decisions = ((existing?.decisions as unknown as DecisionRecord[]) ?? [])
    decisions.push(newDecision)
    const cappedDecisions = decisions.slice(-20)

    const existingIntegrations = (existing?.integrations as unknown as string[]) ?? []
    const mergedIntegrations = Array.from(new Set([...existingIntegrations, ...plan.integrations]))

    await prisma.projectMemory.upsert({
      where: { projectId },
      create: {
        projectId,
        userId,
        approvedDirection: plan.summary.slice(0, 500),
        preferredStack:    preferredStack as unknown as Prisma.InputJsonValue,
        authProvider,
        integrations:      mergedIntegrations as unknown as Prisma.InputJsonValue,
        decisions:         cappedDecisions as unknown as Prisma.InputJsonValue,
        failureHistory:    [] as unknown as Prisma.InputJsonValue,
      },
      update: {
        approvedDirection: plan.summary.slice(0, 500),
        preferredStack:    preferredStack as unknown as Prisma.InputJsonValue,
        authProvider,
        integrations:      mergedIntegrations as unknown as Prisma.InputJsonValue,
        decisions:         cappedDecisions as unknown as Prisma.InputJsonValue,
        version:           { increment: 1 },
      },
    })

    console.log(
      `[Memory] Updated ProjectMemory for ${projectId}` +
      ` (plan_approved, stack=${JSON.stringify(preferredStack.frontend)},` +
      ` integrations=[${mergedIntegrations.join(', ')}], scope=project, updated=decisions+stack)`
    )
  } catch (err) {
    console.warn('[Memory] recordPlanApproved failed (non-fatal):', err)
  }
}

/**
 * Record a successful build completion.
 * Updates: lastBuildStatus, lastBuildMeta, decisions.
 * Also updates UserMemory.projectHistory.
 * Safe to call without await.
 */
export async function recordBuildComplete(
  projectId: string,
  userId: string,
  meta: {
    fileCount: number
    totalBytes: number
    previewPort?: number
    workerName?: string
    projectName: string
    projectSummary: string
  }
): Promise<void> {
  try {
    const buildMeta: LastBuildMeta = {
      completedAt: new Date().toISOString(),
      fileCount:   meta.fileCount,
      totalBytes:  meta.totalBytes,
      previewPort: meta.previewPort,
      workerName:  meta.workerName,
    }

    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })
    const decisions = ((existing?.decisions as unknown as DecisionRecord[]) ?? [])
    decisions.push({
      at:      new Date().toISOString(),
      type:    'stack_confirmed',
      summary: `Build complete: ${meta.fileCount} files, ${(meta.totalBytes / 1024).toFixed(0)} KB`,
    })
    const cappedDecisions = decisions.slice(-20)

    await prisma.projectMemory.upsert({
      where: { projectId },
      create: {
        projectId,
        userId,
        lastBuildStatus: 'complete',
        lastBuildMeta:   buildMeta as unknown as Prisma.InputJsonValue,
        decisions:       cappedDecisions as unknown as Prisma.InputJsonValue,
        failureHistory:  [] as unknown as Prisma.InputJsonValue,
        integrations:    [] as unknown as Prisma.InputJsonValue,
      },
      update: {
        lastBuildStatus: 'complete',
        lastBuildMeta:   buildMeta as unknown as Prisma.InputJsonValue,
        decisions:       cappedDecisions as unknown as Prisma.InputJsonValue,
        version:         { increment: 1 },
      },
    })

    console.log(
      `[Memory] Updated ProjectMemory for ${projectId}` +
      ` (lastBuildStatus=complete, ${meta.fileCount} files, scope=project, updated=lastBuildMeta+decisions)`
    )

    // Update UserMemory.projectHistory (non-blocking)
    void updateUserProjectHistory(userId, {
      projectId,
      name:    meta.projectName,
      summary: meta.projectSummary.slice(0, 150),
      status:  'complete',
      builtAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[Memory] recordBuildComplete failed (non-fatal):', err)
  }
}

/**
 * Record a build failure.
 * Updates: lastBuildStatus, failureHistory.
 * Also updates UserMemory.projectHistory.
 * Safe to call without await.
 */
export async function recordBuildFailed(
  projectId: string,
  userId: string,
  failure: {
    phase: string
    category: string
    error: string
    projectName: string
    projectSummary: string
  }
): Promise<void> {
  try {
    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })
    const failures = ((existing?.failureHistory as unknown as FailureRecord[]) ?? [])

    failures.push({
      at:       new Date().toISOString(),
      phase:    failure.phase,
      category: failure.category,
      error:    failure.error.slice(0, 200),
      fixed:    false,
    })
    const cappedFailures = failures.slice(-10)

    await prisma.projectMemory.upsert({
      where: { projectId },
      create: {
        projectId,
        userId,
        lastBuildStatus: 'failed',
        failureHistory:  cappedFailures as unknown as Prisma.InputJsonValue,
        decisions:       [] as unknown as Prisma.InputJsonValue,
        integrations:    [] as unknown as Prisma.InputJsonValue,
      },
      update: {
        lastBuildStatus: 'failed',
        failureHistory:  cappedFailures as unknown as Prisma.InputJsonValue,
        version:         { increment: 1 },
      },
    })

    console.log(
      `[Memory] Updated ProjectMemory for ${projectId}` +
      ` (lastBuildStatus=failed, category=${failure.category},` +
      ` ${cappedFailures.length} total failures, scope=project, updated=failureHistory)`
    )

    void updateUserProjectHistory(userId, {
      projectId,
      name:    failure.projectName,
      summary: failure.projectSummary.slice(0, 150),
      status:  'failed',
      builtAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('[Memory] recordBuildFailed failed (non-fatal):', err)
  }
}

/**
 * Mark the most recent unresolved failure as fixed after a successful repair.
 * Safe to call without await.
 */
export async function recordRepairSuccess(
  projectId: string,
  fix: string
): Promise<void> {
  try {
    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })
    if (!existing) return

    const failures = (existing.failureHistory as unknown as FailureRecord[]) ?? []
    const lastUnresolved = [...failures].reverse().find(f => !f.fixed)
    if (lastUnresolved) {
      lastUnresolved.fixed = true
      lastUnresolved.fix   = fix.slice(0, 200)
    }

    await prisma.projectMemory.update({
      where: { projectId },
      data: {
        failureHistory: failures as unknown as Prisma.InputJsonValue,
        version:        { increment: 1 },
      },
    })

    console.log(
      `[Memory] Updated ProjectMemory for ${projectId}` +
      ` (repair_success, fix="${fix.slice(0, 60)}", scope=project, updated=failureHistory)`
    )
  } catch (err) {
    console.warn('[Memory] recordRepairSuccess failed (non-fatal):', err)
  }
}

// ─── User memory helpers ──────────────────────────────────────

async function updateUserProjectHistory(
  userId: string,
  entry: ProjectHistoryEntry
): Promise<void> {
  try {
    const existing = await prisma.userMemory.findUnique({ where: { userId } })
    const history  = ((existing?.projectHistory as unknown as ProjectHistoryEntry[]) ?? [])

    const idx = history.findIndex(p => p.projectId === entry.projectId)
    if (idx >= 0) {
      history[idx] = entry
    } else {
      history.push(entry)
    }
    const cappedHistory = history.slice(-20)

    // Pull preferredStack from project memory if available
    const projectMemory = await prisma.projectMemory.findUnique({
      where: { projectId: entry.projectId },
    })
    const preferredStack = (projectMemory?.preferredStack ?? existing?.preferredStack ?? null) as Prisma.InputJsonValue | null

    // Merge known integrations
    const projectIntegrations = (projectMemory?.integrations as unknown as string[]) ?? []
    const existingIntegrations = (existing?.knownIntegrations as unknown as string[]) ?? []
    const mergedIntegrations   = Array.from(new Set([...existingIntegrations, ...projectIntegrations]))

    await prisma.userMemory.upsert({
      where: { userId },
      create: {
        userId,
        projectHistory:    cappedHistory as unknown as Prisma.InputJsonValue,
        preferredStack:    preferredStack ?? Prisma.JsonNull,
        knownIntegrations: mergedIntegrations as unknown as Prisma.InputJsonValue,
      },
      update: {
        projectHistory:    cappedHistory as unknown as Prisma.InputJsonValue,
        preferredStack:    preferredStack ?? Prisma.JsonNull,
        knownIntegrations: mergedIntegrations as unknown as Prisma.InputJsonValue,
        version:           { increment: 1 },
      },
    })

    console.log(
      `[Memory] Updated UserMemory for ${userId}` +
      ` (${cappedHistory.length} projects, ${mergedIntegrations.length} integrations,` +
      ` scope=user, updated=projectHistory+knownIntegrations)`
    )
  } catch (err) {
    console.warn('[Memory] updateUserProjectHistory failed (non-fatal):', err)
  }
}

// ─── Workspace memory.md (supplemental artifact) ─────────────

/**
 * Writes a memory.md file to the workspace directory.
 * Supplemental only — helps the autonomous repair system at failure time.
 * Synchronous write; errors are caught and logged.
 */
export function writeWorkspaceMemoryFile(
  workspacePath: string,
  context: {
    projectName: string
    projectId: string
    planSummary: string
    techStack: Record<string, unknown>
    integrations: string[]
    buildTimestamp: string
  }
): void {
  try {
    const stack = context.techStack as Record<string, string[]>
    const lines = [
      `# CodedXP Workspace Memory`,
      ``,
      `**Project:** ${context.projectName}`,
      `**Project ID:** ${context.projectId}`,
      `**Built:** ${context.buildTimestamp}`,
      ``,
      `## Project Summary`,
      ``,
      context.planSummary,
      ``,
      `## Tech Stack`,
      ``,
      `- **Frontend:** ${(stack.frontend ?? []).join(', ') || 'N/A'}`,
      `- **Backend:** ${(stack.backend ?? []).join(', ') || 'N/A'}`,
      `- **Database:** ${(stack.database ?? []).join(', ') || 'N/A'}`,
      `- **Auth:** ${(stack.auth ?? []).join(', ') || 'N/A'}`,
      `- **Deployment:** ${(stack.deployment ?? []).join(', ') || 'N/A'}`,
      ``,
      `## Integrations`,
      ``,
      context.integrations.length
        ? context.integrations.map(i => `- ${i}`).join('\n')
        : '- None',
      ``,
      `---`,
      `*Auto-generated by CodedXP. Used by the autonomous repair system for context.*`,
    ]

    const memoryPath = path.join(workspacePath, 'memory.md')
    fs.writeFileSync(memoryPath, lines.join('\n'), 'utf-8')
    console.log(`[Memory] Wrote workspace memory.md to ${memoryPath} (scope=workspace)`)
  } catch (err) {
    console.warn('[Memory] writeWorkspaceMemoryFile failed (non-fatal):', err)
  }
}
