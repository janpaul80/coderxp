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
import type { WorkspaceSnapshot } from './workspaceIndexer'

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

// ─── User Rules (explicit user-defined instructions) ─────────

export interface UserRule {
  id: string
  content: string
  category: 'stack' | 'style' | 'deploy' | 'install' | 'general'
  active: boolean
  createdAt: string  // ISO
}

/**
 * Get all user-level rules.
 * Returns [] if no memory exists or on error.
 */
export async function getUserRules(userId: string): Promise<UserRule[]> {
  try {
    const memory = await prisma.userMemory.findUnique({ where: { userId } })
    if (!memory) return []
    return ((memory as Record<string, unknown>).userRules as UserRule[]) ?? []
  } catch (err) {
    console.warn('[Memory] getUserRules failed (non-fatal):', err)
    return []
  }
}

/**
 * Add or update a user-level rule.
 * If rule.id already exists, it is replaced. Otherwise appended.
 */
export async function upsertUserRule(userId: string, rule: UserRule): Promise<void> {
  try {
    const existing = await prisma.userMemory.findUnique({ where: { userId } })
    const rules = (((existing as Record<string, unknown> | null)?.userRules as UserRule[]) ?? [])
    const idx = rules.findIndex(r => r.id === rule.id)
    if (idx >= 0) {
      rules[idx] = rule
    } else {
      rules.push(rule)
    }
    await prisma.userMemory.upsert({
      where: { userId },
      create: {
        userId,
        userRules:         rules as unknown as Prisma.InputJsonValue,
        projectHistory:    [] as unknown as Prisma.InputJsonValue,
        knownIntegrations: [] as unknown as Prisma.InputJsonValue,
      },
      update: {
        userRules: rules as unknown as Prisma.InputJsonValue,
        version:   { increment: 1 },
      },
    })
    console.log(`[Memory] Upserted user rule ${rule.id} for ${userId} (category=${rule.category})`)
  } catch (err) {
    console.warn('[Memory] upsertUserRule failed (non-fatal):', err)
  }
}

/**
 * Delete a user-level rule by id.
 */
export async function deleteUserRule(userId: string, ruleId: string): Promise<void> {
  try {
    const existing = await prisma.userMemory.findUnique({ where: { userId } })
    if (!existing) return
    const rules = (((existing as Record<string, unknown>).userRules as UserRule[]) ?? []).filter(r => r.id !== ruleId)
    await prisma.userMemory.update({
      where: { userId },
      data: {
        userRules: rules as unknown as Prisma.InputJsonValue,
        version:   { increment: 1 },
      },
    })
    console.log(`[Memory] Deleted user rule ${ruleId} for ${userId}`)
  } catch (err) {
    console.warn('[Memory] deleteUserRule failed (non-fatal):', err)
  }
}

/**
 * Get all project-level rules.
 * Returns [] if no memory exists or on error.
 */
export async function getProjectRules(projectId: string): Promise<UserRule[]> {
  try {
    const memory = await prisma.projectMemory.findUnique({ where: { projectId } })
    if (!memory) return []
    return ((memory as Record<string, unknown>).projectRules as UserRule[]) ?? []
  } catch (err) {
    console.warn('[Memory] getProjectRules failed (non-fatal):', err)
    return []
  }
}

/**
 * Add or update a project-level rule.
 */
export async function upsertProjectRule(
  projectId: string,
  userId: string,
  rule: UserRule
): Promise<void> {
  try {
    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })
    const rules = (((existing as Record<string, unknown> | null)?.projectRules as UserRule[]) ?? [])
    const idx = rules.findIndex(r => r.id === rule.id)
    if (idx >= 0) {
      rules[idx] = rule
    } else {
      rules.push(rule)
    }
    await prisma.projectMemory.upsert({
      where: { projectId },
      create: {
        projectId,
        userId,
        projectRules:  rules as unknown as Prisma.InputJsonValue,
        failureHistory: [] as unknown as Prisma.InputJsonValue,
        decisions:      [] as unknown as Prisma.InputJsonValue,
        integrations:   [] as unknown as Prisma.InputJsonValue,
      },
      update: {
        projectRules: rules as unknown as Prisma.InputJsonValue,
        version:      { increment: 1 },
      },
    })
    console.log(`[Memory] Upserted project rule ${rule.id} for ${projectId} (category=${rule.category})`)
  } catch (err) {
    console.warn('[Memory] upsertProjectRule failed (non-fatal):', err)
  }
}

/**
 * Delete a project-level rule by id.
 */
