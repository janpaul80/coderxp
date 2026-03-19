/**
 * builderSpec.ts — Phase 8 Slice 2
 *
 * Coded XP's internal builder spec contract.
 * This is the normalized spec that ALL builder outputs must map into.
 * The build system NEVER sees raw Dify output — only validated BuilderSpec.
 *
 * Key exports:
 *  - BuilderSpec / BuilderType interfaces
 *  - builderSpecSchema — Zod validation (runs at normalization boundary)
 *  - builderSpecToPlanOutput() — normalization layer → PlanOutput
 *  - buildSpecSummary() — compact summary for frontend display
 *  - BUILDER_TYPES_CONFIG — static config for GET /api/builders/types
 */

import { z } from 'zod'
import type { PlanOutput } from './planner'

// ─── Builder types ────────────────────────────────────────────

export type BuilderType =
  | 'landing_page'
  | 'saas'
  | 'stripe_auth_supabase'

export const VALID_BUILDER_TYPES: BuilderType[] = [
  'landing_page',
  'saas',
  'stripe_auth_supabase',
]

// ─── Static builder type config (GET /api/builders/types) ─────

export interface BuilderTypeConfig {
  type: BuilderType
  name: string
  description: string
  tagline: string
  icon: string
  estimatedTime: string
  questionCount: number
  complexity: 'low' | 'medium' | 'high'
  features: string[]
}

export const BUILDER_TYPES_CONFIG: BuilderTypeConfig[] = [
  {
    type: 'landing_page',
    name: 'Landing Page',
    description: 'Fast, focused marketing site with hero, features, pricing, and CTA sections.',
    tagline: 'Ship a polished marketing site in minutes.',
    icon: '🚀',
    estimatedTime: '5–10 min',
    questionCount: 7,
    complexity: 'low',
    features: [
      'Hero section with headline + CTA',
      'Features / benefits section',
      'Pricing section (optional)',
      'Testimonials (optional)',
      'Contact form or email capture',
      'Responsive Tailwind design',
      'Vercel-ready deployment',
    ],
  },
  {
    type: 'saas',
    name: 'SaaS App',
    description: 'Full-stack SaaS with auth, dashboard, and optional Stripe billing.',
    tagline: 'Build a production-ready SaaS from scratch.',
    icon: '⚙️',
    estimatedTime: '15–25 min',
    questionCount: 8,
    complexity: 'high',
    features: [
      'User authentication (Supabase or JWT)',
      'Dashboard with core feature views',
      'Stripe billing (optional)',
      'PostgreSQL / Supabase database',
      'REST API backend',
      'Role-based access (optional)',
      'Vercel / Railway deployment',
    ],
  },
  {
    type: 'stripe_auth_supabase',
    name: 'Stripe + Auth + Supabase',
    description: 'Production-ready stack: Supabase auth + DB, Stripe billing, pre-wired end-to-end.',
    tagline: 'The complete monetized app starter.',
    icon: '💳',
    estimatedTime: '20–30 min',
    questionCount: 7,
    complexity: 'high',
    features: [
      'Supabase Auth (Google + GitHub OAuth)',
      'Stripe checkout + subscription plans',
      'Stripe webhook handler',
      'Supabase PostgreSQL database',
      'Protected dashboard routes',
      'Billing management page',
      'Vercel deployment',
    ],
  },
]

// ─── BuilderSpec interface ────────────────────────────────────
// This is Coded XP's internal contract — not Dify's output format.
// The build system only ever sees this normalized shape.

export interface BuilderPage {
  name: string
  path: string
  description: string
  authenticated: boolean
}

export interface BillingPlan {
  name: string
  price: number       // monthly USD cents (0 = free)
  features: string[]
}

export interface BuilderIntegration {
  name: string
  purpose: string
  required: boolean
}

export interface CredentialRequirement {
  integration: string
  label: string
  fields: Array<{
    key: string
    label: string
    type: 'text' | 'password' | 'url'
    required: boolean
  }>
  when: 'before_build' | 'during_build'
}

export interface BuilderSpec {
  // ── Builder metadata ──────────────────────────────────────
  builderType: BuilderType
  builderVersion: string        // e.g. '1.0.0'
  sessionId: string             // BuilderSession.id

  // ── Project identity ──────────────────────────────────────
  projectName: string
  projectGoal: string           // 1-2 sentence description

  // ── Pages / screens ───────────────────────────────────────
  pages: BuilderPage[]

