import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  AppMode,
  PanelState,
  RightPanelState,
  SidebarState,
  BuildProgress,
  BuildSummary,
  ErrorDetails,
  Plan,
  Job,
  CredentialRequest,
  BrowserSession,
  BrowserAction,
  BrowserSessionSource,
  AgentStatusPayload,
  FileChangePayload,
  AgentProgressSnapshot,
  AgentRole,
  AgentTaskStatus,
  PipelineStatus,
} from '@/types'

// ─── State ────────────────────────────────────────────────────

interface AppStore {
  // App-level mode (drives the full product lifecycle)
  appMode: AppMode
  setAppMode: (mode: AppMode) => void

  // Right panel state
  rightPanel: RightPanelState
  setPanelMode: (mode: PanelState) => void
  setPanelJob: (jobId: string | null) => void
  setPanelPreview: (url: string | null) => void
  setPanelProgress: (progress: BuildProgress | null) => void
  setPanelError: (error: ErrorDetails | null) => void

  // Sidebar state
  sidebar: SidebarState
  toggleSidebar: () => void
  setActiveProject: (projectId: string | null) => void

  // Active plan (pending approval)
  activePlan: Plan | null
  setActivePlan: (plan: Plan | null) => void

  // Active job
  activeJob: Job | null
  setActiveJob: (job: Job | null) => void

  // Pending credential request (shown in modal, cleared on provide/skip/timeout)
  pendingCredentialRequest: CredentialRequest | null
  setPendingCredential: (req: CredentialRequest | null) => void

  // Pending continuation suggestion (from job:continuation_suggested)
  pendingContinuationSuggestion: { jobId: string; request: string } | null
  setPendingContinuationSuggestion: (data: { jobId: string; request: string } | null) => void

  // Pending repair suggestion (from job:repair_suggested)
  pendingRepairSuggestion: { jobId: string; reason: string; complaint?: string; canAutoRepair: boolean } | null
  setPendingRepairSuggestion: (data: { jobId: string; reason: string; complaint?: string; canAutoRepair: boolean } | null) => void

  // Browser control state
  pendingBrowserApproval: {
    sessionId: string
    domain: string
    purpose: string
    plannedActions: string[]
    source: BrowserSessionSource
  } | null
  setPendingBrowserApproval: (data: {
    sessionId: string
    domain: string
    purpose: string
    plannedActions: string[]
    source: BrowserSessionSource
  } | null) => void
  activeBrowserSession: BrowserSession | null
  setActiveBrowserSession: (session: BrowserSession | null) => void
  browserActions: BrowserAction[]
  addBrowserAction: (action: BrowserAction) => void
  updateBrowserAction: (actionId: string, patch: Partial<BrowserAction>) => void
  clearBrowserSession: () => void

  // Streaming file token state (populated during AI code generation, cleared on complete/repair)
  streamingFile: { path: string; content: string } | null
  appendStreamingFileToken: (path: string, delta: string) => void
  clearStreamingFile: () => void

  // Build summary (populated on job:complete, cleared on resetToIdle)
  buildSummary: BuildSummary | null
  setBuildSummary: (summary: BuildSummary | null) => void

  // ── Test results & security audit (Sprint 19) ──────────────
  testResults: {
    numTests: number; numPassed: number; numFailed: number
    success: boolean; coverage: import('@/types').TestCoverageSummary | null
    failures: Array<{ suiteName: string; testName: string; error: string; filePath: string }>
  } | null
  setTestResults: (results: NonNullable<AppState['testResults']> | null) => void
  securityAudit: {
    securityScore: number; counts: Record<string, number>
    findings: import('@/types').SecurityFinding[]
    vulnerabilities: Array<{ name: string; version: string; severity: string; description: string }>
  } | null
  setSecurityAudit: (audit: NonNullable<AppState['securityAudit']> | null) => void

  // ── Multi-agent system state ─────────────────────────────
  agentPipeline: PipelineStatus
  agentStatuses: Record<string, AgentTaskStatus>
  agentStatusLog: AgentStatusPayload[]
  fileChanges: FileChangePayload[]
  agentSnapshot: AgentProgressSnapshot | null
  activeAgentRole: AgentRole | null
  setAgentPipeline: (status: PipelineStatus) => void
  pushAgentStatus: (payload: AgentStatusPayload) => void
  pushFileChange: (payload: FileChangePayload) => void
  setAgentSnapshot: (snapshot: AgentProgressSnapshot) => void
  resetAgentState: () => void

  // Global loading
  isGlobalLoading: boolean
  setGlobalLoading: (loading: boolean) => void

  // Transition helpers
  transitionToPlanning: () => void
  transitionToAwaitingApproval: (plan: Plan) => void
  transitionToBuilding: (jobId: string) => void
  transitionToPreview: (url: string) => void
  transitionToBrowser: (sessionId: string) => void
  transitionToRepair: () => void
  transitionToError: (error: ErrorDetails) => void
  resetToIdle: () => void
}

