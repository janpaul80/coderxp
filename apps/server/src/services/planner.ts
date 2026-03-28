/**
 * Planner Service — AI-powered requirement analysis and plan generation
 *
 * Responsibilities:
 *  - Classify user intent (build_request / fix_request / clarification_needed / greeting / question / modification)
 *  - Generate structured plan from user prompt
 *  - Validate plan output with strict Zod schema
 *  - Retry on malformed output
 *  - Persist planner metadata for quality tracking
 *  - Generate repair responses for fix_request intents (Gap 4)
 *  - Generate conversational responses for questions (Gap 5)
 */

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { completeJSON, complete, getProviderStatus, isProviderAvailable, ProviderError } from '../lib/providers'
import { prisma } from '../lib/prisma'
import {
  generateProductIntelligence,
  buildProductIntelligenceContext,
  type ProductIntelligence,
} from './productIntelligence'

// Re-export ProviderError under legacy names so routes/planner.ts keeps working
export { ProviderError as LLMUnavailableError, ProviderError as LLMParseError }

// ─── Planner version ──────────────────────────────────────────

export const PLANNER_VERSION = '3.1.0'

// ─── Intent classification ────────────────────────────────────

export type PlannerIntent =
  | 'build_request'
  | 'fix_request'
  | 'clarification_needed'
  | 'greeting'
  | 'question'
  | 'modification'
  | 'continuation'

const intentSchema = z.object({
  intent: z.enum([
    'build_request',
    'fix_request',
    'clarification_needed',
    'greeting',
    'question',
    'modification',
    'continuation',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
})

export async function classifyIntent(userMessage: string): Promise<PlannerIntent> {
  // Fast-path: heuristic can often classify without an AI call at all.
  // If the heuristic returns a high-confidence result (greeting, clear build verb, etc.)
  // skip the AI call entirely to save 5-30 seconds of latency.
  const heuristicResult = heuristicClassify(userMessage)
  if (heuristicResult === 'greeting') return 'greeting'

  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw')) {
    return heuristicResult
  }

  // AI classification with a hard 8-second timeout.
  // If the provider is cold or slow, we fall back to the heuristic result
  // rather than making the user wait indefinitely.
  try {
    const aiPromise = completeJSON({
      role: 'planner',
      schema: intentSchema,
      systemPrompt: `You are an intent classifier for an AI app builder called CodedXP.
Classify the user's message into exactly one of these intents:

- build_request: User wants to BUILD a NEW app, website, tool, or software product from scratch
- fix_request: User is COMPLAINING about something missing, broken, wrong, or not visible in the current build (e.g. "the pricing section is missing", "the footer is broken", "it doesn't have a contact form", "add a testimonials section", "the login page is missing", "i don't see anything", "the preview is blank", "nothing is showing", "i can't see the app", "the preview isn't working", "it's not showing anything", "the page is empty", "nothing loaded")
- continuation: User wants to ADD NEW PAGES or FEATURES to an EXISTING completed build (e.g. "add a blog page", "add a settings page", "extend the app with a notifications page", "add more pages to the existing build")
- modification: User wants to MODIFY or REFINE an existing PLAN (before building starts)
- clarification_needed: Message is too vague to act on (e.g. "help me", "build something", "do something")
- greeting: Simple greeting or social message (hi, hello, thanks, etc.)
- question: User is asking a QUESTION about capabilities, process, or general information — NOT requesting a build or fix

IMPORTANT RULES:
- "continuation" takes priority when the user explicitly wants to ADD NEW PAGES/FEATURES to an already-built project
- "fix_request" takes priority over "build_request" when the user mentions something is missing, broken, wrong, or incomplete in an existing build
- "question" should be used for conversational messages that don't require a plan
- Only use "build_request" when the user clearly wants to start building something new
- Phrases like "add X page", "extend with X", "add a new section to the existing build", "add a new blog page to the existing app", "add a new X page to the existing project" → continuation
- Phrases like "add X", "it's missing X", "where is X", "X is broken", "X doesn't work" → fix_request
- Phrases like "build me", "create a", "make a", "I want to build" → build_request

CONTINUATION vs FIX_REQUEST disambiguation:
- If the message contains "to the existing app/build/project" → ALWAYS continuation
- If the message contains "add a new X page" (where X is a page type like blog, settings, profile) → ALWAYS continuation
- "add a new blog page to the existing app" → continuation (NOT fix_request)
- "add a settings page" → continuation
- "add a blog" → continuation
- "the blog page is missing" → fix_request
- "add a testimonials section" → fix_request (section within existing page, not a new page)

Return JSON only: { "intent": "...", "confidence": 0.0-1.0, "reason": "..." }`,
      userPrompt: userMessage,
      temperature: 0.1,
      maxTokens: 200,
    })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('classifyIntent timeout (8s)')), 8000)
    )

    const result = await Promise.race([aiPromise, timeoutPromise])
    return result.parsed.intent
  } catch (err) {
    console.warn(`[Planner] classifyIntent AI failed, using heuristic: ${err instanceof Error ? err.message : err}`)
    return heuristicResult
  }
}