  // ── Features ──────────────────────────────────────────────
  features: string[]            // user-facing feature list (3-10 items)

  // ── Auth ──────────────────────────────────────────────────
  auth: {
    required: boolean
    provider: 'supabase' | 'jwt_only' | 'none'
    socialProviders: string[]
  }

  // ── Billing ───────────────────────────────────────────────
  billing: {
    required: boolean
    provider: 'stripe' | 'none'
    plans: BillingPlan[]
  }

  // ── Database ──────────────────────────────────────────────
  database: {
    provider: 'supabase' | 'postgres' | 'none'
    tables: string[]
  }

  // ── Integrations ──────────────────────────────────────────
  integrations: BuilderIntegration[]

  // ── Styling / branding ────────────────────────────────────
  styling: {
    theme: 'minimal' | 'bold' | 'corporate' | 'playful'
    primaryColor?: string       // hex, e.g. '#6366f1'
    fontStyle: 'sans' | 'serif' | 'mono'
  }

  // ── Deployment ────────────────────────────────────────────
  deployment: {
    target: 'vercel' | 'railway' | 'docker'
  }

  // ── Credential requirements (pre-declared) ────────────────
  credentialRequirements: CredentialRequirement[]

  // ── Raw Dify output (preserved for debugging, never used downstream) ──
  _difyRaw?: unknown
}

// ─── Zod validation schema ────────────────────────────────────
// Every BuilderSpec produced by the normalization layer must pass this.
// Prevents malformed Dify output from reaching the build system.

export const builderSpecSchema = z.object({
  builderType: z.enum(['landing_page', 'saas', 'stripe_auth_supabase']),
  builderVersion: z.string().min(1),
  sessionId: z.string().min(1),
  projectName: z.string().min(1).max(100),
  projectGoal: z.string().min(10).max(500),
  pages: z.array(z.object({
    name: z.string().min(1),
    path: z.string().startsWith('/'),
    description: z.string().min(1),
    authenticated: z.boolean(),
  })).min(1).max(20),
  features: z.array(z.string().min(1)).min(1).max(15),
  auth: z.object({
    required: z.boolean(),
    provider: z.enum(['supabase', 'jwt_only', 'none']),
    socialProviders: z.array(z.string()),
  }),
  billing: z.object({
    required: z.boolean(),
    provider: z.enum(['stripe', 'none']),
    plans: z.array(z.object({
      name: z.string().min(1),
      price: z.number().min(0),
      features: z.array(z.string()),
    })),
  }),
  database: z.object({
    provider: z.enum(['supabase', 'postgres', 'none']),
    tables: z.array(z.string()),
  }),
  integrations: z.array(z.object({
    name: z.string().min(1),
    purpose: z.string().min(1),
    required: z.boolean(),
  })),
  styling: z.object({
    theme: z.enum(['minimal', 'bold', 'corporate', 'playful']),
    primaryColor: z.string().optional(),
    fontStyle: z.enum(['sans', 'serif', 'mono']),
  }),
  deployment: z.object({
    target: z.enum(['vercel', 'railway', 'docker']),
  }),
  credentialRequirements: z.array(z.object({
    integration: z.string().min(1),
    label: z.string().min(1),
    fields: z.array(z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(['text', 'password', 'url']),
      required: z.boolean(),
    })),
    when: z.enum(['before_build', 'during_build']),
  })),
  // _difyRaw is intentionally not in the schema — it's stripped before storage
})

// ─── BuilderSpecSummary — compact frontend display shape ──────
// Returned by GET /sessions/:id and POST /sessions/:id/message when complete.
// Never includes difyConversationId or _difyRaw.

export interface BuilderSpecSummary {
  projectName: string
  projectGoal: string
  builderType: BuilderType
  pages: string[]                // e.g. ['Landing Page (/)', 'Dashboard (/dashboard) [auth]']
  features: string[]
  auth: string                   // e.g. 'Supabase (Google, GitHub)' or 'None'
  billing: string                // e.g. 'Stripe — Starter $9/mo, Pro $29/mo' or 'None'
  database: string               // e.g. 'Supabase (projects, tasks)' or 'None'
  integrations: string[]         // e.g. ['Stripe — Payment processing', 'Resend — Email']
  deployment: string             // e.g. 'Vercel'
  credentialRequirements: Array<{
    label: string
    when: 'before_build' | 'during_build'
  }>
  estimatedComplexity: 'low' | 'medium' | 'high'
}