// ─── Store ────────────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // ── App mode ──────────────────────────────────────────
      appMode: 'idle',
      setAppMode: (mode) => set({ appMode: mode }, false, 'setAppMode'),

      // ── Right panel ───────────────────────────────────────
      rightPanel: {
        mode: 'idle',
        activeJobId: null,
        previewUrl: null,
        buildProgress: null,
        error: null,
      },

      setPanelMode: (mode) =>
        set(
          (state) => ({ rightPanel: { ...state.rightPanel, mode } }),
          false,
          'setPanelMode'
        ),

      setPanelJob: (jobId) =>
        set(
          (state) => ({ rightPanel: { ...state.rightPanel, activeJobId: jobId } }),
          false,
          'setPanelJob'
        ),

      setPanelPreview: (url) =>
        set(
          (state) => ({ rightPanel: { ...state.rightPanel, previewUrl: url } }),
          false,
          'setPanelPreview'
        ),

      setPanelProgress: (progress) =>
        set(
          (state) => ({ rightPanel: { ...state.rightPanel, buildProgress: progress } }),
          false,
          'setPanelProgress'
        ),

      setPanelError: (error) =>
        set(
          (state) => ({ rightPanel: { ...state.rightPanel, error } }),
          false,
          'setPanelError'
        ),

      // ── Sidebar ───────────────────────────────────────────
      sidebar: {
        isOpen: true,
        activeProjectId: null,
      },

      toggleSidebar: () =>
        set(
          (state) => ({
            sidebar: { ...state.sidebar, isOpen: !state.sidebar.isOpen },
          }),
          false,
          'toggleSidebar'
        ),

      setActiveProject: (projectId) =>
        set(
          (state) => ({
            sidebar: { ...state.sidebar, activeProjectId: projectId },
          }),
          false,
          'setActiveProject'
        ),

      // ── Active plan ───────────────────────────────────────
      activePlan: null,
      setActivePlan: (plan) => set({ activePlan: plan }, false, 'setActivePlan'),

      // ── Active job ────────────────────────────────────────
      activeJob: null,
      setActiveJob: (job) => set({ activeJob: job }, false, 'setActiveJob'),

      // ── Pending credential request ────────────────────────
      pendingCredentialRequest: null,
      setPendingCredential: (req) =>
        set({ pendingCredentialRequest: req }, false, 'setPendingCredential'),

      // ── Pending continuation suggestion ───────────────────
      pendingContinuationSuggestion: null,
      setPendingContinuationSuggestion: (data) =>
        set({ pendingContinuationSuggestion: data }, false, 'setPendingContinuationSuggestion'),

      // ── Pending repair suggestion ─────────────────────────
      pendingRepairSuggestion: null,
      setPendingRepairSuggestion: (data) =>
        set({ pendingRepairSuggestion: data }, false, 'setPendingRepairSuggestion'),

      // ── Browser control ───────────────────────────────────
      pendingBrowserApproval: null,
      setPendingBrowserApproval: (data) =>
        set({ pendingBrowserApproval: data }, false, 'setPendingBrowserApproval'),

      activeBrowserSession: null,
      setActiveBrowserSession: (session) =>
        set({ activeBrowserSession: session }, false, 'setActiveBrowserSession'),

      browserActions: [],
      addBrowserAction: (action) =>
        set(
          (state) => ({ browserActions: [...state.browserActions, action] }),
          false,
          'addBrowserAction'
        ),
      updateBrowserAction: (actionId, patch) =>
        set(
          (state) => ({
            browserActions: state.browserActions.map((a) =>
              a.id === actionId ? { ...a, ...patch } : a
            ),
          }),
          false,
          'updateBrowserAction'
        ),
      clearBrowserSession: () =>
        set(
          {
            pendingBrowserApproval: null,
            activeBrowserSession: null,
            browserActions: [],
          },
          false,
          'clearBrowserSession'
        ),

      // ── Streaming file tokens ─────────────────────────────
      streamingFile: null,
      appendStreamingFileToken: (path, delta) =>
        set(
          (state) => ({
            streamingFile: {
              path,
              content: state.streamingFile?.path === path
                ? (state.streamingFile.content + delta)
                : delta,
            },
          }),
          false,
          'appendStreamingFileToken'
        ),
      clearStreamingFile: () =>
        set({ streamingFile: null }, false, 'clearStreamingFile'),

      // ── Build summary ─────────────────────────────────────
      buildSummary: null,
      setBuildSummary: (summary) =>
        set({ buildSummary: summary }, false, 'setBuildSummary'),

      // ── Test results & security audit ──────────────────────
      testResults: null,
      setTestResults: (results) =>
        set({ testResults: results }, false, 'setTestResults'),
      securityAudit: null,
      setSecurityAudit: (audit) =>
        set({ securityAudit: audit }, false, 'setSecurityAudit'),

      // ── Multi-agent system ─────────────────────────────────
      agentPipeline: 'idle' as PipelineStatus,
      agentStatuses: {} as Record<string, AgentTaskStatus>,
      agentStatusLog: [] as AgentStatusPayload[],
      fileChanges: [] as FileChangePayload[],
      agentSnapshot: null as AgentProgressSnapshot | null,
      activeAgentRole: null as AgentRole | null,

      setAgentPipeline: (status) =>
        set({ agentPipeline: status }, false, 'setAgentPipeline'),

      pushAgentStatus: (payload) =>
        set(
          (state) => {
            const log = [...state.agentStatusLog, payload].slice(-100)
            const statuses = { ...state.agentStatuses }
            let activeRole = state.activeAgentRole

            if (payload.type === 'pipeline') {
              return {
                agentStatusLog: log,
                agentPipeline: payload.status as PipelineStatus,
              }
            }
            if (payload.type === 'agent' && payload.agent) {
              statuses[payload.agent] = payload.status as AgentTaskStatus
              if (payload.status === 'running') {
                activeRole = payload.agent as AgentRole
              }
              return {
                agentStatusLog: log,
                agentStatuses: statuses,
                activeAgentRole: activeRole,
              }
            }
            return { agentStatusLog: log }
          },
          false,
          'pushAgentStatus'
        ),

      pushFileChange: (payload) =>
        set(
          (state) => ({
            fileChanges: [...state.fileChanges, payload].slice(-200),
          }),
          false,
          'pushFileChange'
        ),

      setAgentSnapshot: (snapshot) =>
        set({ agentSnapshot: snapshot }, false, 'setAgentSnapshot'),

      resetAgentState: () =>
        set(
          {
            agentPipeline: 'idle' as PipelineStatus,
            agentStatuses: {},
            agentStatusLog: [],
            fileChanges: [],
            agentSnapshot: null,
            activeAgentRole: null,
          },
          false,
          'resetAgentState'
        ),

      // ── Global loading ────────────────────────────────────
      isGlobalLoading: false,
      setGlobalLoading: (loading) =>
        set({ isGlobalLoading: loading }, false, 'setGlobalLoading'),

      // ── Transition helpers ────────────────────────────────

      transitionToPlanning: () => {
        set(
          {
            appMode: 'planning',
            rightPanel: {
              mode: 'planning',
              activeJobId: null,
              previewUrl: null,
              buildProgress: null,
              error: null,
            },
          },
          false,
          'transitionToPlanning'
        )
      },

      transitionToAwaitingApproval: (plan: Plan) => {
        set(
          {
            appMode: 'awaiting_approval',
            activePlan: plan,
            rightPanel: {
              mode: 'planning',
              activeJobId: null,
              previewUrl: null,
              buildProgress: null,
              error: null,
            },
          },
          false,
          'transitionToAwaitingApproval'
        )
      },

      transitionToBuilding: (jobId: string) => {
        set(
          {
            appMode: 'building',
            rightPanel: {
              mode: 'building',
              activeJobId: jobId,
              previewUrl: null,
              buildProgress: null,
              error: null,
            },
          },
          false,
          'transitionToBuilding'
        )
      },

      transitionToPreview: (url: string) => {
        set(
          {
            appMode: 'preview',
            rightPanel: {
              ...get().rightPanel,
              mode: 'preview',
              previewUrl: url,
            },
          },
          false,
          'transitionToPreview'
        )
      },

      transitionToBrowser: (sessionId: string) => {
        set(
          {
            appMode: 'building',
            rightPanel: {
              ...get().rightPanel,
              mode: 'browser',
              activeJobId: get().rightPanel.activeJobId ?? sessionId,
            },
          },
          false,
          'transitionToBrowser'
        )
      },

      transitionToRepair: () => {
        set(
          {
            appMode: 'repair',
            rightPanel: {
              ...get().rightPanel,
              mode: 'building',
            },
          },
          false,
          'transitionToRepair'
        )
      },

      transitionToError: (error: ErrorDetails) => {
        set(
          {
            appMode: 'error',
            rightPanel: {
              ...get().rightPanel,
              mode: 'error',
              error,
            },
          },
          false,
          'transitionToError'
        )
      },

      resetToIdle: () => {
        set(
          {
            appMode: 'idle',
            activePlan: null,
            activeJob: null,
            buildSummary: null,
            testResults: null,
            securityAudit: null,
            streamingFile: null,
            pendingCredentialRequest: null,
            pendingContinuationSuggestion: null,
            pendingRepairSuggestion: null,
            pendingBrowserApproval: null,
            activeBrowserSession: null,
            browserActions: [],
            agentPipeline: 'idle' as PipelineStatus,
            agentStatuses: {},
            agentStatusLog: [],
            fileChanges: [],
            agentSnapshot: null,
            activeAgentRole: null,
            rightPanel: {
              mode: 'idle',
              activeJobId: null,
              previewUrl: null,
              buildProgress: null,
              error: null,
            },
          },
          false,
          'resetToIdle'
        )
      },
    }),
    { name: 'CodedXP/AppStore' }
  )
)