function heuristicClassify(msg: string): PlannerIntent {
  const lower = msg.toLowerCase().trim()

  // Greetings
  const greetings = ['hello', 'hi', 'hey', 'yo', 'sup', 'hiya', 'good morning', 'good evening', 'thanks', 'thank you', 'ok', 'okay', 'cool', 'great', 'awesome']
  if (greetings.some(g => lower === g || lower === g + '!' || lower === g + '.')) return 'greeting'

  // Continuation patterns — check BEFORE fix patterns
  const continuationPatterns = [
    'add a new page', 'add new page', 'add a page', 'new page to',
    'extend the app', 'extend with', 'extend it with', 'add more pages',
    'add another page', 'add a blog', 'add a settings', 'add a profile page',
    'add a notifications', 'add a dashboard page', 'add a new feature page',
    'add pages to', 'add to the existing', 'extend the existing',
    // Patterns for "add a new X page to the existing app/build/project"
    'to the existing app', 'to the existing build', 'to the existing project',
    'add a new blog', 'add a new settings', 'add a new profile',
    'add a new dashboard', 'add a new notifications', 'add a new page to',
    'new page to the existing', 'add a new feature to',
  ]
  if (continuationPatterns.some(p => lower.includes(p))) return 'continuation'

  // Fix/complaint patterns — check BEFORE build patterns
  const fixPatterns = [
    'missing', 'broken', 'not working', "doesn't have", "doesn't work",
    "didn't add", "forgot", "forgot to", "where is the", "where's the",
    // Preview-blank complaint patterns
    "don't see anything", "dont see anything", "can't see anything", "cant see anything",
    "can't see the", "cannot see the", "can't see it", "can't see my",
    "nothing is showing", "nothing showing", "not showing", "preview is blank",
    "preview blank", "blank preview", "page is empty", "nothing loaded",
    "preview not working", "preview isn't working", "preview doesn't work",
    "i see nothing", "see nothing", "shows nothing", "showing nothing",
    "it's empty", "its empty", "all i see is white", "white screen",
    "black screen", "blank screen", "blank page",
    'add a ', 'add the ', 'add more', 'it needs', 'needs a ', 'needs the ',
    'fix the', 'fix this', 'repair', 'the page is', 'section is missing',
    'no footer', 'no header', 'no pricing', 'no contact', 'no navbar',
    'incomplete', 'not complete', 'not finished', 'still missing',
  ]
  if (fixPatterns.some(p => lower.includes(p))) return 'fix_request'

  // Too vague
  const vague = ['help me', 'help', 'build something', 'i want an app', 'make me an app', 'create something', 'test']
  if (vague.some(v => lower === v || (lower.startsWith(v) && lower.length < 30))) return 'clarification_needed'

  // Build request
  const buildVerbs = ['build', 'create', 'make', 'develop', 'generate', 'write', 'code', 'design']
  const appNouns = ['app', 'application', 'website', 'site', 'saas', 'dashboard', 'platform', 'landing page', 'api', 'backend', 'frontend', 'tool', 'system', 'portal', 'marketplace', 'store', 'shop', 'blog', 'admin', 'panel']
  const hasBuildVerb = buildVerbs.some(v => lower.includes(v))
  const hasAppNoun = appNouns.some(n => lower.includes(n))
  if ((hasBuildVerb || hasAppNoun) && lower.length > 15) return 'build_request'

  return 'question'
}

// ─── Strict plan output schema ────────────────────────────────

export const executionStepSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  estimatedDuration: z.string().optional(),
})

export const techStackSchema = z.object({
  frontend: z.array(z.string()).min(1),
  backend: z.array(z.string()).min(1),
  database: z.array(z.string()).optional(),
  auth: z.array(z.string()).optional(),
  integrations: z.array(z.string()).optional(),
  deployment: z.array(z.string()).optional(),
})

export const planOutputSchema = z.object({
  summary: z.string().min(10).max(500),
  features: z.array(z.string().min(1).max(200)).min(1).max(20),
  techStack: techStackSchema,
  frontendScope: z.array(z.string().min(1).max(200)).min(1).max(30),
  backendScope: z.array(z.string().min(1).max(200)).min(0).max(30),
  integrations: z.array(z.string().min(1).max(200)).max(15),
  executionSteps: z.array(executionStepSchema).min(2).max(15),
  estimatedComplexity: z.enum(['low', 'medium', 'high']),
})

export type PlanOutput = z.infer<typeof planOutputSchema>

