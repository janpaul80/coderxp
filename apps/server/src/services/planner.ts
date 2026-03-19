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

const intentSchema = z.object({
  intent: z.enum([
    'build_request',
    'fix_request',
    'clarification_needed',
    'greeting',
    'question',
    'modification',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
})

export async function classifyIntent(userMessage: string): Promise<PlannerIntent> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw')) {
    return heuristicClassify(userMessage)
  }

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: intentSchema,
      systemPrompt: `You are an intent classifier for an AI app builder called CodedXP.
Classify the user's message into exactly one of these intents:

- build_request: User wants to BUILD a NEW app, website, tool, or software product from scratch
- fix_request: User is COMPLAINING about something missing, broken, or wrong in the current build (e.g. "the pricing section is missing", "the footer is broken", "it doesn't have a contact form", "add a testimonials section", "the login page is missing")
- modification: User wants to MODIFY or REFINE an existing PLAN (before building starts)
- clarification_needed: Message is too vague to act on (e.g. "help me", "build something", "do something")
- greeting: Simple greeting or social message (hi, hello, thanks, etc.)
- question: User is asking a QUESTION about capabilities, process, or general information — NOT requesting a build or fix

IMPORTANT RULES:
- "fix_request" takes priority over "build_request" when the user mentions something is missing, broken, wrong, or incomplete in an existing build
- "question" should be used for conversational messages that don't require a plan
- Only use "build_request" when the user clearly wants to start building something new
- Phrases like "add X", "it's missing X", "where is X", "X is broken", "X doesn't work" → fix_request
- Phrases like "build me", "create a", "make a", "I want to build" → build_request

Return JSON only: { "intent": "...", "confidence": 0.0-1.0, "reason": "..." }`,
      userPrompt: userMessage,
      temperature: 0.1,
      maxTokens: 200,
    })
    return result.parsed.intent
  } catch {
    return heuristicClassify(userMessage)
  }
}

function heuristicClassify(msg: string): PlannerIntent {
  const lower = msg.toLowerCase().trim()

  // Greetings
  const greetings = ['hello', 'hi', 'hey', 'yo', 'sup', 'hiya', 'good morning', 'good evening', 'thanks', 'thank you', 'ok', 'okay', 'cool', 'great', 'awesome']
  if (greetings.some(g => lower === g || lower === g + '!' || lower === g + '.')) return 'greeting'

  // Fix/complaint patterns — check BEFORE build patterns
  const fixPatterns = [
    'missing', 'broken', 'not working', "doesn't have", "doesn't work",
    "didn't add", "forgot", "forgot to", "where is the", "where's the",
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

GENERAL RULES:
- features: list of user-facing features (2-10 items)
- frontendScope: list of pages/components to build (3-15 items) — be SPECIFIC and COMPLETE
- backendScope: list of API routes/services to build (0-15 items, empty array if frontend-only)
- integrations: list of third-party services (empty array if none)
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
}

export interface GeneratePlanResult {
  plan: PlanOutput
  metadata: PlannerMetadata
}

function inferComplexity(featureCount: number, hasIntegrations: boolean): 'low' | 'medium' | 'high' {
  if (featureCount >= 8 || hasIntegrations) return 'high'
  if (featureCount >= 4) return 'medium'
  return 'low'
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

  const userPrompt = `User request: "${input.userRequest}"${contextBlock}${memoryBlock}

Generate a complete implementation plan for this app. Remember: ALL standard page sections must be included — never omit hero, features, pricing, testimonials, contact, or footer sections for landing pages.`

  const start = Date.now()
  let metadata: PlannerMetadata

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: planOutputSchema,
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.4,
      maxTokens: 2500,
      retries: 2,
    })

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

    return { plan: result.parsed, metadata }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = getProviderStatus()
    const durationMs = Date.now() - start

    if (err instanceof ProviderError && err.code === 'PARSE_ERROR') {
      const fallbackPlan = buildFallbackPlanFromRequest(input.userRequest)
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
      return { plan: fallbackPlan, metadata }
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
