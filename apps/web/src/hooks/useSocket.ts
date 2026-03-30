
import { useEffect, useRef, useCallback } from 'react'
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { useChatStore } from '@/store/chatStore'
import type { Message, Plan, Job, JobLog, CredentialRequest, ErrorAnalysis, AgentStatusPayload, FileChangePayload, AgentProgressSnapshot } from '@/types'

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
    setPendingContinuationSuggestion,
    setPendingRepairSuggestion,
    setPendingBrowserApproval,
    setActiveBrowserSession,
    addBrowserAction,
    updateBrowserAction,
    clearBrowserSession,
    appendStreamingFileToken,
    clearStreamingFile,
    pushTerminalLog,
    pushCompletedFile,
    pushAgentStatus,
    pushFileChange,
    setAgentSnapshot,
    setTestResults,
    setSecurityAudit,
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
      // Skip user messages — they're already added optimistically by ChatInput.
      // The server echo has a different ID so dedup-by-id doesn't catch it.
      if (message.role === 'user') return
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
        const rawSource = (log as unknown as { source?: string }).source
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

        // Push to live terminal log — every build log is visible in the terminal
        pushTerminalLog({
          id: normalizedLog.id,
          timestamp: normalizedLog.timestamp,
          type: normalizedLog.type,
          message: normalizedLog.message,
          step: rawStep,
          source: rawSource,
        })

        // Track completed files for live file tree
        if (normalizedLog.filePath && (normalizedLog.type === 'create' || normalizedLog.type === 'success')) {
          const rawBytes = (log as unknown as { bytes?: number }).bytes
          pushCompletedFile({
            path: normalizedLog.filePath,
            bytes: rawBytes,
            timestamp: normalizedLog.timestamp,
          })
        }
      }
    })

    // ── Continuation / repair suggestions ────────────────
    s.on('job:continuation_suggested', ({ jobId, request }: { jobId: string; request: string; canContinue: boolean }) => {
      setPendingContinuationSuggestion({ jobId, request })
      const msg: Message = {
        id: `continuation-${jobId}-${Date.now()}`,
        chatId: '',
        role: 'assistant',
        type: 'continuation_suggested',
        content: 'I can extend your existing build with the new pages/features you requested.',
        metadata: { jobId, continuationSuggestion: { jobId, request } },
        createdAt: new Date().toISOString(),
      }
      addMessage(msg)
    })

    s.on('job:repair_suggested', ({ jobId, reason, complaint, canAutoRepair }: {
      jobId: string; reason: string; complaint?: string; canAutoRepair: boolean
    }) => {
      setPendingRepairSuggestion({ jobId, reason, complaint, canAutoRepair })
      const msg: Message = {
        id: `repair-suggested-${jobId}-${Date.now()}`,
        chatId: '',
        role: 'assistant',
        type: 'repair_suggested',
        content: canAutoRepair
          ? 'I can automatically repair the issue in your live build without a full rebuild.'
          : 'I can re-queue this build for repair.',
        metadata: { jobId, repairSuggestion: { jobId, complaint: complaint ?? reason, canAutoRepair } },
        createdAt: new Date().toISOString(),
      }
      addMessage(msg)
    })

    s.on('job:continuation_complete', ({ previewUrl }: { jobId: string; previewUrl?: string }) => {
      setPendingContinuationSuggestion(null)
      if (previewUrl) transitionToPreview(previewUrl)
    })

    s.on('job:complete', ({
      jobId, previewUrl, url,
      fileCount: payloadFileCount,
      totalBytes: payloadTotalBytes,
      techStack: payloadTechStack,
      keyFiles: payloadKeyFiles,
    }) => {
      const preview = previewUrl ?? url ?? ''
      // Use event payload values (sent by server at job:complete time).
      // Fall back to activeJob fields only for projectId / durationMs calculation.
      const activeJob = useAppStore.getState().activeJob
      const startedAt = activeJob?.startedAt ? new Date(activeJob.startedAt).getTime() : 0
      const completedAt = Date.now()
      const fileCount = payloadFileCount ?? 0
      const totalBytes = payloadTotalBytes ?? 0
      const techStack: string[] = Array.isArray(payloadTechStack) ? payloadTechStack : []
      const keyFiles: string[] = Array.isArray(payloadKeyFiles) ? payloadKeyFiles : []
      setBuildSummary({
        jobId,
        projectId: activeJob?.projectId ?? '',
        fileCount,
        totalBytes,
        durationMs: startedAt > 0 ? completedAt - startedAt : 0,
        techStack,
        keyFiles,
        builtAt: new Date().toISOString(),
      })
      // Clear any pending continuation suggestion — the job that was suggested is now complete
      setPendingContinuationSuggestion(null)
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

    // ── Streaming file tokens ─────────────────────────────
    s.on('job:file_token', ({ path, delta }: { jobId: string; path: string; delta: string }) => {
      appendStreamingFileToken(path, delta)
    })

    s.on('job:targeted_repair', ({ jobId, filesToRepair, repairSummary, previewUrl }: {
      jobId: string; filesToRepair: string[]; repairSummary: string; previewUrl?: string
    }) => {
      clearStreamingFile()
      if (previewUrl) {
        transitionToPreview(previewUrl)
      }
      const repairMsg: Message = {
        id: `repair-${jobId}`,
        chatId: '',
        role: 'assistant',
        type: 'repair_complete',
        content: `✅ Repair complete: ${repairSummary} (${filesToRepair.length} file${filesToRepair.length !== 1 ? 's' : ''} updated)`,
        createdAt: new Date().toISOString(),
      }
      addMessage(repairMsg)
    })

    // ── S9: AI-Native Debugger — error analysis ───────────
    s.on('job:error_analysis', ({ jobId, errorAnalysis, attempt, autoRepairTriggered }: {
      jobId: string
      errorAnalysis: ErrorAnalysis
      attempt: number
      autoRepairTriggered: boolean
    }) => {
      const analysisMsg: Message = {
        id: `error-analysis-${jobId}-${attempt}-${Date.now()}`,
        chatId: '',
        role: 'assistant',
        type: 'error_analysis',
        content: `Build error detected (attempt ${attempt}): ${errorAnalysis.rootCause}`,
        metadata: {
          jobId,
          errorAnalysis,
          autoRepairAttempt: attempt,
        },
        createdAt: new Date().toISOString(),
      }
      addMessage(analysisMsg)
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

    // ── Multi-agent system events ────────────────────────
    s.on('agent:status', (payload: AgentStatusPayload) => {
      pushAgentStatus(payload)
    })

    s.on('agent:fileChange', (payload: FileChangePayload) => {
      pushFileChange(payload)
      // Also track in completed files for live file tree
      if (payload.action === 'created' || payload.action === 'modified') {
        pushCompletedFile({
          path: payload.filePath,
          timestamp: payload.timestamp,
        })
      }
      // And show in terminal
      pushTerminalLog({
        id: `fc-${Date.now()}-${payload.filePath}`,
        timestamp: payload.timestamp,
        type: payload.action === 'created' ? 'create' : 'update',
        message: `${payload.action}: ${payload.filePath}`,
        source: payload.agent,
      })
    })

    s.on('agent:snapshot', (snapshot: AgentProgressSnapshot) => {
      setAgentSnapshot(snapshot)
    })

    // ── Test results & security audit (Sprint 19) ────────
    s.on('job:test_results', (data: {
      jobId: string; numTests: number; numPassed: number; numFailed: number
      success: boolean; coverage: any; failures: any[]
    }) => {
      setTestResults({
        numTests: data.numTests,
        numPassed: data.numPassed,
        numFailed: data.numFailed,
        success: data.success,
        coverage: data.coverage,
        failures: data.failures,
      })
    })

    s.on('job:security_audit', (data: {
      jobId: string; securityScore: number; counts: Record<string, number>
      findings: any[]; vulnerabilities: any[]
    }) => {
      setSecurityAudit({
        securityScore: data.securityScore,
        counts: data.counts,
        findings: data.findings,
        vulnerabilities: data.vulnerabilities,
      })
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
    setPendingContinuationSuggestion,
    setPendingRepairSuggestion,
    setPendingBrowserApproval,
    setActiveBrowserSession,
    addBrowserAction,
    updateBrowserAction,
    clearBrowserSession,
    appendStreamingFileToken,
    clearStreamingFile,
    pushTerminalLog,
    pushCompletedFile,
    pushAgentStatus,
    pushFileChange,
    setAgentSnapshot,
    setTestResults,
    setSecurityAudit,
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
    // ── Continuation actions ──────────────────────────────
    approveContinuation: (existingJobId: string, request: string) => {
      getSocket().emit('job:continuation_approve', { existingJobId, request })
      setPendingContinuationSuggestion(null)
    },
    dismissContinuation: () => {
      setPendingContinuationSuggestion(null)
    },
    // ── Repair actions ────────────────────────────────────
    approveRepair: (jobId: string, complaint: string, canAutoRepair: boolean) => {
      if (canAutoRepair) {
        getSocket().emit('job:targeted_repair', { jobId, complaint })
      } else {
        getSocket().emit('job:repair', { jobId })
      }
      setPendingRepairSuggestion(null)
    },
    dismissRepair: () => {
      setPendingRepairSuggestion(null)
    },
  }
}
