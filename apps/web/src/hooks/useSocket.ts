import { useEffect, useRef, useCallback } from 'react'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import type { Message, Plan, Job, JobLog, CredentialRequest } from '@/types'

// ─── Log level normalizer ─────────────────────────────────────
// Server sends BuildLogEntry { level: 'info'|'warn'|'error'|'success', step, message }
// Frontend JobLog expects { type: 'create'|'update'|'delete'|'run'|'log'|'error'|'success' }

function normalizeLogLevel(log: JobLog | undefined): JobLog['type'] {
  if (!log) return 'log'
  // If the log already has a valid frontend type, pass it through
  const validTypes = new Set(['create', 'update', 'delete', 'run', 'log', 'error', 'success'])
  if (validTypes.has(log.type)) return log.type as JobLog['type']
  // Map server BuildLogLevel → frontend type
  const level = (log as unknown as { level?: string }).level
  const step = (log as unknown as { step?: string }).step
  if (level === 'error') return 'error'
  if (level === 'success') return 'success'
  if (step === 'files_write' || step === 'scaffold_generate') return 'create'
  if (step === 'install_deps' || step === 'preview_start' || step === 'preview_healthcheck') return 'run'
  if (level === 'warn') return 'run'
  return 'log'
}

// ─── Module-level binding guard ──────────────────────────────
// useSocket() is called in 7+ components. Each call previously got its own
// boundRef, causing 7 copies of every event listener to be registered.
// A module-level flag ensures bindEvents() runs exactly once per connection.
let _isBound = false