// ─── Planner metadata schema ──────────────────────────────────

export interface PlannerMetadata {
  plannerVersion: string
  provider: string
  model: string
  parseSuccess: boolean
  retryCount: number
  promptTokens: number
  completionTokens: number
  durationMs: number
  rawResponseLength: number
  error?: string
}

// ─── System prompt ────────────────────────────────────────────

const PLANNER_SYSTEM_PROMPT = `You are CodedXP's AI planner. Your job is to analyze a user's app idea and produce a detailed, structured implementation plan.

You MUST return a valid JSON object matching this exact schema:
{
  "summary": "One-sentence description of what will be built",
  "features": ["Feature 1", "Feature 2", ...],
  "techStack": {
    "frontend": ["React 18", "TypeScript", "Vite", "Tailwind CSS"],
    "backend": ["Node.js", "Express", "TypeScript"],
    "database": ["PostgreSQL", "Prisma"],
    "auth": ["JWT", "bcrypt"],
    "integrations": ["Stripe"],
    "deployment": ["Vercel", "Railway"]
  },
  "frontendScope": ["Landing page", "Login page", ...],
  "backendScope": ["REST API", "Auth routes", ...],
  "integrations": ["Stripe (checkout, webhooks)", ...],
  "executionSteps": [
    { "order": 1, "title": "Initialize project", "description": "Set up monorepo, install dependencies", "estimatedDuration": "1 min" },
    ...
  ],
  "estimatedComplexity": "low" | "medium" | "high"
}

COMPLETENESS RULES (CRITICAL — incomplete builds are a product failure):
- If building a LANDING PAGE: frontendScope MUST include ALL of: "Hero section", "Features section", "Pricing section", "Testimonials section", "Contact/CTA section", "Footer", "Navigation bar"
- If building a SAAS app: frontendScope MUST include: "Landing page (hero, features, pricing, testimonials, footer)", "Login page", "Register page", "Dashboard", plus core feature pages
- If building a MARKETING SITE: frontendScope MUST include: "Hero", "About section", "Services/Features section", "Pricing section", "Contact form", "Footer"
- If building an E-COMMERCE site: frontendScope MUST include: "Home page", "Product listing", "Product detail", "Cart", "Checkout", "Order confirmation", "Footer"
- NEVER omit standard page sections — always include navigation, footer, and all expected sections
- Each page listed in frontendScope MUST be fully implemented with all its sections

INTEGRATION DETECTION RULES (CRITICAL — missing integrations break the build):
- If the user mentions "Supabase" anywhere → integrations MUST include "Supabase"
- If the user mentions "Stripe" anywhere → integrations MUST include "Stripe"
- If the user mentions "OAuth", "Google login", "GitHub login" with Supabase → integrations MUST include "Supabase"
- If the user mentions "subscription", "billing", "payment", "checkout" → integrations MUST include "Stripe"
- integrations array must EXACTLY match what the user requested — never leave it empty if a service was mentioned

GENERAL RULES:
- features: list of user-facing features (2-10 items)
- frontendScope: list of pages/components to build (3-15 items) — be SPECIFIC and COMPLETE
- backendScope: list of API routes/services to build (0-15 items, empty array if frontend-only)
- integrations: list of third-party services (empty array ONLY if truly none mentioned)
- executionSteps: ordered build steps (3-10 items)
- estimatedComplexity: low (1-3 features), medium (4-7 features), high (8+ features or complex integrations)
- Return ONLY the JSON object, no markdown, no explanation`

// ─── Generate plan ────────────────────────────────────────────

export interface GeneratePlanInput {
  userRequest: string
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  projectName?: string
  /** Structured memory context injected from ProjectMemory + UserMemory. High-signal, compact. */
  memoryContext?: string
  /** Explicit user rules block — injected into system prompt at highest priority. */
  rulesContext?: string
  /** S8-6: Repo snapshot context — injected to prevent duplicate components/routes/endpoints. */
  repoContext?: string
}

export interface GeneratePlanResult {
  plan: PlanOutput
  metadata: PlannerMetadata
  /** Product intelligence generated alongside the plan (null if AI unavailable) */
  productIntelligence?: ProductIntelligence | null
}

export interface RepairPlanOutput {
  filesToRepair: string[]
  repairReason: string
  repairSummary: string
}

const repairPlanSchema = z.object({
  filesToRepair: z.array(z.string().min(1)).min(1).max(8),
  repairReason: z.string().min(3).max(500),
  repairSummary: z.string().min(3).max(200),
})

function inferComplexity(featureCount: number, hasIntegrations: boolean): 'low' | 'medium' | 'high' {
  if (featureCount >= 8 || hasIntegrations) return 'high'
  if (featureCount >= 4) return 'medium'
  return 'low'
}

