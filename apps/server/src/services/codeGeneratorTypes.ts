// ─── Shared types for codeGenerator ──────────────────────────

export interface CodeGenProject {
  projectName: string
  summary: string
  features: string[]
  techStack: Record<string, string[]>
  frontendScope: string[]
  backendScope: string[]
  integrations: string[]
  /**
   * Combined project + user memory context from getCombinedContext().
   * Injected into AI prompts to inform generation with prior decisions,
   * confirmed stack, and user preferences. Optional — omitted on first build.
   */
  memoryContext?: string
  /**
   * Formatted rules block from buildRulesBlock() — combines user-level and
   * project-level rules into a single instruction string. Injected into every
   * AI file generation prompt so generated code respects user preferences
   * (e.g. "use Tailwind only", "TypeScript strict", "no inline styles").
   * Optional — omitted when no rules have been set.
   */
  rulesBlock?: string
  /**
   * Compact repo snapshot context from buildRepoContext() — describes what
   * already exists in the workspace (components, routes, API endpoints,
   * Prisma models, dependencies). Injected into every AI file generation
   * prompt to prevent duplication and guide additive generation.
   * Optional — omitted on first build when no snapshot exists yet.
   */
  repoContext?: string
  /**
   * Product intelligence context from buildProductIntelligenceContext() —
   * branding direction, user flows, page hierarchy, marketing copy, analytics.
   * Injected into Frontend/Image agent prompts for product-aware generation.
   * Optional — omitted when product intelligence generation fails or is unavailable.
   */
  productIntelligenceContext?: string
  /**
   * Database intelligence context from buildDatabaseContext() — schema design,
   * query analysis, RLS policies, migration plans. Injected into backend/API
   * prompts for database-aware code generation.
   * Optional — omitted when database architect fails or no backend scope exists.
   */
  databaseContext?: string
}

export interface GeneratedFile {
  relativePath: string
  content: string
  generatedBy: 'ai' | 'template'
  bytes: number
}

export interface CodeGenCallbacks {
  onFileStart: (path: string, description: string) => Promise<void>
  onFileComplete: (path: string, bytes: number, generatedBy: 'ai' | 'template', content: string) => Promise<void>
  onFileError: (path: string, error: string) => Promise<void>
  onPhaseStart: (phase: string, fileCount: number) => Promise<void>
  /** Called for each streaming token delta during AI file generation */
  onFileToken?: (path: string, delta: string) => Promise<void>
  /** Called when a validation error is detected */
  onValidationError?: (error: import('./codeValidation').ValidationError) => Promise<void>
}

/** A dynamic page derived from frontendScope keyword matching */
export interface DynamicPage {
  /** Normalized PascalCase component name, e.g. "Pricing" */
  name: string
  /** File path relative to workspace root, e.g. "src/pages/Pricing.tsx" */
  relativePath: string
  /** React Router route path, e.g. "/pricing" */
  routePath: string
  /** Original frontendScope item that triggered this page */
  scopeItem: string
}