// ─── buildSpecSummary ─────────────────────────────────────────
// Converts a validated BuilderSpec into the compact summary for the frontend.

export function buildSpecSummary(spec: BuilderSpec): BuilderSpecSummary {
  const pages = spec.pages.map(p =>
    `${p.name} (${p.path})${p.authenticated ? ' [auth]' : ''}`
  )

  const auth = spec.auth.required
    ? spec.auth.provider === 'supabase'
      ? `Supabase${spec.auth.socialProviders.length > 0 ? ` (${spec.auth.socialProviders.join(', ')})` : ''}`
      : spec.auth.provider === 'jwt_only'
      ? 'JWT'
      : 'Required'
    : 'None'

  const billing = spec.billing.required && spec.billing.provider === 'stripe'
    ? `Stripe — ${spec.billing.plans.map(p =>
        `${p.name} $${(p.price / 100).toFixed(0)}/mo`
      ).join(', ')}`
    : 'None'

  const database = spec.database.provider !== 'none'
    ? `${spec.database.provider === 'supabase' ? 'Supabase' : 'PostgreSQL'}${
        spec.database.tables.length > 0
          ? ` (${spec.database.tables.join(', ')})`
          : ''
      }`
    : 'None'

  const integrations = spec.integrations.map(i => `${i.name} — ${i.purpose}`)

  const deployment = spec.deployment.target === 'vercel'
    ? 'Vercel'
    : spec.deployment.target === 'railway'
    ? 'Railway'
    : 'Docker'

  const credentialRequirements = spec.credentialRequirements.map(c => ({
    label: c.label,
    when: c.when,
  }))

  return {
    projectName: spec.projectName,
    projectGoal: spec.projectGoal,
    builderType: spec.builderType,
    pages,
    features: spec.features,
    auth,
    billing,
    database,
    integrations,
    deployment,
    credentialRequirements,
    estimatedComplexity: inferComplexity(spec),
  }
}

// ─── inferComplexity ──────────────────────────────────────────

function inferComplexity(spec: BuilderSpec): 'low' | 'medium' | 'high' {
  const score =
    spec.features.length +
    (spec.auth.required ? 2 : 0) +
    (spec.billing.required ? 3 : 0) +
    spec.integrations.length +
    spec.pages.length +
    spec.database.tables.length
  if (score >= 14) return 'high'
  if (score >= 7) return 'medium'
  return 'low'
}

// ─── builderSpecToPlanOutput ──────────────────────────────────
// THE normalization layer. Converts a validated BuilderSpec into the
// PlanOutput format that the existing planner pipeline understands.
//
// This is the single point of coupling between the builder layer and
// the execution engine. The build system never sees raw Dify output.
//
// Output MUST satisfy planOutputSchema:
//   - summary: min 10, max 500 chars
//   - features: min 1, max 20 items
//   - frontendScope: min 1, max 30 items
//   - backendScope: min 0, max 30 items
//   - executionSteps: min 2, max 15 items
//   - estimatedComplexity: 'low' | 'medium' | 'high'

export function builderSpecToPlanOutput(spec: BuilderSpec): PlanOutput {
  return {
    summary: spec.projectGoal,
    features: spec.features,
    techStack: buildTechStack(spec),
    frontendScope: buildFrontendScope(spec),
    backendScope: buildBackendScope(spec),
    integrations: spec.integrations.map(i => `${i.name} — ${i.purpose}`),
    executionSteps: buildExecutionSteps(spec),
    estimatedComplexity: inferComplexity(spec),
  }
}

// ─── Tech stack builder ───────────────────────────────────────

function buildTechStack(spec: BuilderSpec): PlanOutput['techStack'] {
  const frontend = ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS']
  const backend = spec.database.provider !== 'none' || spec.auth.required
    ? ['Node.js', 'Express', 'TypeScript']
    : ['Node.js', 'Express', 'TypeScript']

  const database: string[] = []
  if (spec.database.provider === 'supabase') {
    database.push('Supabase', 'PostgreSQL')
  } else if (spec.database.provider === 'postgres') {
    database.push('PostgreSQL', 'Prisma')
  }

  const auth: string[] = []
  if (spec.auth.required) {
    if (spec.auth.provider === 'supabase') {
      auth.push('Supabase Auth')
      for (const p of spec.auth.socialProviders) {
        auth.push(`${p} OAuth`)
      }
    } else if (spec.auth.provider === 'jwt_only') {
      auth.push('JWT', 'bcrypt')
    }
  }

  const integrations = spec.integrations.map(i => i.name)
  if (spec.billing.required && spec.billing.provider === 'stripe') {
    if (!integrations.includes('Stripe')) integrations.push('Stripe')
  }

  const deployment: string[] = []
  if (spec.deployment.target === 'vercel') deployment.push('Vercel')
  else if (spec.deployment.target === 'railway') deployment.push('Railway')
  else deployment.push('Docker')

  return { frontend, backend, database, auth, integrations, deployment }
}