function inferFilesFromComplaint(complaint: string, fileTree: string[]): string[] {
  const lower = complaint.toLowerCase()
  const picks: string[] = []

  const rules: Array<{ keywords: string[]; patterns: string[] }> = [
    { keywords: ['pricing', 'price', 'plan', 'plans'], patterns: ['src/pages/Pricing.tsx', '/Pricing', '/pricing'] },
    { keywords: ['contact', 'cta', 'form'], patterns: ['src/pages/Contact.tsx', '/Contact', '/contact'] },
    { keywords: ['testimonial', 'review', 'social proof'], patterns: ['src/pages/Testimonials.tsx', '/Testimonials', '/testimonials'] },
    { keywords: ['about'], patterns: ['src/pages/About.tsx', '/About', '/about'] },
    { keywords: ['blog', 'article', 'post'], patterns: ['src/pages/Blog.tsx', '/Blog', '/blog'] },
    { keywords: ['faq'], patterns: ['src/pages/FAQ.tsx', '/FAQ', '/faq'] },
    { keywords: ['home', 'hero', 'landing', 'footer', 'header', 'navbar', 'navigation'], patterns: ['src/pages/Home.tsx', 'src/components/Header.tsx'] },
    { keywords: ['login', 'sign in'], patterns: ['src/pages/Login.tsx'] },
    { keywords: ['register', 'signup', 'sign up'], patterns: ['src/pages/Register.tsx'] },
    { keywords: ['dashboard', 'admin', 'panel'], patterns: ['src/pages/Dashboard.tsx'] },
    { keywords: ['route', 'routing', 'nav', 'menu'], patterns: ['src/App.tsx'] },
  ]

  for (const rule of rules) {
    if (rule.keywords.some(k => lower.includes(k))) {
      const matched = fileTree.filter(fp => rule.patterns.some(p => fp.includes(p)))
      picks.push(...matched)
    }
  }

  const includesPage = picks.some(p => p.startsWith('src/pages/'))
  if (includesPage && fileTree.includes('src/App.tsx')) {
    picks.push('src/App.tsx')
  }

  const deduped = Array.from(new Set(picks))
  if (deduped.length > 0) return deduped.slice(0, 8)

  const genericFallback = ['src/App.tsx', 'src/pages/Home.tsx', 'src/components/Header.tsx']
    .filter(fp => fileTree.includes(fp))
  return genericFallback.length > 0 ? genericFallback : fileTree.slice(0, 3)
}

export async function generateRepairPlan(params: {
  complaint: string
  fileTree: string[]
  projectSummary: string
}): Promise<RepairPlanOutput> {
  const fallbackFiles = inferFilesFromComplaint(params.complaint, params.fileTree)
  const fallback: RepairPlanOutput = {
    filesToRepair: fallbackFiles,
    repairReason: params.complaint.slice(0, 500),
    repairSummary: `Repair requested: ${params.complaint.slice(0, 120)}`,
  }

  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return fallback
  }

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: repairPlanSchema,
      systemPrompt: `You are CodedXP's targeted repair planner.
Given a user complaint and a workspace file tree, select ONLY the files that must be regenerated.
Rules:
- Prefer minimal edits (1-5 files usually).
- Preserve existing project context; do NOT suggest full rebuild.
- Include src/App.tsx if route/page wiring is likely affected.
- Return strict JSON only:
{
  "filesToRepair": ["src/pages/Pricing.tsx", "src/App.tsx"],
  "repairReason": "why these files are affected",
  "repairSummary": "short one-line repair summary"
}`,
      userPrompt: `Project summary: ${params.projectSummary}

User complaint:
${params.complaint}

Workspace files:
${params.fileTree.slice(0, 200).join('\n')}

Return the minimal files to regenerate.`,
      temperature: 0.1,
      maxTokens: 500,
      retries: 1,
    })

    const existing = result.parsed.filesToRepair.filter(f => params.fileTree.includes(f))
    return {
      filesToRepair: existing.length > 0 ? existing : fallbackFiles,
      repairReason: result.parsed.repairReason,
      repairSummary: result.parsed.repairSummary,
    }
  } catch {
    return fallback
  }
}

