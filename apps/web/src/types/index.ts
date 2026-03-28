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

export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  createdAt: string
  credits?: number
  plan?: PlanTier
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
  | 'continuation_suggested'
  | 'repair_suggested'
  | 'error_analysis'

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
  /** Populated for continuation_suggested messages */
  continuationSuggestion?: { jobId: string; request: string }
  /** Populated for repair_suggested messages */
  repairSuggestion?: { jobId: string; complaint?: string; canAutoRepair: boolean }
  /** Populated for error_analysis messages (S9) */
  errorAnalysis?: ErrorAnalysis
  /** Auto-repair attempt number (1-based) */
  autoRepairAttempt?: number
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
  previewPid?: number
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

// ─── Error Analysis (S9 — AI-Native Debugger) ────────────────

export type ErrorAnalysisType =
  | 'syntax_error'
  | 'import_error'
  | 'type_error'
  | 'runtime_error'
  | 'config_error'
  | 'dependency_error'
  | 'build_error'
  | 'unknown'

export interface ErrorAnalysis {
  /** Plain-language root cause explanation */
  rootCause: string
  /** Classified error category */
  errorType: ErrorAnalysisType
  /** Files likely responsible for the error */
  affectedFiles: string[]
  /** Concrete fix description used as repair complaint */
  proposedFix: string
  /** AI confidence 0–1 */
  confidence: number
  /** Raw error output (truncated) */
  rawError: string
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

// ─── Testing & Security Types ──────────────────────────────────

export interface TestCoverageSummary {
  statements: { total: number; covered: number; percent: number }
  branches: { total: number; covered: number; percent: number }
  functions: { total: number; covered: number; percent: number }
  lines: { total: number; covered: number; percent: number }
}

export interface SecurityFinding {
  ruleId: string
  category: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  filePath: string
  line: number
  snippet: string
  fix: string
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
  'job:complete': (data: {
    jobId: string
    previewUrl?: string
    url?: string
    fileCount?: number
    totalBytes?: number
    techStack?: string[]
    keyFiles?: string[]
    integrations?: string[]
    buildTimestamp?: string
  }) => void
  'job:failed': (data: { jobId: string; error: { code: string; message: string; category?: string; retryCount?: number } }) => void
  'job:file_token': (data: { jobId: string; path: string; delta: string }) => void
  'job:targeted_repair': (data: { jobId: string; filesToRepair: string[]; repairSummary: string; previewUrl?: string }) => void
  'job:continuation_suggested': (data: { jobId: string; request: string; canContinue: boolean }) => void
  'job:repair_suggested': (data: { jobId: string; reason: string; complaint?: string; canAutoRepair: boolean }) => void
  'job:continuation_complete': (data: { jobId: string; previewUrl?: string }) => void
  'job:error_analysis': (data: {
    jobId: string
    errorAnalysis: ErrorAnalysis
    attempt: number
    autoRepairTriggered: boolean
  }) => void
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
  // ── Multi-agent system events ──
  'agent:status': (payload: AgentStatusPayload) => void
  'agent:fileChange': (payload: FileChangePayload) => void
  'agent:snapshot': (snapshot: AgentProgressSnapshot) => void
  'job:test_results': (data: {
    jobId: string
    numTests: number
    numPassed: number
    numFailed: number
    success: boolean
    coverage: TestCoverageSummary | null
    failures: Array<{ suiteName: string; testName: string; error: string; filePath: string }>
  }) => void
  'job:security_audit': (data: {
    jobId: string
    securityScore: number
    counts: Record<string, number>
    findings: Array<SecurityFinding>
    vulnerabilities: Array<{ name: string; version: string; severity: string; description: string }>
  }) => void
  'job:refactor_analysis': (data: {
    jobId: string
    smells: Array<{ type: string; count: number; severity: string }>
    plans: Array<{ id: string; title: string; risk: string; affectedFiles: number }>
    dependencies: { outdated: number; critical: number }
    migrations: Array<{ id: string; name: string }>
  }) => void
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
  'job:repair': (data: { jobId: string }) => void
  'job:continuation_approve': (data: { existingJobId: string; request: string }) => void
  'job:targeted_repair': (data: { jobId: string; complaint: string }) => void
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

// ─── Multi-Agent System ────────────────────────────────────────

export type AgentRole =
  | 'maxclaw' | 'openclaw'
  | 'planner' | 'installer' | 'frontend' | 'backend'
  | 'fixer' | 'qa' | 'deploy'
  | 'devops' | 'image' | 'android' | 'ios'
  | 'refactor'

export type AgentLayer = 'orchestration' | 'core' | 'specialist'

export type PipelineStatus =
  | 'idle' | 'planning' | 'running' | 'recovering' | 'complete' | 'error' | 'cancelled'

export type AgentTaskStatus =
  | 'idle' | 'running' | 'complete' | 'error' | 'waiting' | 'skipped'

export type PreviewHealthStatus =
  | 'healthy' | 'recovering' | 'degraded' | 'blocked' | 'starting' | 'stopped'

export type ReleaseStatus =
  | 'validating' | 'ready' | 'deploying' | 'deployed' | 'failed' | 'idle'

export type AssetStatus =
  | 'pending' | 'generating' | 'ready' | 'applied' | 'failed'

export interface AgentStatusPayload {
  type: 'pipeline' | 'agent' | 'preview' | 'release' | 'asset'
  status: string
  agent?: AgentRole | string
  message: string
  timestamp: string
  meta?: Record<string, unknown>
}

export interface FileChangePayload {
  action: 'created' | 'modified' | 'deleted'
  filePath: string
  agent: AgentRole
  summary: string
  timestamp: string
}

export interface AgentProgressSnapshot {
  pipeline: PipelineStatus
  agents: Record<string, AgentTaskStatus>
  preview: PreviewHealthStatus
  release: ReleaseStatus
  assets: Array<{ name: string; status: AssetStatus }>
  progress: { total: number; completed: number; failed: number }
  startedAt?: string
  elapsedMs?: number
}

/** Maps agent role to a user-friendly display label */
export const AGENT_DISPLAY_NAMES: Record<AgentRole, string> = {
  maxclaw: 'MaxClaw',
  openclaw: 'OpenClaw',
  planner: 'Planner',
  installer: 'Environment Setup',
  frontend: 'Frontend Builder',
  backend: 'Backend Builder',
  fixer: 'Auto-Fixer',
  qa: 'QA & Hardening',
  deploy: 'Deploy',
  devops: 'DevOps',
  image: 'Image Generator',
  android: 'Android',
  ios: 'iOS',
  refactor: 'Refactor / Migration',
}

export const AGENT_STEP_LABELS: Record<AgentRole, string> = {
  maxclaw: 'Analyzing strategy...',
  openclaw: 'Orchestrating execution...',
  planner: 'Planning...',
  installer: 'Setting up environment...',
  frontend: 'Building frontend...',
  backend: 'Building backend...',
  fixer: 'Fixing issues...',
  qa: 'Running QA...',
  deploy: 'Preparing deploy...',
  devops: 'Configuring infrastructure...',
  image: 'Generating images...',
  android: 'Building Android...',
  ios: 'Building iOS...',
  refactor: 'Analyzing code quality...',
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