export function useSocket() {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const {
    transitionToBuilding,
    transitionToPreview,
    transitionToBrowser,
    transitionToRepair,
    transitionToError,
    setPanelProgress,
    setActiveJob,
    setBuildSummary,
    setPendingCredential,
    setPendingBrowserApproval,
    setActiveBrowserSession,
    addBrowserAction,
    updateBrowserAction,
    clearBrowserSession,
  } = useAppStore()

  const {
    addMessage,
    appendStreamDelta,
    finalizeStream,
    setStreaming,
    setAssistantTyping,
    updateMessage,
  } = useChatStore()

  // Keep a ref so React's useCallback/useEffect don't need to re-run when the
  // module-level flag changes, but the actual guard is the module-level _isBound.
  const boundRef = useRef(false)

  const bindEvents = useCallback(() => {
    if (_isBound) return
    _isBound = true
    boundRef.current = true

    const s = getSocket()

    // ── Chat events ───────────────────────────────────────
    s.on('chat:message', (message: Message) => {
      addMessage(message)
      setAssistantTyping(false)
    })

    s.on('chat:stream', ({ messageId, delta, done }: { messageId: string; delta: string; done: boolean }) => {
      if (done) {
        finalizeStream(messageId)
        setAssistantTyping(false)
      } else {
        appendStreamDelta(messageId, delta)
        setStreaming(true, messageId)
      }
    })

    // ── Typing indicator ──────────────────────────────────
    s.on('chat:typing', ({ typing }: { typing: boolean }) => {
      setAssistantTyping(typing)
    })

    // ── Plan events ───────────────────────────────────────
    s.on('plan:created', (plan: Plan) => {
      // Transition right panel to awaiting approval
      // The chat:message event (emitted right after) carries the plan message
      useAppStore.getState().transitionToAwaitingApproval(plan)
    })

    s.on('plan:updated', (plan: Plan) => {
      useAppStore.getState().setActivePlan(plan)
    })

    // ── Job events ────────────────────────────────────────
    s.on('job:created', (job: Job) => {
      setActiveJob(job)
      transitionToBuilding(job.id)
    })

    s.on('job:updated', (job: Job) => {
      setActiveJob(job)
      setPanelProgress({
        jobId: job.id,
        status: job.status,
        currentStep: job.currentStep,
        progress: job.progress,
        recentLogs: job.logs?.slice(-10) ?? [],
        failureCategory: job.failureCategory,
      })
    })

    s.on('job:log', ({ jobId, log, msg }: { jobId: string; log?: JobLog; msg?: string }) => {
      const current = useAppStore.getState().rightPanel.buildProgress
      if (current?.jobId === jobId) {
        // Normalize: server sends BuildLogEntry { level, step, message } — map to frontend JobLog { type, message }
        const rawStep = (log as unknown as { step?: string }).step
        const normalizedLog: JobLog = {
          id: log?.id ?? `log-${Date.now()}`,
          timestamp: log?.timestamp ?? new Date().toISOString(),
          type: normalizeLogLevel(log),
          message: log?.message ?? msg ?? '',
          filePath: log?.filePath,
          step: rawStep,
        }
        setPanelProgress({
          ...current,
          recentLogs: [...(current.recentLogs ?? []).slice(-49), normalizedLog],
        })
      }
    })

    s.on('job:complete', ({ jobId, previewUrl, url }: { jobId: string; previewUrl?: string; url?: string; summary?: Record<string, unknown> }) => {
      const preview = previewUrl ?? url ?? ''
      // Build summary from active job telemetry
      const activeJob = useAppStore.getState().activeJob
      if (activeJob) {
        const startedAt = activeJob.startedAt ? new Date(activeJob.startedAt).getTime() : 0
        const completedAt = Date.now()
        const buildMeta = (activeJob as unknown as { buildMeta?: Record<string, unknown> }).buildMeta ?? {}
        const techStack: string[] = Array.isArray(buildMeta.techStack)
          ? (buildMeta.techStack as string[])
          : []
        const keyFiles: string[] = Array.isArray((activeJob as unknown as { generatedKeyFiles?: string[] }).generatedKeyFiles)
          ? ((activeJob as unknown as { generatedKeyFiles?: string[] }).generatedKeyFiles as string[])
          : []
        setBuildSummary({
          jobId,
          projectId: activeJob.projectId,
          fileCount: (activeJob as unknown as { generatedFileCount?: number }).generatedFileCount ?? 0,
          totalBytes: (activeJob as unknown as { generatedTotalBytes?: number }).generatedTotalBytes ?? 0,
          durationMs: startedAt > 0 ? completedAt - startedAt : 0,
          techStack,
          keyFiles,
          builtAt: new Date().toISOString(),
        })
      }
      transitionToPreview(preview)
      const completeMessage: Message = {
        id: `complete-${jobId}`,
        chatId: '',
        role: 'assistant',
        type: 'build_complete',
        content: '✅ Your app has been built successfully! You can see the live preview on the right.',
        createdAt: new Date().toISOString(),
      }
      addMessage(completeMessage)
    })

    s.on('job:failed', ({ jobId: _jobId, error }: { jobId: string; error: { code: string; message: string; category?: string; retryCount?: number } }) => {
      transitionToError({
        code: error.code,
        message: error.message,
        failureCategory: error.category,
      })
    })

    // ── Repair events ─────────────────────────────────────
    s.on('repair:started', () => {
      transitionToRepair()
    })

    s.on('repair:complete', ({ fixed }: { jobId: string; fixed: boolean }) => {
      if (!fixed) {
        transitionToError({
          code: 'REPAIR_FAILED',
          message: 'Automatic repair was unsuccessful. Please review the error and try again.',
        })
      }
    })

    // ── Preview events ────────────────────────────────────
    s.on('preview:ready', ({ url }: { jobId: string; url: string }) => {
      transitionToPreview(url)
    })

    // ── Credential requests ───────────────────────────────
    s.on('credentials:requested', (request: CredentialRequest) => {
      // Set pending state → triggers CredentialModal
      setPendingCredential(request)
      // Also add a chat message for context
      const credMessage: Message = {
        id: `cred-${request.id}`,
        chatId: '',
        role: 'assistant',
        type: 'credential_request',
        content: `I need your ${request.label} credentials to continue the build.`,
        metadata: { credentialKey: request.integration },
        createdAt: new Date().toISOString(),
      }
      addMessage(credMessage)
    })

    s.on('credentials:provided', ({ requestId }: { requestId: string }) => {
      // Clear modal if it's still showing this request
      const current = useAppStore.getState().pendingCredentialRequest
      if (current?.id === requestId) {
        setPendingCredential(null)
      }
    })

    s.on('credentials:skipped', ({ requestId }: { requestId: string }) => {
      // Clear modal if it's still showing this request
      const current = useAppStore.getState().pendingCredentialRequest
      if (current?.id === requestId) {
        setPendingCredential(null)
      }
    })

    // ── Browser control events ────────────────────────────
    s.on('browser:approval_required', (data) => {
      setPendingBrowserApproval(data)
    })

    s.on('browser:session_started', ({ sessionId }: { sessionId: string }) => {
      // Clear approval modal, mark session active, switch panel to browser view
      setPendingBrowserApproval(null)
      setActiveBrowserSession({
        id: sessionId,
        userId: '',
        domain: '',
        purpose: '',
        plannedActions: [],
        source: 'manual',
        status: 'active',
        createdAt: new Date().toISOString(),
      })
      transitionToBrowser(sessionId)
    })

    s.on('browser:action_executing', ({ sessionId: _sid, actionId, description }: {
      sessionId: string; actionId: string; description: string
    }) => {
      addBrowserAction({
        id: actionId,
        sessionId: _sid,
        type: 'navigate',
        description,
        status: 'executing',
        createdAt: new Date().toISOString(),
      })
    })

    s.on('browser:action_complete', ({ actionId, screenshotAfterPath }: {
      sessionId: string; actionId: string; screenshotAfterPath?: string
    }) => {
      updateBrowserAction(actionId, {
        status: 'complete',
        screenshotAfterPath,
        executedAt: new Date().toISOString(),
      })
    })

    s.on('browser:action_failed', ({ actionId, error }: {
      sessionId: string; actionId: string; error: string
    }) => {
      updateBrowserAction(actionId, { status: 'failed', error })
    })

    s.on('browser:session_complete', (_data: { sessionId: string }) => {
      const current = useAppStore.getState().activeBrowserSession
      if (current) setActiveBrowserSession({ ...current, status: 'completed' })
      // Return to preview if we have a URL, otherwise idle
      const previewUrl = useAppStore.getState().rightPanel.previewUrl
      if (previewUrl) {
        transitionToPreview(previewUrl)
      } else {
        useAppStore.getState().resetToIdle()
      }
    })

    s.on('browser:session_terminated', ({ reason }: { sessionId: string; reason: string }) => {
      const current = useAppStore.getState().activeBrowserSession
      if (current) setActiveBrowserSession({ ...current, status: 'terminated_by_user', closedReason: reason })
      // Return to preview if we have a URL, otherwise idle
      const previewUrl = useAppStore.getState().rightPanel.previewUrl
      if (previewUrl) {
        transitionToPreview(previewUrl)
      } else {
        useAppStore.getState().resetToIdle()
      }
    })

    // ── Error ─────────────────────────────────────────────
    s.on('error', ({ message }: { message: string; code?: string }) => {
      console.error('[Socket Error]', message)
    })

    s.on('connect', () => {
      console.log('[Socket] Connected:', s.id)
    })

    s.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason)
      boundRef.current = false
      _isBound = false   // allow re-binding after reconnect
    })
  }, [
    addMessage,
    appendStreamDelta,
    finalizeStream,
    setStreaming,
    setAssistantTyping,
    updateMessage,
    transitionToBuilding,
    transitionToPreview,
    transitionToBrowser,
    transitionToRepair,
    transitionToError,
    setPanelProgress,
    setActiveJob,
    setBuildSummary,
    setPendingCredential,
    setPendingBrowserApproval,
    setActiveBrowserSession,
    addBrowserAction,
    updateBrowserAction,
    clearBrowserSession,
  ])

  useEffect(() => {
    if (!isAuthenticated || !token) return

    const s = connectSocket(token)
    bindEvents()

    return () => {
      // Don't disconnect on unmount — keep socket alive for the session
    }
  }, [isAuthenticated, token, bindEvents])

  return {
    socket: getSocket(),
    sendMessage: (chatId: string, content: string, fileIds?: string[]) => {
      getSocket().emit('chat:send', { chatId, content, fileIds })
    },
    approvePlan: (planId: string, projectId: string) => {
      getSocket().emit('plan:approve', { planId, projectId })
    },
    rejectPlan: (planId: string, reason?: string) => {
      getSocket().emit('plan:reject', { planId, reason })
    },
    modifyPlan: (planId: string, modifications: string) => {
      getSocket().emit('plan:modify', { planId, modifications })
    },
    cancelJob: (jobId: string) => {
      getSocket().emit('job:cancel', { jobId })
    },
    provideCredentials: (requestId: string, values: Record<string, string>) => {
      getSocket().emit('credentials:provide', { requestId, values })
    },
    skipCredentials: (requestId: string) => {
      getSocket().emit('credentials:skip', { requestId })
    },
    approveBrowserSession: (sessionId: string) => {
      getSocket().emit('browser:approve', { sessionId })
    },
    denyBrowserSession: (sessionId: string) => {
      setPendingBrowserApproval(null)
      getSocket().emit('browser:deny', { sessionId })
    },
    terminateBrowserSession: (sessionId: string) => {
      getSocket().emit('browser:terminate', { sessionId })
      clearBrowserSession()
    },
  }
}