function buildFallbackPlanFromRequest(userRequest: string): PlanOutput {
  const cleaned = userRequest.trim().replace(/\s+/g, ' ')
  const summary = cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned

  const lc = cleaned.toLowerCase()
  const isLandingPage = lc.includes('landing') || lc.includes('marketing') || lc.includes('homepage')
  const isSaaS = lc.includes('saas') || lc.includes('dashboard') || lc.includes('platform')

  const features = [
    'User authentication',
    'Core dashboard UI',
    'Primary CRUD workflow',
    'Responsive layout',
  ]

  // Ensure complete frontendScope based on app type
  let frontendScope: string[]
  if (isLandingPage) {
    frontendScope = [
      'Navigation bar',
      'Hero section',
      'Features section',
      'Pricing section',
      'Testimonials section',
      'Contact/CTA section',
      'Footer',
    ]
  } else if (isSaaS) {
    frontendScope = [
      'Landing page (hero, features, pricing, testimonials, footer)',
      'Login page',
      'Register page',
      'Dashboard',
      'Primary feature views',
      'Settings page',
    ]
  } else {
    frontendScope = [
      'Landing page',
      'Authentication screens',
      'Dashboard page',
      'Primary feature views',
      'Footer',
    ]
  }

  const backendScope = [
    'Auth endpoints',
    'Core entity CRUD endpoints',
    'Validation and error handling',
  ]

  const integrations: string[] = []
  if (lc.includes('stripe')) integrations.push('Stripe')
  if (lc.includes('supabase')) integrations.push('Supabase')
  if (lc.includes('email')) integrations.push('Email provider')
  if (lc.includes('upload')) integrations.push('File storage')

  const executionSteps = [
    { order: 1, title: 'Project setup', description: 'Initialize project structure, dependencies, and environment configuration', estimatedDuration: '15-30 min' },
    { order: 2, title: 'Core backend foundation', description: 'Implement data models, authentication, and initial API routes', estimatedDuration: '30-60 min' },
    { order: 3, title: 'Frontend implementation', description: 'Build all pages and components including complete sections', estimatedDuration: '45-90 min' },
    { order: 4, title: 'Integration and validation', description: 'Connect flows end-to-end, handle errors, and verify key runtime behaviors', estimatedDuration: '30-60 min' },
  ]

  return planOutputSchema.parse({
    summary: summary.length >= 10 ? summary : `Build an application based on: ${cleaned || 'user request'}`,
    features,
    techStack: {
      frontend: ['React', 'TypeScript', 'Vite', 'Tailwind CSS'],
      backend: ['Node.js', 'Express', 'TypeScript'],
      database: ['PostgreSQL', 'Prisma'],
      auth: ['JWT', 'bcrypt'],
      integrations,
      deployment: ['Docker'],
    },
    frontendScope,
    backendScope,
    integrations,
    executionSteps,
    estimatedComplexity: inferComplexity(features.length, integrations.length > 0),
  })
}

export async function generatePlan(input: GeneratePlanInput): Promise<GeneratePlanResult> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw')) {
    throw new ProviderError('No AI provider configured. Set OPEN_ROUTER_API_KEY or configure a provider.', 'NO_PROVIDER', 'none')
  }

  // Build context from chat history
  let contextBlock = ''
  if (input.chatHistory && input.chatHistory.length > 0) {
    const recent = input.chatHistory.slice(-6)
    contextBlock = '\n\nConversation context:\n' + recent
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')
  }

  // Inject memory context if available
  const memoryBlock = input.memoryContext
    ? `\n\n${input.memoryContext}\n\nUse the above memory context to inform your plan. Respect confirmed stack decisions, known integrations, and approved project direction. Do not contradict prior decisions unless the user explicitly requests a change.`
    : ''

  // S8-6: Inject repo snapshot so the planner avoids duplicating existing components/routes/endpoints.
  const repoBlock = input.repoContext
    ? `\n\n${input.repoContext}`
    : ''

  const userPrompt = `User request: "${input.userRequest}"${contextBlock}${memoryBlock}${repoBlock}

Generate a complete implementation plan for this app. Remember: ALL standard page sections must be included — never omit hero, features, pricing, testimonials, contact, or footer sections for landing pages.`

  // Prepend rules to system prompt if present (highest priority)
  const effectiveSystemPrompt = input.rulesContext
    ? `${input.rulesContext}\n\n---\n\n${PLANNER_SYSTEM_PROMPT}`
    : PLANNER_SYSTEM_PROMPT

  const start = Date.now()
  let metadata: PlannerMetadata

  // Run product intelligence generation in parallel with plan generation.
  // Non-blocking — a failure here does not prevent the plan from succeeding.
  const productIntelligencePromise = generateProductIntelligence(
    input.userRequest,
    input.projectName,
    input.memoryContext,
  ).catch((err) => {
    console.warn('[Planner] Product intelligence generation failed (non-blocking):', err instanceof Error ? err.message : err)
    return null
  })

  try {
    const [result, productIntelligence] = await Promise.all([
      completeJSON({
        role: 'planner',
        schema: planOutputSchema,
        systemPrompt: effectiveSystemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 2500,
        retries: 2,
      }),
      productIntelligencePromise,
    ])

    metadata = {
      plannerVersion: PLANNER_VERSION,
      provider: result.provider,
      model: result.model,
      parseSuccess: true,
      retryCount: result.retryCount,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      durationMs: result.durationMs,
      rawResponseLength: result.rawResponse?.length ?? 0,
    }

    return { plan: result.parsed, metadata, productIntelligence }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = getProviderStatus()
    const durationMs = Date.now() - start

    if (err instanceof ProviderError && err.code === 'PARSE_ERROR') {
      const fallbackPlan = buildFallbackPlanFromRequest(input.userRequest)
      const piResult = await productIntelligencePromise
      metadata = {
        plannerVersion: PLANNER_VERSION,
        provider: `${status.roleRouting.planner}:fallback`,
        model: `${status.models.planner}:recovered`,
        parseSuccess: false,
        retryCount: 2,
        promptTokens: 0,
        completionTokens: 0,
        durationMs,
        rawResponseLength: 0,
        error: `Recovered from parse error: ${message}`,
      }
      return { plan: fallbackPlan, metadata, productIntelligence: piResult }
    }

    metadata = {
      plannerVersion: PLANNER_VERSION,
      provider: status.roleRouting.planner,
      model: status.models.planner,
      parseSuccess: false,
      retryCount: 2,
      promptTokens: 0,
      completionTokens: 0,
      durationMs,
      rawResponseLength: 0,
      error: message,
    }
    throw err
  }
}

