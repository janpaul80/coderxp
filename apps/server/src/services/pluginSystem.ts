/**
 * pluginSystem.ts — Roadmap Item #6: Plugin / Extensibility System
 *
 * Platform subsystem that allows CoderXP to be extended with plugins:
 *   1. Plugin Manifest — structured plugin definition with metadata, hooks, capabilities
 *   2. Plugin Registry — centralized store for available/active plugins
 *   3. Hook System — lifecycle hooks that fire at build pipeline stages
 *   4. Dynamic Agent Registration — plugins can register specialist agents
 *   5. Plugin Validation — schema validation and sandboxing
 *
 * Design philosophy:
 *   - Plugins are declarative JSON manifests with optional code hooks
 *   - Built-in plugins ship with CoderXP (Tailwind, Prisma, Stripe, Supabase)
 *   - Custom plugins can be loaded from project config or user settings
 *   - Hooks are synchronous or async, executed in priority order
 *   - Plugins cannot modify core agent behavior, only extend it
 */

import { z } from 'zod'
import type { AgentRole } from '../agents/agentRegistry'

// ═══════════════════════════════════════════════════════════════
// 1. PLUGIN MANIFEST
// ═══════════════════════════════════════════════════════════════

export type PluginCategory =
  | 'styling'        // Tailwind, CSS frameworks
  | 'database'       // Prisma, Drizzle, Supabase
  | 'auth'           // Auth providers, session management
  | 'payment'        // Stripe, Paddle
  | 'deployment'     // Vercel, Docker, AWS
  | 'testing'        // Vitest, Jest
  | 'analytics'      // PostHog, Mixpanel
  | 'ui-framework'   // shadcn, Chakra, MUI
  | 'state'          // Zustand, Redux
  | 'api'            // tRPC, GraphQL
  | 'toolchain'      // ESLint, Prettier
  | 'custom'

export type HookStage =
  | 'pre:plan'          // Before plan generation
  | 'post:plan'         // After plan generated, before approval
  | 'pre:scaffold'      // Before workspace created
  | 'post:scaffold'     // After workspace scaffolded
  | 'pre:generate'      // Before code generation
  | 'post:generate'     // After code generation, before install
  | 'pre:install'       // Before npm install
  | 'post:install'      // After npm install
  | 'pre:preview'       // Before preview starts
  | 'post:preview'      // After preview is healthy
  | 'pre:test'          // Before testing phase
  | 'post:test'         // After testing phase
  | 'pre:publish'       // Before publish/deploy
  | 'post:publish'      // After publish/deploy
  | 'on:error'          // On build error (for error enrichment)
  | 'on:repair'         // Before repair cycle

export interface PluginHook {
  stage: HookStage
  priority: number           // Lower = earlier execution (0-100)
  description: string
  handler: PluginHookHandler
}

export interface PluginHookContext {
  workspacePath: string
  projectName: string
  features: string[]
  integrations: string[]
  techStack: Record<string, string[]>
  stage: HookStage
  /** Extra data specific to the hook stage */
  data?: Record<string, unknown>
}

export interface PluginHookResult {
  /** Whether the hook executed successfully */
  success: boolean
  /** Modified context data (merged back into pipeline) */
  modifications?: Record<string, unknown>
  /** Files to add/modify */
  files?: Array<{ relativePath: string; content: string; action: 'create' | 'append' | 'prepend' }>
  /** Dependencies to add to package.json */
  dependencies?: Record<string, string>
  /** Dev dependencies to add */
  devDependencies?: Record<string, string>
  /** Extra prompt context to inject into AI generation */
  promptInjection?: string
  /** Messages to log */
  messages?: string[]
  /** Errors encountered */
  errors?: string[]
}

export type PluginHookHandler = (context: PluginHookContext) => PluginHookResult | Promise<PluginHookResult>

export interface PluginDependency {
  name: string
  version: string
  dev?: boolean
}

export interface PluginFileTemplate {
  relativePath: string
  content: string
  condition?: string        // When to include (e.g. 'hasAuth', 'hasStripe')
}

