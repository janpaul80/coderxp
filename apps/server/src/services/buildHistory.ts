/**
 * Build-to-Build Learning (Sprint 18)
 * 
 * Tracks quality evolution, learns from repair outcomes, 
 * adjusts future generation strategies.
 */

import { prisma } from '../lib/prisma'

export interface BuildOutcome {
  buildId: string
  qualityScore: number
  complexityScore: number
  duplicationScore: number
  securityScore: number
  overallScore: number
  repairTriggered: boolean
  repairSuccess: boolean | null
  providerUsed: string
  workerName: string
  timestamp: Date
  projectId: string
}

export interface QualityTrend {
  trend: 'improving' | 'stable' | 'declining'
  delta: number
  baseline: number
  recentAverage: number
  buildCount: number
}

export interface LearningState {
  preferredProvider: string | null
  repairPatterns: Record<string, number> // errorType → successRate
  qualityBaseline: number | null
  aggressiveRepairThreshold: number
  providerQuality: Record<string, number>
}

/**
 * Record build outcome for learning
 */
export async function recordBuildOutcome(outcome: BuildOutcome): Promise<void> {
  // Read-modify-write: failureHistory is a Json field (not Json[]), so we read, append, write
  const memory = await prisma.projectMemory.findUnique({
    where: { projectId: outcome.projectId },
    select: { failureHistory: true },
  })

  const history: unknown[] = Array.isArray(memory?.failureHistory)
    ? (memory!.failureHistory as unknown[])
    : []

  history.push({
    id: outcome.buildId,
    timestamp: outcome.timestamp,
    quality: outcome.overallScore,
    repairTriggered: outcome.repairTriggered,
    repairSuccess: outcome.repairSuccess,
    provider: outcome.providerUsed,
  })

  // Keep last 50 entries to avoid unbounded growth
  const trimmed = history.slice(-50)

  await prisma.projectMemory.updateMany({
    where: { projectId: outcome.projectId },
    data: { failureHistory: trimmed as any },
  })
}

/**
 * Analyze build-to-build quality trends
 */
export async function getQualityTrend(projectId: string): Promise<QualityTrend | null> {
  const memory = await prisma.projectMemory.findUnique({
    where: { projectId }
  })

  if (!memory?.failureHistory) return null

  const history = memory.failureHistory as Array<{
    timestamp: string
    quality: number
    repairSuccess?: boolean
  }>

  if (history.length < 3) return null

  // Last 5 builds
  const recent = history.slice(-5).map(h => h.quality)
  const baseline = history[0]?.quality ?? recent[0]

  const delta = recent[recent.length - 1] - baseline
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length

  let trend: QualityTrend['trend']
  if (delta > 5) trend = 'improving'
  else if (delta < -5) trend = 'declining'
  else trend = 'stable'

  return {
    trend,
    delta: Math.round(delta * 100) / 100,
    baseline,
    recentAverage: Math.round(avgRecent * 100) / 100,
    buildCount: history.length
  }
}

/**
 * Extract learning state for next generation
 */
export async function getLearningState(projectId: string): Promise<LearningState> {
  const memory = await prisma.projectMemory.findUnique({
    where: { projectId },
    select: { failureHistory: true }
  })

  if (!memory?.failureHistory) {
    return {
      preferredProvider: null,
      repairPatterns: {},
      qualityBaseline: null,
      aggressiveRepairThreshold: 65,
      providerQuality: {}
    }
  }

  const history = memory.failureHistory as Array<any>

  // Provider success rates
  const providerWins: Record<string, number> = {}
  const providerAttempts: Record<string, number> = {}
  
  history.forEach(build => {
    const provider = build.provider || 'unknown'
    providerAttempts[provider] = (providerAttempts[provider] || 0) + 1
    
    if (build.quality > 75 || build.repairSuccess === true) {
      providerWins[provider] = (providerWins[provider] || 0) + 1
    }
  })

  const providerQuality: Record<string, number> = {}
  Object.keys(providerAttempts).forEach(p => {
    providerQuality[p] = Math.round((providerWins[p]! / providerAttempts[p]!) * 100)
  })

  const preferredProvider = Object.entries(providerQuality)
    .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || null

  return {
    preferredProvider,
    repairPatterns: {}, // TODO: S18-3 pattern extraction
    qualityBaseline: history[0]?.quality ?? null,
    aggressiveRepairThreshold: history.length > 3 ? 70 : 65, // More aggressive after 3+ builds
    providerQuality
  }
}

/**
 * Should we use aggressive repair mode based on history?
 */
export async function shouldUseAggressiveRepair(projectId: string): Promise<boolean> {
  const trend = await getQualityTrend(projectId)
  if (!trend) return false

  // Aggressive repair if:
  // 1. Declining quality AND recent avg < 70 OR
  // 2. Multiple recent failures OR  
  // 3. Repair success < 50%
  return trend.trend === 'declining' && trend.recentAverage < 70
}