// ─── Generate clarification response ─────────────────────────

export async function generateClarification(userMessage: string): Promise<string> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return "I'd love to help you build something! Could you tell me more about what you have in mind? For example: what type of app, who it's for, and what the core features should be."
  }

  const result = await complete({
    role: 'planner',
    systemPrompt: `You are CodedXP, an AI app builder. The user's message is too vague to generate a plan.
Ask 2-3 specific clarifying questions to understand:
1. What type of app they want to build
2. Who the target users are
3. What the core features should be
4. Any specific integrations needed (Stripe, Supabase, etc.)

Keep your response concise, friendly, and actionable. Use markdown formatting.`,
    userPrompt: `User said: "${userMessage}"\n\nAsk clarifying questions to understand their app idea.`,
    temperature: 0.7,
    maxTokens: 400,
  })

  return result.content
}

// ─── Generate greeting response ───────────────────────────────

export async function generateGreeting(): Promise<string> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return "Hey! I'm CodedXP — your autonomous app builder. Tell me what you want to build and I'll plan, code, and deploy it for you.\n\nFor example: *\"Build me a SaaS app for booking cleaning services with Stripe billing\"*"
  }

  const result = await complete({
    role: 'planner',
    systemPrompt: `You are CodedXP, an AI autonomous app builder. Respond to a greeting with a brief, friendly welcome that explains what you can do and gives an example of a build request. Keep it under 3 sentences. Use markdown.`,
    userPrompt: 'User greeted you.',
    temperature: 0.8,
    maxTokens: 200,
  })

  return result.content
}

// ─── Generate repair response (Gap 4) ────────────────────────
// Called when intent === 'fix_request'. Acknowledges the complaint,
// explains what will be repaired, and guides the user on next steps.

export async function generateRepairResponse(
  complaint: string,
  jobStatus?: string
): Promise<string> {
  const fallback = jobStatus === 'failed'
    ? `I can see the build didn't complete successfully. I'll repair it now — click **"Repair Build"** to re-run the builder with your feedback applied.\n\nYour note: *"${complaint}"*`
    : `Got it — I'll fix that. Your feedback has been noted:\n\n> *"${complaint}"*\n\nIf the build is complete, you can **repair** it to apply these changes. If it's still running, I'll incorporate this feedback automatically.`

  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return fallback
  }

  try {
    const result = await complete({
      role: 'planner',
      systemPrompt: `You are CodedXP, an AI autonomous app builder. The user is reporting something missing or broken in their current build.
Respond with:
1. Acknowledge the specific issue they reported (1 sentence)
2. Confirm you will fix it (1 sentence)
3. Tell them to click "Repair Build" to apply the fix, OR that it will be applied on the next build run
Keep it concise (3-4 sentences max). Use markdown. Be direct and confident — not apologetic.`,
      userPrompt: `User complaint: "${complaint}"\nJob status: ${jobStatus ?? 'unknown'}\n\nRespond to this repair request.`,
      temperature: 0.5,
      maxTokens: 250,
    })
    return result.content
  } catch {
    return fallback
  }
}

// ─── Generate conversational response (Gap 5) ────────────────
// Called when intent === 'question'. Answers conversationally
// without generating a plan — prevents plan spam.