export async function deleteProjectRule(projectId: string, ruleId: string): Promise<void> {
  try {
    const existing = await prisma.projectMemory.findUnique({ where: { projectId } })
    if (!existing) return
    const rules = (((existing as Record<string, unknown>).projectRules as UserRule[]) ?? []).filter(r => r.id !== ruleId)
    await prisma.projectMemory.update({
      where: { projectId },
      data: {
        projectRules: rules as unknown as Prisma.InputJsonValue,
        version:      { increment: 1 },
      },
    })
    console.log(`[Memory] Deleted project rule ${ruleId} for ${projectId}`)
  } catch (err) {
    console.warn('[Memory] deleteProjectRule failed (non-fatal):', err)
  }
}

/**
 * Build a compact rules block for injection into the AI system prompt.
 * Project rules override / supplement user rules.
 * Only active rules are included.
 * Returns '' if no active rules.
 */
export function buildRulesBlock(userRules: UserRule[], projectRules: UserRule[]): string {
  const activeUser    = userRules.filter(r => r.active)
  const activeProject = projectRules.filter(r => r.active)

  if (!activeUser.length && !activeProject.length) return ''

  const lines: string[] = ['=== USER RULES (always follow — higher priority than defaults) ===']

  if (activeUser.length) {
    lines.push('User-level rules:')
    activeUser.forEach(r => lines.push(`  - [${r.category}] ${r.content}`))
  }

  if (activeProject.length) {
    lines.push('Project-level rules (override user rules for this project):')
    activeProject.forEach(r => lines.push(`  - [${r.category}] ${r.content}`))
  }

  lines.push('=== END USER RULES ===')
  return lines.join('\n')
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

// ─── Repo Snapshot (Sprint 8) ─────────────────────────────────

/**
 * Store a WorkspaceSnapshot in ProjectMemory after a successful build.
 * Upserts the repoSnapshot field only — does not touch other memory fields.
 * Safe to call without await — errors are caught and logged.
 */
export async function storeRepoSnapshot(
  projectId: string,
  userId: string,
  snapshot: WorkspaceSnapshot
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.projectMemory as any).upsert({
      where: { projectId },
      create: {
        projectId,
        userId,
        repoSnapshot:   snapshot,
        failureHistory: [],
        decisions:      [],
        integrations:   [],
        projectRules:   [],
      },
      update: {
        repoSnapshot: snapshot,
        version:      { increment: 1 },
      },
    })
    console.log(
      `[Memory] Stored repoSnapshot for ${projectId}` +
      ` (${snapshot.totalFiles} files, ${snapshot.components.length} components,` +
      ` ${snapshot.routes.length} routes, ${snapshot.apiEndpoints.length} endpoints,` +
      ` scope=project, updated=repoSnapshot)`
    )
  } catch (err) {
    console.warn('[Memory] storeRepoSnapshot failed (non-fatal):', err)
  }
}

/**
 * Retrieve the stored WorkspaceSnapshot for a project.
 * Returns null if no snapshot exists or on error (never throws).
 */
export async function getRepoSnapshot(projectId: string): Promise<WorkspaceSnapshot | null> {
  try {
    const memory = await prisma.projectMemory.findUnique({ where: { projectId } })
    if (!memory) return null
    // Cast through Record to access repoSnapshot before Prisma client is regenerated
    const raw = (memory as Record<string, unknown>).repoSnapshot
    if (!raw) return null
    return raw as unknown as WorkspaceSnapshot
  } catch (err) {
    console.warn('[Memory] getRepoSnapshot failed (non-fatal):', err)
    return null
  }
}

/**
 * Format a WorkspaceSnapshot as a compact, high-signal context string.
 * Injected into planning, generation, repair, and continuation prompts.
 *
 * Design: compact and structured — helps the AI understand what already exists
 * without bloating the prompt. No raw file content is included.
 *
 * Example output:
 *   === REPO SNAPSHOT ===
 *   Captured: 2026-03-24 (42 files, 1.2 MB)
 *   Components: Home, Header, Login, Register, Dashboard, Pricing
 *   Routes: / → Home, /login → Login, /register → Register
 *   API endpoints: GET /api/status, POST /api/auth/login, GET /api/auth/me
 *   Prisma models: User, Session, Subscription
 *   Dependencies: react, react-router-dom, axios, tailwindcss, express, prisma
 *   === END REPO SNAPSHOT ===
 */