// ─── Frontend scope builder ───────────────────────────────────

function buildFrontendScope(spec: BuilderSpec): string[] {
  const scope: string[] = []

  for (const page of spec.pages) {
    scope.push(
      `${page.name} page (${page.path})${page.authenticated ? ' — auth required' : ''}`
    )
  }

  if (spec.auth.required) {
    scope.push('Login / Register screens')
    if (spec.auth.socialProviders.length > 0) {
      scope.push(`OAuth buttons: ${spec.auth.socialProviders.join(', ')}`)
    }
  }

  if (spec.billing.required) {
    scope.push('Pricing / plans page')
    scope.push('Billing management page')
  }

  // Ensure min 1 item (schema requires it)
  if (scope.length === 0) {
    scope.push('Main application page')
  }

  return scope.slice(0, 30)
}

// ─── Backend scope builder ────────────────────────────────────

function buildBackendScope(spec: BuilderSpec): string[] {
  const scope: string[] = []

  if (spec.auth.required) {
    scope.push('Auth endpoints (register, login, session, refresh)')
  }

  if (spec.billing.required && spec.billing.provider === 'stripe') {
    scope.push('Stripe checkout session endpoint')
    scope.push('Stripe webhook handler (payment events)')
    if (spec.billing.plans.length > 0) {
      scope.push(
        `Subscription plans: ${spec.billing.plans.map(p => p.name).join(', ')}`
      )
    }
  }

  for (const table of spec.database.tables) {
    scope.push(`${table} CRUD API`)
  }

  for (const integration of spec.integrations) {
    if (integration.name !== 'Stripe') {
      scope.push(`${integration.name} integration — ${integration.purpose}`)
    }
  }

  return scope.slice(0, 30)
}

// ─── Execution steps builder ──────────────────────────────────

function buildExecutionSteps(spec: BuilderSpec): PlanOutput['executionSteps'] {
  const steps: PlanOutput['executionSteps'] = []
  let order = 1

  steps.push({
    order: order++,
    title: 'Project scaffold',
    description: 'Initialize project structure, install dependencies, configure environment variables',
    estimatedDuration: '2–3 min',
  })

  steps.push({
    order: order++,
    title: 'Core layout & routing',
    description: 'Build page shell, navigation structure, and client-side routing',
    estimatedDuration: '3–5 min',
  })

  // One step per page (up to 5 to stay within 15-step limit)
  const pagesToBuild = spec.pages.slice(0, 5)
  for (const page of pagesToBuild) {
    steps.push({
      order: order++,
      title: `Build: ${page.name}`,
      description: page.description,
      estimatedDuration: '5–10 min',
    })
  }

  if (spec.auth.required) {
    steps.push({
      order: order++,
      title: 'Authentication',
      description: `Implement ${
        spec.auth.provider === 'supabase' ? 'Supabase Auth' : 'JWT'
      } flow${
        spec.auth.socialProviders.length > 0
          ? ` with ${spec.auth.socialProviders.join(', ')} OAuth`
          : ''
      }`,
      estimatedDuration: '5–8 min',
    })
  }

  if (spec.billing.required && spec.billing.provider === 'stripe') {
    steps.push({
      order: order++,
      title: 'Billing integration',
      description: `Stripe checkout, ${spec.billing.plans.map(p => p.name).join('/')} plans, and webhook handling`,
      estimatedDuration: '8–12 min',
    })
  }

  if (spec.database.tables.length > 0) {
    steps.push({
      order: order++,
      title: 'Database layer',
      description: `Schema + CRUD for: ${spec.database.tables.join(', ')}`,
      estimatedDuration: '5–10 min',
    })
  }

  steps.push({
    order: order,
    title: 'Integration & preview',
    description: 'Wire all flows end-to-end, validate connections, start preview server',
    estimatedDuration: '3–5 min',
  })

  // Clamp to 15 (planOutputSchema max)
  return steps.slice(0, 15)
}
