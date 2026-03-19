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

  // Build summary (populated on job:complete, cleared on resetToIdle)
  buildSummary: BuildSummary | null
  setBuildSummary: (summary: BuildSummary | null) => void

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

      // ── Build summary ─────────────────────────────────────
      buildSummary: null,
      setBuildSummary: (summary) =>
        set({ buildSummary: summary }, false, 'setBuildSummary'),

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
            pendingCredentialRequest: null,
            pendingBrowserApproval: null,
            activeBrowserSession: null,
            browserActions: [],
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