export async function generateConversationalResponse(
  question: string,
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const fallback = "I'm CodedXP — an autonomous app builder. I can build full-stack apps, landing pages, SaaS platforms, and more. Just describe what you want to build and I'll generate a plan for you!"

  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return fallback
  }

  let contextBlock = ''
  if (chatHistory && chatHistory.length > 0) {
    const recent = chatHistory.slice(-4)
    contextBlock = '\n\nRecent conversation:\n' + recent
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n')
  }

  try {
    const result = await complete({
      role: 'planner',
      systemPrompt: `You are CodedXP, an AI autonomous app builder. Answer the user's question conversationally.
- If they ask about capabilities: explain what you can build (full-stack apps, landing pages, SaaS, e-commerce, etc.)
- If they ask about process: explain the plan → approve → build → preview flow
- If they ask about tech stack: explain you use React, TypeScript, Node.js, Tailwind, PostgreSQL by default
- Keep responses concise (2-4 sentences). Use markdown. Do NOT generate a plan — just answer the question.`,
      userPrompt: `User question: "${question}"${contextBlock}`,
      temperature: 0.7,
      maxTokens: 350,
    })
    return result.content
  } catch {
    return fallback
  }
}

// ─── Persist planner run metadata ────────────────────────────

export async function savePlannerRun(params: {
  chatId: string
  projectId: string
  planId?: string
  userRequest: string
  metadata: PlannerMetadata
}): Promise<void> {
  try {
    const metadataPayload: Prisma.InputJsonValue = {
      plannerVersion: params.metadata.plannerVersion,
      provider: params.metadata.provider,
      model: params.metadata.model,
      parseSuccess: params.metadata.parseSuccess,
      retryCount: params.metadata.retryCount,
      promptTokens: params.metadata.promptTokens,
      completionTokens: params.metadata.completionTokens,
      durationMs: params.metadata.durationMs,
      rawResponseLength: params.metadata.rawResponseLength,
      planId: params.planId ?? null,
      error: params.metadata.error ?? null,
      timestamp: new Date().toISOString(),
    }

    await prisma.message.create({
      data: {
        chatId: params.chatId,
        role: 'system',
        type: 'text',
        content: `[planner:run] ${params.metadata.parseSuccess ? 'success' : 'failed'}`,
        metadata: metadataPayload,
      },
    })
  } catch (err) {
    console.warn('[Planner] Failed to persist planner run metadata:', err)
  }
}

// ─── S9-1: Error Analysis ─────────────────────────────────────

/**
 * Structured analysis of a build failure.
 * Produced by analyzeError() and surfaced in the chat as an ErrorAnalysisCard.
 */
export interface ErrorAnalysis {
  /** Plain-language explanation of the root cause */
  rootCause: string
  /** Classified error type for badge display and routing */
  errorType: 'npm_install' | 'vite_build' | 'typescript' | 'runtime' | 'unknown'
  /** Files the AI believes are responsible (may be empty if unknown) */
  affectedFiles: string[]
  /** Actionable fix description — used directly as the repair complaint */
  proposedFix: string
  /** 0–1 confidence in the analysis */
  confidence: number
  /** First 2000 chars of the raw error log */
  rawError: string
}

const errorAnalysisSchema = z.object({
  rootCause: z.string(),
  errorType: z.enum(['npm_install', 'vite_build', 'typescript', 'runtime', 'unknown']),
  affectedFiles: z.array(z.string()),
  proposedFix: z.string(),
  confidence: z.number().min(0).max(1),
})

/**
 * Heuristic fallback — classifies error without LLM.
 * Used when all AI providers are unavailable.
 */