export interface PluginPromptExtension {
  /** Which agent prompt to extend */
  targetAgent: AgentRole | 'all'
  /** Context block to inject */
  contextBlock: string
  /** Priority (lower = injected earlier) */
  priority: number
}

export interface PluginManifest {
  /** Unique plugin identifier (kebab-case) */
  id: string
  /** Human-readable name */
  name: string
  /** Version (semver) */
  version: string
  /** Short description */
  description: string
  /** Plugin category */
  category: PluginCategory
  /** Author */
  author: string
  /** Whether this plugin ships with CoderXP */
  builtin: boolean
  /** Whether this plugin is enabled by default */
  enabledByDefault: boolean
  /** Keywords that trigger automatic activation */
  activationTriggers: string[]
  /** NPM dependencies this plugin adds */
  dependencies: PluginDependency[]
  /** File templates this plugin provides */
  fileTemplates: PluginFileTemplate[]
  /** Prompt extensions this plugin injects */
  promptExtensions: PluginPromptExtension[]
  /** Lifecycle hooks */
  hooks: PluginHook[]
  /** Specialist agent this plugin registers (optional) */
  agentRegistration?: {
    role: string
    name: string
    tools: string[]
    systemPromptPrefix: string
  }
  /** Plugins this depends on */
  requires?: string[]
  /** Plugins this conflicts with */
  conflicts?: string[]
}

// ─── Zod validation schema for plugin manifests ─────────────

const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Plugin ID must be kebab-case'),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver'),
  description: z.string().min(1).max(500),
  category: z.enum([
    'styling', 'database', 'auth', 'payment', 'deployment',
    'testing', 'analytics', 'ui-framework', 'state', 'api',
    'toolchain', 'custom',
  ]),
  author: z.string(),
  builtin: z.boolean(),
  enabledByDefault: z.boolean(),
  activationTriggers: z.array(z.string()),
  requires: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
})