export function buildRepoContext(snapshot: WorkspaceSnapshot): string {
  const lines: string[] = ['=== REPO SNAPSHOT ===']

  // Header: timestamp + size
  const date = snapshot.capturedAt
    ? new Date(snapshot.capturedAt).toISOString().slice(0, 10)
    : 'unknown'
  const sizeMb = snapshot.totalBytes
    ? ` ${(snapshot.totalBytes / 1024 / 1024).toFixed(1)} MB`
    : ''
  lines.push(`Captured: ${date} (${snapshot.totalFiles} files,${sizeMb})`)

  // Components (cap at 20 for compactness)
  if (snapshot.components.length > 0) {
    const shown = snapshot.components.slice(0, 20)
    const extra = snapshot.components.length > 20 ? ` +${snapshot.components.length - 20} more` : ''
    lines.push(`Components: ${shown.join(', ')}${extra}`)
  }

  // Routes (cap at 15)
  if (snapshot.routes.length > 0) {
    const shown = snapshot.routes.slice(0, 15)
    const extra = snapshot.routes.length > 15 ? ` +${snapshot.routes.length - 15} more` : ''
    const routeStr = shown.map(r => `${r.path} → ${r.component}`).join(', ')
    lines.push(`Routes: ${routeStr}${extra}`)
  }

  // API endpoints (cap at 15)
  if (snapshot.apiEndpoints.length > 0) {
    const shown = snapshot.apiEndpoints.slice(0, 15)
    const extra = snapshot.apiEndpoints.length > 15 ? ` +${snapshot.apiEndpoints.length - 15} more` : ''
    const epStr = shown.map(e => `${e.method} ${e.path}`).join(', ')
    lines.push(`API endpoints: ${epStr}${extra}`)
  }

  // Prisma models
  if (snapshot.prismaModels.length > 0) {
    lines.push(`Prisma models: ${snapshot.prismaModels.join(', ')}`)
  }

  // Dependencies (cap at 15)
  if (snapshot.dependencies.length > 0) {
    const shown = snapshot.dependencies.slice(0, 15)
    const extra = snapshot.dependencies.length > 15 ? ` +${snapshot.dependencies.length - 15} more` : ''
    lines.push(`Dependencies: ${shown.join(', ')}${extra}`)
  }

  // ── Repo Intelligence (Sprint 19) ─────────────────────────
  const intel = snapshot.repoIntelligence
  if (intel) {
    lines.push('')
    lines.push('=== REPO INTELLIGENCE ===')

    // Naming conventions
    lines.push(`Naming: files=${intel.naming.files}, vars=${intel.naming.variables}, components=${intel.naming.components}, folders=${intel.naming.folders}, css=${intel.naming.cssClasses}`)

    // Style system
    lines.push(`Style: ${intel.style.approach}${intel.style.uiFramework !== 'none' ? ` + ${intel.style.uiFramework}` : ''}${intel.style.hasTheme ? ' (has theme/tokens)' : ''}`)
    if (intel.style.colorTokens.length > 0) {
      lines.push(`Color tokens: ${intel.style.colorTokens.join(', ')}`)
    }

    // Architecture
    const arch = intel.architecture
    lines.push(`Architecture: routing=${arch.routing}, state=${arch.stateManagement}, data=${arch.dataFetching}, forms=${arch.formHandling}`)
    lines.push(`Backend: framework=${arch.backendFramework}, orm=${arch.orm}, auth=${arch.authApproach}`)
    lines.push(`Structure: ${arch.folderStructure}`)

    // Component library
    const lib = intel.componentLibrary
    if (lib.name !== 'none') {
      lines.push(`UI Library: ${lib.name}`)
      if (lib.usedComponents.length > 0) {
        const shown = lib.usedComponents.slice(0, 15)
        lines.push(`Library components in use: ${shown.join(', ')}${lib.usedComponents.length > 15 ? ` +${lib.usedComponents.length - 15} more` : ''}`)
      }
    }
    if (lib.customSharedComponents.length > 0) {
      lines.push(`Custom shared components: ${lib.customSharedComponents.slice(0, 10).join(', ')}`)
    }

    // API contracts (compact summary)
    if (intel.apiContracts.length > 0) {
      lines.push(`API contracts (${intel.apiContracts.length}):`)
      for (const c of intel.apiContracts.slice(0, 10)) {
        const auth = c.authRequired ? ' [auth]' : ''
        const req = c.requestFields.length > 0 ? ` req:{${c.requestFields.join(',')}}` : ''
        const res = c.responseFields.length > 0 ? ` res:{${c.responseFields.join(',')}}` : ''
        lines.push(`  ${c.method} ${c.path}${auth}${req}${res}`)
      }
    }

    lines.push('')
    lines.push('INSTRUCTIONS: Follow the detected naming conventions, style system, and architecture patterns above.')
    lines.push('Use the same UI library/components. Match the folder structure. Stay consistent with existing API contracts.')
    lines.push('=== END REPO INTELLIGENCE ===')
  }

  lines.push('')
  lines.push('=== END REPO SNAPSHOT ===')
  lines.push('IMPORTANT: Do not duplicate existing components, routes, or API endpoints listed above.')
  lines.push('Build only what is new or explicitly requested. Extend existing files where appropriate.')

  return lines.join('\n')
}
