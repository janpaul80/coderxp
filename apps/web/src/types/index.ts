// ─── App State ────────────────────────────────────────────────

export type AppMode =
  | 'idle'
  | 'chatting'
  | 'planning'
  | 'awaiting_approval'
  | 'building'
  | 'preview'
  | 'repair'
  | 'error'

export type PanelState =
  | 'idle'
  | 'planning'
  | 'building'
  | 'preview'
  | 'error'
  | 'browser'

// ─── Auth ─────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: string
}

export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

// ─── Project ──────────────────────────────────────────────────

export type ProjectStatus =
  | 'draft'
  | 'planning'
  | 'building'
  | 'ready'
  | 'error'

export interface Project {
  id: string
  name: string
  description?: string
  status: ProjectStatus
  userId: string
  createdAt: string
  updatedAt: string
  lastChatId?: string
}

// ─── Chat & Messages ──────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageType =
  | 'text'
  | 'plan'
  | 'approval_request'
  | 'approval_response'
  | 'build_start'
  | 'build_progress'
  | 'build_complete'
  | 'error'
  | 'repair_start'
  | 'repair_complete'
  | 'credential_request'
  | 'file_upload'

export interface Message {
  id: string
  chatId: string
  role: MessageRole
  type: MessageType
  content: string
  metadata?: MessageMetadata
  createdAt: string
  isStreaming?: boolean
}

export interface MessageMetadata {
  plan?: Plan
  planId?: string
  jobId?: string
  fileIds?: string[]
  credentialKey?: string
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'modified'
  buildProgress?: BuildProgress
  errorDetails?: ErrorDetails
}