function heuristicAnalyzeError(errorLog: string): ErrorAnalysis {
  const log = errorLog.toLowerCase()
  const rawError = errorLog.slice(0, 2000)

  // npm install failures
  if (log.includes('npm err!') || log.includes('npm error') || log.includes('npm warn') && log.includes('peer dep')) {
    const peerDepMatch = errorLog.match(/peer dep[^:]*:\s*([^\n]+)/i)
    const missingMatch = errorLog.match(/cannot find module '([^']+)'/i)
    const affectedFiles = missingMatch ? [`package.json`] : ['package.json']
    return {
      rootCause: peerDepMatch
        ? `npm install failed due to peer dependency conflict: ${peerDepMatch[1].slice(0, 120)}`
        : 'npm install failed — likely a missing or incompatible dependency',
      errorType: 'npm_install',
      affectedFiles,
      proposedFix: peerDepMatch
        ? `Fix peer dependency conflict in package.json: ${peerDepMatch[1].slice(0, 120)}. Remove conflicting version constraints or use a compatible version.`
        : 'Review package.json dependencies for missing or incompatible packages. Ensure all imports have corresponding entries in dependencies.',
      confidence: 0.7,
      rawError,
    }
  }

  // TypeScript errors
  if (log.includes('error ts') || log.includes('typescript') || /\berror\b.*\.tsx?:\d+/.test(log)) {
    const tsMatch = errorLog.match(/error TS\d+: ([^\n]+)/i)
    const fileMatch = errorLog.match(/([a-z0-9/_-]+\.tsx?):\d+/i)
    return {
      rootCause: tsMatch
        ? `TypeScript compilation error: ${tsMatch[1].slice(0, 150)}`
        : 'TypeScript compilation failed — type errors in generated code',
      errorType: 'typescript',
      affectedFiles: fileMatch ? [fileMatch[1]] : [],
      proposedFix: tsMatch
        ? `Fix TypeScript error: ${tsMatch[1].slice(0, 150)}. Check type annotations, missing imports, and interface mismatches.`
        : 'Fix TypeScript type errors in the generated source files. Check for missing type imports, incorrect prop types, and undefined variables.',
      confidence: 0.75,
      rawError,
    }
  }

  // Vite build errors
  if (log.includes('[vite]') || log.includes('vite') && (log.includes('failed') || log.includes('error'))) {
    const viteMatch = errorLog.match(/\[vite\][^\n]*error[^\n]*/i) ?? errorLog.match(/error[^\n]*\.(tsx?|jsx?)[^\n]*/i)
    const fileMatch = errorLog.match(/([a-z0-9/_-]+\.(tsx?|jsx?|css)):\d+/i)
    return {
      rootCause: viteMatch
        ? `Vite build error: ${viteMatch[0].slice(0, 150)}`
        : 'Vite failed to start or build the project',
      errorType: 'vite_build',
      affectedFiles: fileMatch ? [fileMatch[1]] : [],
      proposedFix: 'Fix the Vite build error. Check for missing imports, invalid JSX syntax, or misconfigured vite.config.ts.',
      confidence: 0.65,
      rawError,
    }
  }

  // Generic runtime error
  if (log.includes('cannot find module') || log.includes('module not found')) {
    const moduleMatch = errorLog.match(/cannot find module '([^']+)'/i) ?? errorLog.match(/module not found[^']*'([^']+)'/i)
    return {
      rootCause: moduleMatch
        ? `Missing module: ${moduleMatch[1]}`
        : 'A required module could not be found',
      errorType: 'runtime',
      affectedFiles: [],
      proposedFix: moduleMatch
        ? `Add missing import/dependency: ${moduleMatch[1]}. Ensure it is listed in package.json and the import path is correct.`
        : 'Check all import paths and ensure all dependencies are listed in package.json.',
      confidence: 0.8,
      rawError,
    }
  }

  // Unknown
  return {
    rootCause: 'Build failed with an unclassified error',
    errorType: 'unknown',
    affectedFiles: [],
    proposedFix: 'Review the build error log and fix any syntax errors, missing imports, or configuration issues in the generated files.',
    confidence: 0.3,
    rawError,
  }
}

/**
 * S9-1: Analyze a build error log and produce a structured ErrorAnalysis.
 *
 * Uses AI when available for accurate root-cause analysis.
 * Falls back to heuristic regex classification when all providers are unavailable.
 *
 * @param errorLog  Raw error output from npm install / vite / health check
 * @param repoContext  Optional repo snapshot context (from S8) for better targeting
 */
export async function analyzeError(
  errorLog: string,
  repoContext?: string
): Promise<ErrorAnalysis> {
  const rawError = errorLog.slice(0, 2000)

  // Heuristic fallback when no AI provider is available
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw') && !isProviderAvailable('blackbox')) {
    return heuristicAnalyzeError(errorLog)
  }

  const repoBlock = repoContext ? `\n\nRepo context:\n${repoContext}` : ''

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: errorAnalysisSchema,
      systemPrompt: `You are a build error analyst for an AI app builder called CoderXP.
Given a build error log, identify the root cause and propose a specific, actionable fix.

Rules:
- rootCause: 1–2 sentences in plain language. No jargon. Explain what went wrong.
- errorType: classify as npm_install | vite_build | typescript | runtime | unknown
- affectedFiles: list of file paths mentioned in the error (relative paths, e.g. "src/App.tsx"). Empty array if none.
- proposedFix: 1–3 sentences. Specific and actionable. This will be used as a repair instruction.
- confidence: 0.0–1.0 based on how clear the error is

Be concise. Do not repeat the raw error. Focus on the fix.`,
      userPrompt: `Build error log (first 2000 chars):\n\`\`\`\n${rawError}\n\`\`\`${repoBlock}`,
      temperature: 0,
      maxTokens: 400,
    })

    return {
      rootCause: result.parsed.rootCause,
      errorType: result.parsed.errorType,
      affectedFiles: result.parsed.affectedFiles,
      proposedFix: result.parsed.proposedFix,
      confidence: result.parsed.confidence,
      rawError,
    }
  } catch {
    // LLM call failed — fall back to heuristic
    return heuristicAnalyzeError(errorLog)
  }

  // TypeScript exhaustiveness guard — unreachable but satisfies control-flow analysis
  return heuristicAnalyzeError(errorLog)
}
