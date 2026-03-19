import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { jobsApi } from '@/lib/api'
import type { BuildSummary } from '@/types'

/**
 * useRehydrateState — Phase 8 Slice 1
 *
 * On mount (page load / refresh), queries GET /api/jobs/active to restore
 * the correct appMode and panel state without waiting for socket events.
 *
 * Logic:
 *  1. Non-terminal job found  → restore BuildingView (transitionToBuilding)
 *  2. No active job           → check for last completed job with previewUrl
 *     a. Completed job found  → restore PreviewView + BuildSummary
 *     b. Nothing found        → leave as idle (no-op)
 *
 * Only runs once per authenticated session (guarded by rehydratedRef).
 */
export function useRehydrateState() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const rehydratedRef = useRef(false)

  const {
    appMode,
    transitionToBuilding,
    transitionToPreview,
    setActiveJob,
    setBuildSummary,
    setPanelProgress,
  } = useAppStore()

  useEffect(() => {
    // Only run once, only when authenticated, only if currently idle
    // (don't clobber an already-active session restored via socket)
    if (!isAuthenticated) return
    if (rehydratedRef.current) return
    if (appMode !== 'idle') return

    rehydratedRef.current = true

    async function rehydrate() {
      try {
        // ── Step 1: Check for an in-progress job ──────────────
        const { data: activeData } = await jobsApi.getActive()
        const activeJob = activeData.job as Record<string, unknown> | null

        if (activeJob) {
          const jobId = activeJob.id as string
          const status = activeJob.status as string
          const progress = (activeJob.progress as number) ?? 0
          const currentStep = (activeJob.currentStep as string) ?? ''
          const previewUrl = (activeJob.previewUrl as string | null) ?? null
          const projectId = activeJob.projectId as string

          // Restore active job into store
          setActiveJob({
            id: jobId,
            projectId,
            planId: (activeJob.planId as string) ?? '',
            status: status as import('@/types').JobStatus,
            currentStep,
            progress,
            logs: [],
            startedAt: activeJob.startedAt as string | undefined,
            previewUrl: previewUrl ?? undefined,
            previewPort: (activeJob.previewPort as number | undefined),
            previewStatus: (activeJob.previewStatus as string | undefined),
            error: (activeJob.error as string | undefined),
            errorDetails: (activeJob.errorDetails as string | undefined),
            failureCategory: (activeJob.failureCategory as string | undefined),
          })

          // Restore panel progress
          setPanelProgress({
            jobId,
            status: status as import('@/types').JobStatus,
            currentStep,
            progress,
            recentLogs: [],
            failureCategory: (activeJob.failureCategory as string | undefined),
          })

          // Transition to building view
          transitionToBuilding(jobId)
          console.log(`[Rehydrate] Restored building state for job ${jobId} (${status})`)
          return
        }

        // ── Step 2: Check for last completed job ──────────────
        const { data: completedData } = await jobsApi.getLastCompleted()
        const completedJob = completedData.job as Record<string, unknown> | null

        if (completedJob && completedJob.previewUrl) {
          const jobId = completedJob.id as string
          const previewUrl = completedJob.previewUrl as string
          const projectId = completedJob.projectId as string

          // Restore active job
          setActiveJob({
            id: jobId,
            projectId,
            planId: (completedJob.planId as string) ?? '',
            status: 'complete',
            currentStep: 'complete',
            progress: 100,
            logs: [],
            completedAt: completedJob.completedAt as string | undefined,
            startedAt: completedJob.startedAt as string | undefined,
            previewUrl,
            previewPort: (completedJob.previewPort as number | undefined),
            previewStatus: (completedJob.previewStatus as string | undefined),
          })

          // Restore build summary from job metadata
          const startedAt = completedJob.startedAt
            ? new Date(completedJob.startedAt as string).getTime()
            : 0
          const completedAt = completedJob.completedAt
            ? new Date(completedJob.completedAt as string).getTime()
            : Date.now()
          const buildMeta = (completedJob.buildMeta as Record<string, unknown>) ?? {}
          const techStack: string[] = Array.isArray(buildMeta.techStack)
            ? (buildMeta.techStack as string[])
            : []
          const keyFiles: string[] = Array.isArray(completedJob.generatedKeyFiles)
            ? (completedJob.generatedKeyFiles as string[])
            : []

          const summary: BuildSummary = {
            jobId,
            projectId,
            fileCount: (completedJob.generatedFileCount as number) ?? 0,
            totalBytes: (completedJob.generatedTotalBytes as number) ?? 0,
            durationMs: startedAt > 0 ? completedAt - startedAt : 0,
            techStack,
            keyFiles,
            builtAt: (completedJob.completedAt as string) ?? new Date().toISOString(),
          }
          setBuildSummary(summary)

          // Transition to preview
          transitionToPreview(previewUrl)
          console.log(`[Rehydrate] Restored preview state for job ${jobId}`)
        }
      } catch (err) {
        // Non-fatal — rehydration is best-effort
        console.warn('[Rehydrate] Failed to rehydrate state:', err)
      }
    }

    rehydrate()
  }, [
    isAuthenticated,
    appMode,
    transitionToBuilding,
    transitionToPreview,
    setActiveJob,
    setBuildSummary,
    setPanelProgress,
  ])
}