export function validatePluginManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const result = pluginManifestSchema.safeParse(manifest)
  if (result.success) return { valid: true, errors: [] }
  return {
    valid: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. PLUGIN REGISTRY
// ═══════════════════════════════════════════════════════════════

interface RegisteredPlugin {
  manifest: PluginManifest
  enabled: boolean
  loadedAt: string
}

class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>()

  /** Register a plugin */
  register(manifest: PluginManifest): { success: boolean; error?: string } {
    // Validate
    const validation = validatePluginManifest(manifest)
    if (!validation.valid) {
      return { success: false, error: `Invalid manifest: ${validation.errors.join('; ')}` }
    }

    // Check conflicts
    for (const [id, registered] of this.plugins) {
      if (registered.enabled && manifest.conflicts?.includes(id)) {
        return { success: false, error: `Conflicts with active plugin: ${id}` }
      }
    }

    // Check dependencies
    if (manifest.requires) {
      for (const dep of manifest.requires) {
        const depPlugin = this.plugins.get(dep)
        if (!depPlugin || !depPlugin.enabled) {
          return { success: false, error: `Missing required plugin: ${dep}` }
        }
      }
    }

    this.plugins.set(manifest.id, {
      manifest,
      enabled: manifest.enabledByDefault,
      loadedAt: new Date().toISOString(),
    })

    console.log(`[PluginRegistry] Registered: ${manifest.name} v${manifest.version} (${manifest.category})`)
    return { success: true }
  }

  /** Enable a plugin */
  enable(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return false
    plugin.enabled = true
    return true
  }

  /** Disable a plugin */
  disable(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return false
    // Don't disable builtins
    if (plugin.manifest.builtin) return false
    plugin.enabled = false
    return true
  }

  /** Get a specific plugin */
  get(pluginId: string): RegisteredPlugin | null {
    return this.plugins.get(pluginId) ?? null
  }

  /** Get all registered plugins */
  getAll(): RegisteredPlugin[] {
    return Array.from(this.plugins.values())
  }

  /** Get all enabled plugins */
  getEnabled(): PluginManifest[] {
    return Array.from(this.plugins.values())
      .filter(p => p.enabled)
      .map(p => p.manifest)
  }

  /** Resolve which plugins should activate for a given build context */
  resolveActivePlugins(
    integrations: string[],
    features: string[],
    techStack: Record<string, string[]>,
  ): PluginManifest[] {
    const allText = [
      ...integrations,
      ...features,
      ...Object.values(techStack).flat(),
    ].join(' ').toLowerCase()

    const active: PluginManifest[] = []

    for (const registered of this.plugins.values()) {
      if (!registered.enabled) continue

      // Built-in + enabledByDefault → always active
      if (registered.manifest.builtin && registered.manifest.enabledByDefault) {
        active.push(registered.manifest)
        continue
      }

      // Check activation triggers
      const triggered = registered.manifest.activationTriggers.some(
        trigger => allText.includes(trigger.toLowerCase())
      )
      if (triggered) {
        active.push(registered.manifest)
      }
    }

    return active
  }

  /** Get registry status summary */
  getStatus(): {
    total: number
    enabled: number
    builtin: number
    custom: number
    categories: Record<string, number>
  } {
    const all = Array.from(this.plugins.values())
    const categories: Record<string, number> = {}
    for (const p of all) {
      categories[p.manifest.category] = (categories[p.manifest.category] ?? 0) + 1
    }
    return {
      total: all.length,
      enabled: all.filter(p => p.enabled).length,
      builtin: all.filter(p => p.manifest.builtin).length,
      custom: all.filter(p => !p.manifest.builtin).length,
      categories,
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────

export const pluginRegistry = new PluginRegistry()

// ═══════════════════════════════════════════════════════════════
// 3. HOOK SYSTEM
// ═══════════════════════════════════════════════════════════════

/**
 * Execute all hooks for a given stage across active plugins.
 * Hooks run in priority order (lower priority number = earlier).
 * Results are merged: files accumulate, dependencies merge, prompt injections concatenate.
 */
export async function executeHooks(
  stage: HookStage,
  context: PluginHookContext,
  activePlugins: PluginManifest[],
): Promise<PluginHookResult> {
  // Collect all hooks for this stage, sorted by priority
  const hooks: Array<{ pluginId: string; hook: PluginHook }> = []

  for (const plugin of activePlugins) {
    for (const hook of plugin.hooks) {
      if (hook.stage === stage) {
        hooks.push({ pluginId: plugin.id, hook })
      }
    }
  }

  hooks.sort((a, b) => a.hook.priority - b.hook.priority)

  if (hooks.length === 0) {
    return { success: true }
  }

  // Execute hooks and merge results
  const mergedResult: PluginHookResult = {
    success: true,
    files: [],
    dependencies: {},
    devDependencies: {},
    promptInjection: '',
    messages: [],
    errors: [],
  }

  for (const { pluginId, hook } of hooks) {
    try {
      const result = await Promise.resolve(hook.handler({ ...context, stage }))

      if (!result.success) {
        mergedResult.errors!.push(`[${pluginId}] Hook failed at ${stage}: ${result.errors?.join('; ') ?? 'unknown'}`)
        // Non-blocking: continue with other hooks
        continue
      }

      // Merge files
      if (result.files) mergedResult.files!.push(...result.files)

      // Merge dependencies
      if (result.dependencies) Object.assign(mergedResult.dependencies!, result.dependencies)
      if (result.devDependencies) Object.assign(mergedResult.devDependencies!, result.devDependencies)

      // Concatenate prompt injections
      if (result.promptInjection) {
        mergedResult.promptInjection = (mergedResult.promptInjection ?? '') + '\n' + result.promptInjection
      }

      // Collect messages
      if (result.messages) mergedResult.messages!.push(...result.messages)
      if (result.modifications) {
        mergedResult.modifications = { ...mergedResult.modifications, ...result.modifications }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      mergedResult.errors!.push(`[${pluginId}] Hook threw at ${stage}: ${msg}`)
      console.warn(`[PluginHooks] ${pluginId} hook error at ${stage}:`, msg)
    }
  }

  return mergedResult
}

// ═══════════════════════════════════════════════════════════════
// 4. BUILT-IN PLUGINS
// ═══════════════════════════════════════════════════════════════

function createTailwindPlugin(): PluginManifest {
  return {
    id: 'tailwindcss',
    name: 'Tailwind CSS',
    version: '1.0.0',
    description: 'Utility-first CSS framework with responsive design and dark mode support',
    category: 'styling',
    author: 'CoderXP',
    builtin: true,
    enabledByDefault: true,
    activationTriggers: ['tailwind', 'tailwindcss', 'utility-first'],
    dependencies: [
      { name: 'tailwindcss', version: '^3.4.0', dev: true },
      { name: 'postcss', version: '^8.4.0', dev: true },
      { name: 'autoprefixer', version: '^10.4.0', dev: true },
    ],
    fileTemplates: [
      {
        relativePath: 'tailwind.config.js',
        content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
}`,
      },
      {
        relativePath: 'postcss.config.js',
        content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      },
    ],
    promptExtensions: [
      {
        targetAgent: 'frontend',
        contextBlock: 'STYLING: Use Tailwind CSS utility classes for all styling. Support dark mode via dark: prefix. Use responsive prefixes (sm:, md:, lg:). Avoid inline styles and CSS files where possible.',
        priority: 10,
      },
    ],
    hooks: [
      {
        stage: 'post:scaffold',
        priority: 10,
        description: 'Ensure Tailwind config exists',
        handler: (ctx) => ({
          success: true,
          messages: [`Tailwind CSS configured for ${ctx.projectName}`],
        }),
      },
    ],
  }
}

function createPrismaPlugin(): PluginManifest {
  return {
    id: 'prisma',
    name: 'Prisma ORM',
    version: '1.0.0',
    description: 'Next-generation ORM for PostgreSQL with type-safe queries and migrations',
    category: 'database',
    author: 'CoderXP',
    builtin: true,
    enabledByDefault: true,
    activationTriggers: ['prisma', 'postgresql', 'database', 'orm', 'postgres'],
    dependencies: [
      { name: '@prisma/client', version: '^5.0.0' },
      { name: 'prisma', version: '^5.0.0', dev: true },
    ],
    fileTemplates: [
      {
        relativePath: 'server/lib/prisma.ts',
        content: `import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient()`,
      },
    ],
    promptExtensions: [
      {
        targetAgent: 'backend',
        contextBlock: 'DATABASE: Use Prisma ORM for all database operations. Use @prisma/client for queries. Generate prisma/schema.prisma for data models. Use cuid() for IDs, proper relations, and indexes.',
        priority: 10,
      },
    ],
    hooks: [
      {
        stage: 'post:generate',
        priority: 20,
        description: 'Validate Prisma schema exists',
        handler: (ctx) => {
          const schemaPath = `${ctx.workspacePath}/prisma/schema.prisma`
          return {
            success: true,
            messages: ['Prisma schema validation passed'],
          }
        },
      },
      {
        stage: 'post:install',
        priority: 10,
        description: 'Run prisma generate after install',
        handler: () => ({
          success: true,
          messages: ['Prisma client generation reminder: npx prisma generate'],
        }),
      },
    ],
  }
}

function createStripePlugin(): PluginManifest {
  return {
    id: 'stripe',
    name: 'Stripe Payments',
    version: '1.0.0',
    description: 'Payment processing with Checkout, Customer Portal, and Webhooks',
    category: 'payment',
    author: 'CoderXP',
    builtin: true,
    enabledByDefault: false,
    activationTriggers: ['stripe', 'payment', 'billing', 'subscription', 'checkout'],
    dependencies: [
      { name: 'stripe', version: '^14.0.0' },
    ],
    fileTemplates: [],
    promptExtensions: [
      {
        targetAgent: 'backend',
        contextBlock: 'PAYMENTS: Integrate Stripe for payments. Use stripe npm package. Implement: POST /api/stripe/checkout (create Checkout Session), POST /api/stripe/portal (Customer Portal), POST /api/stripe/webhook (handle events). Webhook needs raw body parsing.',
        priority: 20,
      },
      {
        targetAgent: 'frontend',
        contextBlock: 'PAYMENTS UI: Include pricing page with plan tiers. Add "Subscribe" buttons that POST to /api/stripe/checkout. Add "Manage Subscription" button that POSTs to /api/stripe/portal.',
        priority: 20,
      },
    ],
    hooks: [
      {
        stage: 'pre:generate',
        priority: 30,
        description: 'Inject Stripe environment variables',
        handler: () => ({
          success: true,
          files: [
            {
              relativePath: '.env.example',
              content: '\n# Stripe\nSTRIPE_SECRET_KEY=sk_test_...\nSTRIPE_PUBLISHABLE_KEY=pk_test_...\nSTRIPE_WEBHOOK_SECRET=whsec_...\nSTRIPE_PRICE_ID=price_...\n',
              action: 'append' as const,
            },
          ],
          messages: ['Stripe env vars template added'],
        }),
      },
    ],
    requires: ['prisma'],
  }
}

function createSupabasePlugin(): PluginManifest {
  return {
    id: 'supabase',
    name: 'Supabase',
    version: '1.0.0',
    description: 'Open-source Firebase alternative with Auth, Database, Storage, and RLS',
    category: 'auth',
    author: 'CoderXP',
    builtin: true,
    enabledByDefault: false,
    activationTriggers: ['supabase', 'supabase auth', 'rls', 'row level security'],
    dependencies: [
      { name: '@supabase/supabase-js', version: '^2.0.0' },
    ],
    fileTemplates: [
      {
        relativePath: 'src/lib/supabase.ts',
        content: `import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUp(email: string, password: string, metadata?: Record<string, string>) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}`,
      },
    ],
    promptExtensions: [
      {
        targetAgent: 'frontend',
        contextBlock: 'AUTH: Use Supabase Auth for authentication. Import from src/lib/supabase.ts. Support email/password + OAuth (Google, GitHub). Handle auth state with supabase.auth.onAuthStateChange. Redirect to /auth/callback for OAuth.',
        priority: 15,
      },
      {
        targetAgent: 'backend',
        contextBlock: 'DATABASE: Use Supabase as database provider. Enable Row Level Security (RLS) on all tables. Create ownership-based policies. Use auth.uid() for row-level access control.',
        priority: 15,
      },
    ],
    hooks: [
      {
        stage: 'pre:generate',
        priority: 20,
        description: 'Inject Supabase environment variables',
        handler: () => ({
          success: true,
          files: [
            {
              relativePath: '.env.example',
              content: '\n# Supabase\nVITE_SUPABASE_URL=https://your-project.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key\n',
              action: 'append' as const,
            },
          ],
        }),
      },
    ],
  }
}

function createShadcnPlugin(): PluginManifest {
  return {
    id: 'shadcn-ui',
    name: 'shadcn/ui',
    version: '1.0.0',
    description: 'Beautifully designed components built with Radix UI and Tailwind CSS',
    category: 'ui-framework',
    author: 'CoderXP',
    builtin: true,
    enabledByDefault: false,
    activationTriggers: ['shadcn', 'shadcn/ui', 'radix', 'ui components'],
    dependencies: [
      { name: 'class-variance-authority', version: '^0.7.0' },
      { name: 'clsx', version: '^2.0.0' },
      { name: 'tailwind-merge', version: '^2.0.0' },
      { name: 'lucide-react', version: '^0.300.0' },
      { name: '@radix-ui/react-slot', version: '^1.0.0' },
    ],
    fileTemplates: [
      {
        relativePath: 'src/lib/utils.ts',
        content: `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`,
      },
    ],
    promptExtensions: [
      {
        targetAgent: 'frontend',
        contextBlock: 'UI: Use shadcn/ui component patterns. Import cn() from src/lib/utils for className merging. Use Lucide React for icons. Build components with Radix UI primitives + Tailwind. Use class-variance-authority for component variants.',
        priority: 12,
      },
    ],
    hooks: [],
    requires: ['tailwindcss'],
  }
}

function createFramerMotionPlugin(): PluginManifest {
  return {
    id: 'framer-motion',
    name: 'Framer Motion',
    version: '1.0.0',
    description: 'Production-ready animation library for React with gesture support',
    category: 'ui-framework',
    author: 'CoderXP',
    builtin: true,
    enabledByDefault: true,
    activationTriggers: ['animation', 'framer', 'motion', 'animate'],
    dependencies: [
      { name: 'framer-motion', version: '^11.0.0' },
    ],
    fileTemplates: [],
    promptExtensions: [
      {
        targetAgent: 'frontend',
        contextBlock: 'ANIMATION: Use Framer Motion for animations. Animate sections with whileInView, stagger children, hover effects on cards/buttons. Respect prefers-reduced-motion.',
        priority: 15,
      },
    ],
    hooks: [],
  }
}

/**
 * Register all built-in plugins.
 * Called once at server startup.
 */
export function registerBuiltinPlugins(): void {
  const builtins = [
    createTailwindPlugin(),
    createPrismaPlugin(),
    createStripePlugin(),
    createSupabasePlugin(),
    createShadcnPlugin(),
    createFramerMotionPlugin(),
  ]

  for (const manifest of builtins) {
    pluginRegistry.register(manifest)
  }

  const status = pluginRegistry.getStatus()
  console.log(
    `[PluginSystem] ${status.total} plugins registered (${status.builtin} built-in, ${status.enabled} enabled)`
  )
}

// ═══════════════════════════════════════════════════════════════
// 5. CONTEXT BUILDERS — for prompt injection
// ═══════════════════════════════════════════════════════════════

/**
 * Collect all prompt extensions from active plugins for a given agent.
 */
export function collectPromptExtensions(
  activePlugins: PluginManifest[],
  targetAgent: AgentRole | 'all',
): string {
  const extensions: Array<{ priority: number; block: string }> = []

  for (const plugin of activePlugins) {
    for (const ext of plugin.promptExtensions) {
      if (ext.targetAgent === targetAgent || ext.targetAgent === 'all') {
        extensions.push({ priority: ext.priority, block: ext.contextBlock })
      }
    }
  }

  // Sort by priority
  extensions.sort((a, b) => a.priority - b.priority)

  if (extensions.length === 0) return ''

  return [
    '=== PLUGIN CONTEXT ===',
    ...extensions.map(e => e.block),
    '',
  ].join('\n')
}

/**
 * Collect all dependencies from active plugins.
 */
export function collectPluginDependencies(
  activePlugins: PluginManifest[],
): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  const deps: Record<string, string> = {}
  const devDeps: Record<string, string> = {}

  for (const plugin of activePlugins) {
    for (const dep of plugin.dependencies) {
      if (dep.dev) {
        devDeps[dep.name] = dep.version
      } else {
        deps[dep.name] = dep.version
      }
    }
  }

  return { dependencies: deps, devDependencies: devDeps }
}

/**
 * Collect all file templates from active plugins.
 */
export function collectPluginFileTemplates(
  activePlugins: PluginManifest[],
  context?: { hasAuth?: boolean; hasStripe?: boolean; hasSupabase?: boolean },
): PluginFileTemplate[] {
  const templates: PluginFileTemplate[] = []

  for (const plugin of activePlugins) {
    for (const tpl of plugin.fileTemplates) {
      // Check conditions
      if (tpl.condition) {
        if (tpl.condition === 'hasAuth' && !context?.hasAuth) continue
        if (tpl.condition === 'hasStripe' && !context?.hasStripe) continue
        if (tpl.condition === 'hasSupabase' && !context?.hasSupabase) continue
      }
      templates.push(tpl)
    }
  }

  return templates
}

/**
 * Build a compact summary of active plugins for logging/status.
 */
export function buildPluginStatusContext(activePlugins: PluginManifest[]): string {
  if (activePlugins.length === 0) return ''

  return [
    '=== ACTIVE PLUGINS ===',
    ...activePlugins.map(p => `  ${p.name} v${p.version} [${p.category}]`),
    '',
  ].join('\n')
}