export interface Chat {
  id: string
  projectId: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

// ─── Plan ─────────────────────────────────────────────────────

export type PlanStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'modified'

export interface Plan {
  id: string
  chatId: string
  projectId: string
  status: PlanStatus
  summary: string
  features: string[]
  frontendScope: string[]
  backendScope: string[]
  integrations: string[]
  techStack: TechStack
  executionSteps: ExecutionStep[]
  estimatedComplexity: 'low' | 'medium' | 'high'
  createdAt: string
  updatedAt: string
}

export interface TechStack {
  frontend: string[]
  backend: string[]
  database?: string[]
  auth?: string[]
  integrations?: string[]
  deployment?: string[]
}

export interface ExecutionStep {
  id: string
  order: number
  title: string
  description: string
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped'
  estimatedDuration?: string
}

// ─── Build / Job ──────────────────────────────────────────────

export type JobStatus =
  | 'queued'
  | 'initializing'
  | 'installing'
  | 'generating_frontend'
  | 'generating_backend'
  | 'wiring_auth'
  | 'wiring_integrations'
  | 'running'
  | 'testing'
  | 'installing_deps'
  | 'starting_preview'
  | 'repairing'
  | 'complete'
  | 'failed'

export interface Job {
  id: string
  projectId: string
  planId: string
  status: JobStatus
  currentStep: string
  progress: number
  logs: JobLog[]
  startedAt?: string
  completedAt?: string
  previewUrl?: string
  previewPort?: number
  previewStatus?: string
  error?: string
  errorDetails?: string
  failureCategory?: string
  /** Absolute path to the workspace directory on the server */
  workspacePath?: string
}

export interface JobLog {
  id: string
  timestamp: string
  type: 'create' | 'update' | 'delete' | 'run' | 'log' | 'error' | 'success'
  message: string
  filePath?: string
  code?: string
  /** File size in bytes — populated for create/update events */
  bytes?: number
  /** Server-side build step key (workspace_prepare, files_write, install_deps, etc.) */
  step?: string
}

// ─── Execution Timeline ───────────────────────────────────────

export type ExecutionPhaseStatus = 'pending' | 'running' | 'complete' | 'failed' | 'repair'

export interface ExecutionPhase {
  step: string
  label: string
  status: ExecutionPhaseStatus
  startedAt: string | null
  completedAt: string | null
  events: JobLog[]
  /** Elapsed duration in milliseconds (null if still running or pending) */
  elapsedMs: number | null
}

export interface BuildProgress {
  jobId: string
  status: JobStatus
  currentStep: string
  progress: number
  recentLogs: JobLog[]
  failureCategory?: string
}

// ─── Build Summary (shown in PreviewView after completion) ────

export interface BuildSummary {
  jobId: string
  projectId: string
  /** Number of files generated in the workspace */
  fileCount: number
  /** Total bytes of generated files */
  totalBytes: number
  /** Build duration in milliseconds (completedAt - startedAt) */
  durationMs: number
  /** Tech stack labels extracted from buildMeta */
  techStack: string[]
  /** Key generated files (entry points, config files, etc.) */
  keyFiles: string[]
  /** ISO timestamp when build completed */
  builtAt: string
}

// ─── File Upload ──────────────────────────────────────────────

export type UploadedFileType = 'image' | 'pdf' | 'text' | 'code' | 'other'

export interface UploadedFile {
  id: string
  name: string
  type: UploadedFileType
  mimeType: string
  size: number
  url: string
  extractedContent?: string
  chatId?: string
  projectId?: string
  createdAt: string
}

// ─── Credentials / Integrations ───────────────────────────────

export type IntegrationType =
  | 'supabase'
  | 'stripe'
  | 'paypal'
  | 'openai'
  | 'github'
  | 'vercel'
  | 'custom'

export interface CredentialRequest {
  id: string
  jobId: string
  integration: IntegrationType
  label: string
  /** Human-readable explanation of why this credential is needed */
  purpose?: string
  fields: CredentialField[]
  status: 'pending' | 'provided' | 'skipped' | 'expired' | 'cancelled'
  /** ISO timestamp when this request expires */
  expiresAt?: string
}

export interface CredentialField {
  key: string
  label: string
  type: 'text' | 'password' | 'url'
  placeholder?: string
  required: boolean
  value?: string
}

// ─── Error ────────────────────────────────────────────────────

export interface ErrorDetails {
  code: string
  message: string
  stack?: string
  filePath?: string
  line?: number
  repairAttempts?: number
  repairStatus?: 'attempting' | 'fixed' | 'failed'
  /** Server-side failure category (e.g. scaffold_failure, install_failure) */
  failureCategory?: string
  /** Server-side detailed error stack / output tail */
  errorDetails?: string
}

// ─── Socket Events ────────────────────────────────────────────
// socket.io-client requires callback signatures, not raw data types

export interface ServerToClientEvents {
  'chat:message': (message: Message) => void
  'chat:stream': (data: { messageId: string; delta: string; done: boolean }) => void
  'chat:typing': (data: { typing: boolean }) => void
  'plan:created': (plan: Plan) => void
  'plan:updated': (plan: Plan) => void
  'job:created': (job: Job) => void
  'job:updated': (job: Job) => void
  'job:log': (data: { jobId: string; log?: JobLog; msg?: string }) => void
  'job:complete': (data: { jobId: string; previewUrl?: string; url?: string }) => void
  'job:failed': (data: { jobId: string; error: { code: string; message: string; category?: string; retryCount?: number } }) => void
  'repair:started': (data: { jobId: string }) => void
  'repair:complete': (data: { jobId: string; fixed: boolean }) => void
  'preview:ready': (data: { jobId: string; url: string }) => void
  'credentials:requested': (request: CredentialRequest) => void
  'credentials:provided': (data: { requestId: string; jobId: string }) => void
  'credentials:skipped': (data: { requestId: string; jobId: string }) => void
  'browser:approval_required': (data: {
    sessionId: string
    domain: string
    purpose: string
    plannedActions: string[]
    source: BrowserSessionSource
  }) => void
  'browser:session_started': (data: { sessionId: string }) => void
  'browser:action_executing': (data: { sessionId: string; actionId: string; description: string }) => void
  'browser:action_complete': (data: { sessionId: string; actionId: string; screenshotAfterPath?: string }) => void
  'browser:action_failed': (data: { sessionId: string; actionId: string; error: string }) => void
  'browser:session_complete': (data: { sessionId: string }) => void
  'browser:session_terminated': (data: { sessionId: string; reason: string }) => void
  'error': (data: { message: string; code?: string }) => void
}

export interface ClientToServerEvents {
  'chat:send': (data: { chatId: string; content: string; fileIds?: string[] }) => void
  'plan:approve': (data: { planId: string; projectId: string }) => void
  'plan:reject': (data: { planId: string; reason?: string }) => void
  'plan:modify': (data: { planId: string; modifications: string }) => void
  'credentials:provide': (data: { requestId: string; values: Record<string, string> }) => void
  'credentials:skip': (data: { requestId: string }) => void
  'browser:approve': (data: { sessionId: string }) => void
  'browser:deny': (data: { sessionId: string }) => void
  'browser:terminate': (data: { sessionId: string }) => void
  'job:cancel': (data: { jobId: string }) => void
  'join:project': (data: { projectId: string }) => void
  'leave:project': (data: { projectId: string }) => void
}

/** @deprecated Use ServerToClientEvents / ClientToServerEvents directly */
export type SocketEvents = ServerToClientEvents & ClientToServerEvents

// ─── UI State ─────────────────────────────────────────────────

export interface SidebarState {
  isOpen: boolean
  activeProjectId: string | null
}

export interface RightPanelState {
  mode: PanelState
  activeJobId: string | null
  previewUrl: string | null
  buildProgress: BuildProgress | null
  error: ErrorDetails | null
}

// ─── API Response ─────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

// ─── Browser Control ─────────────────────────────────────────

export type BrowserSessionStatus =
  | 'pending_approval'
  | 'active'
  | 'completed'
  | 'terminated_by_user'
  | 'terminated_timeout'
  | 'failed'

export type BrowserActionType =
  | 'navigate'
  | 'click'
  | 'type_text'
  | 'screenshot'
  | 'wait'
  | 'scroll'
  | 'extract_text'

export type BrowserActionStatus = 'pending' | 'executing' | 'complete' | 'failed'

export type BrowserSessionSource = 'build' | 'repair' | 'manual' | 'live_test'

export interface BrowserSession {
  id: string
  userId: string
  jobId?: string
  domain: string
  purpose: string
  plannedActions: string[]
  source: BrowserSessionSource
  status: BrowserSessionStatus
  grantedAt?: string
  closedAt?: string
  closedReason?: string
  createdAt: string
  actions?: BrowserAction[]
}

export interface BrowserAction {
  id: string
  sessionId: string
  type: BrowserActionType
  description: string
  target?: string
  /** value is always redacted — never contains real secrets */
  value?: string
  screenshotBeforePath?: string
  screenshotAfterPath?: string
  status: BrowserActionStatus
  error?: string
  executedAt?: string
  createdAt: string
}

// ─── Intent Classification ────────────────────────────────────

export type UserIntent =
  | 'greeting'
  | 'question'
  | 'brainstorming'
  | 'build_request'
  | 'refine_request'
  | 'file_upload'
  | 'credential_provide'
  | 'fix_request'
  | 'unclear'

export interface IntentAnalysis {
  intent: UserIntent
  confidence: number
  isBuildReady: boolean
  missingContext: string[]
  suggestedQuestions: string[]
}
