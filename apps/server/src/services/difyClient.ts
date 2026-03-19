/**
 * difyClient.ts — Phase 8 Slice 2
 *
 * Server-side Dify workflow client.
 * NEVER called from the frontend. NEVER logs DIFY_API_KEY.
 *
 * Responsibilities:
 *  - Send user messages to a Dify conversational workflow
 *  - Parse Dify response into DifyTurn (text + optional structuredOutput)
 *  - Mock mode (DIFY_MOCK_MODE=true): scripted 3-turn conversation per builder type
 *    Turn 3 always returns isComplete:true + a valid BuilderSpec structuredOutput
 *
 * Architecture note:
 *  - Dify is guided intake ONLY — it collects user requirements
 *  - The structuredOutput from Dify is normalized into BuilderSpec by builderSpec.ts
 *  - The build system NEVER sees raw Dify output
 */

import type { BuilderType } from './builderSpec'

// ─── Dify turn result ─────────────────────────────────────────

export interface DifyTurn {
  /** Dify conversation ID (persisted server-side only, never returned to client) */
  conversationId: string
  /** Human-readable assistant message to show the user */
  message: string
  /** True when the workflow has collected all required inputs */
  isComplete: boolean
  /** Structured output from Dify — only present when isComplete=true */
  structuredOutput?: Record<string, unknown>
  /** Turn number (1-indexed) */
  turnNumber: number
}

// ─── Dify workflow IDs ────────────────────────────────────────

export function getWorkflowId(builderType: BuilderType): string {
  switch (builderType) {
    case 'landing_page':
      return process.env.DIFY_WORKFLOW_LANDING_PAGE ?? 'mock-workflow-landing-page'
    case 'saas':
      return process.env.DIFY_WORKFLOW_SAAS ?? 'mock-workflow-saas'
    case 'stripe_auth_supabase':
      return process.env.DIFY_WORKFLOW_STRIPE_AUTH_SUPABASE ?? 'mock-workflow-stripe-auth-supabase'
  }
}

// ─── Mock scripts ─────────────────────────────────────────────
// 3-turn scripted conversation per builder type.
// Turn 3 always returns isComplete:true + valid structuredOutput.
// structuredOutput is the raw Dify output — normalized to BuilderSpec by builders.ts.

const MOCK_SCRIPTS: Record<BuilderType, Array<{
  message: string
  isComplete: boolean
  structuredOutput?: Record<string, unknown>
}>> = {
  landing_page: [
    {
      message: "Great! I'll help you build a landing page. What's the name of your product or service, and what's the main thing you want visitors to do when they land on the page?",
      isComplete: false,
    },
    {
      message: "Perfect. What are the 3 main benefits or features you want to highlight? And do you need a pricing section or contact form?",
      isComplete: false,
    },
    {
      message: "I have everything I need to build your landing page. Here's what I'll create for you: a hero section with your headline and CTA, a features section highlighting your key benefits, and a contact form. Ready to build?",
      isComplete: true,
      structuredOutput: {
        projectName: 'My Landing Page',
        projectGoal: 'A high-converting marketing landing page with hero, features, and contact sections.',
        pages: [
          { name: 'Landing Page', path: '/', description: 'Main marketing page with hero, features, pricing, and contact', authenticated: false },
        ],
        features: [
          'Hero section with headline and CTA button',
          'Features / benefits section (3 cards)',
          'Contact form with email capture',
          'Responsive mobile-first design',
          'Smooth scroll navigation',
        ],
        auth: { required: false, provider: 'none', socialProviders: [] },
        billing: { required: false, provider: 'none', plans: [] },
        database: { provider: 'none', tables: [] },
        integrations: [],
        styling: { theme: 'minimal', primaryColor: '#6366f1', fontStyle: 'sans' },
        deployment: { target: 'vercel' },
        credentialRequirements: [],
      },
    },
  ],

  saas: [
    {
      message: "Let's build your SaaS app! What problem does it solve, and who are your target users? Also, what's the core action users will take in the app?",
      isComplete: false,
    },
    {
      message: "Great concept! Do you need user authentication? And will you be charging for the service — if so, what pricing tiers are you thinking?",
      isComplete: false,
    },
    {
      message: "I have a complete picture of your SaaS. I'll build a full-stack app with authentication, a dashboard, and Stripe billing. The spec is ready — shall we proceed?",
      isComplete: true,
      structuredOutput: {
        projectName: 'My SaaS App',
        projectGoal: 'A full-stack SaaS application with user authentication, dashboard, and subscription billing.',
        pages: [
          { name: 'Landing Page', path: '/', description: 'Marketing page with pricing and sign-up CTA', authenticated: false },
          { name: 'Login', path: '/login', description: 'User login screen', authenticated: false },
          { name: 'Register', path: '/register', description: 'User registration screen', authenticated: false },
          { name: 'Dashboard', path: '/dashboard', description: 'Main app dashboard with core features', authenticated: true },
          { name: 'Settings', path: '/settings', description: 'User account and billing settings', authenticated: true },
        ],
        features: [
          'User authentication (email + password)',
          'Protected dashboard with core feature views',
          'Stripe subscription billing',
          'Account settings and profile management',
          'Responsive Tailwind UI',
          'REST API backend',
        ],
        auth: { required: true, provider: 'supabase', socialProviders: ['Google'] },
        billing: {
          required: true,
          provider: 'stripe',
          plans: [
            { name: 'Starter', price: 900, features: ['5 projects', 'Basic analytics', 'Email support'] },
            { name: 'Pro', price: 2900, features: ['Unlimited projects', 'Advanced analytics', 'Priority support'] },
          ],
        },
        database: { provider: 'supabase', tables: ['users', 'projects', 'subscriptions'] },
        integrations: [
          { name: 'Stripe', purpose: 'Subscription billing and payment processing', required: true },
        ],
        styling: { theme: 'corporate', primaryColor: '#3b82f6', fontStyle: 'sans' },
        deployment: { target: 'vercel' },
        credentialRequirements: [
          {
            integration: 'Stripe',
            label: 'Stripe API Keys',
            fields: [
              { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', type: 'password', required: true },
              { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Publishable Key', type: 'text', required: true },
              { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', type: 'password', required: true },
            ],
            when: 'before_build',
          },
        ],
      },
    },
  ],

  stripe_auth_supabase: [
    {
      message: "I'll set up the complete Stripe + Supabase Auth stack for you. What's your app called, and what does it do? I'll pre-wire everything — auth, billing, and database.",
      isComplete: false,
    },
    {
      message: "What subscription plans do you want to offer? Give me the plan names and monthly prices. Also, which OAuth providers do you want — Google, GitHub, or both?",
      isComplete: false,
    },
    {
      message: "The complete Stripe + Auth + Supabase spec is ready. I'll wire Supabase Auth with Google + GitHub OAuth, Stripe checkout with your plans, webhook handling, and a protected dashboard. Ready to build?",
      isComplete: true,
      structuredOutput: {
        projectName: 'My App',
        projectGoal: 'Production-ready app with Supabase Auth, Stripe billing, and PostgreSQL database — fully pre-wired.',
        pages: [
          { name: 'Landing Page', path: '/', description: 'Marketing page with pricing and OAuth sign-in', authenticated: false },
          { name: 'Login', path: '/login', description: 'Supabase Auth login with Google + GitHub OAuth', authenticated: false },
          { name: 'Dashboard', path: '/dashboard', description: 'Protected main dashboard', authenticated: true },
          { name: 'Billing', path: '/billing', description: 'Subscription management and plan upgrade', authenticated: true },
        ],
        features: [
          'Supabase Auth with Google + GitHub OAuth',
          'Stripe checkout and subscription management',
          'Stripe webhook handler (payment events)',
          'Protected dashboard routes',
          'Billing management page',
          'Supabase PostgreSQL database',
          'Row-level security policies',
        ],
        auth: { required: true, provider: 'supabase', socialProviders: ['Google', 'GitHub'] },
        billing: {
          required: true,
          provider: 'stripe',
          plans: [
            { name: 'Free', price: 0, features: ['3 projects', 'Community support'] },
            { name: 'Pro', price: 1900, features: ['Unlimited projects', 'Priority support', 'Advanced features'] },
          ],
        },
        database: { provider: 'supabase', tables: ['profiles', 'subscriptions', 'projects'] },
        integrations: [
          { name: 'Stripe', purpose: 'Subscription billing and payment processing', required: true },
          { name: 'Supabase', purpose: 'Authentication and PostgreSQL database', required: true },
        ],
        styling: { theme: 'bold', primaryColor: '#8b5cf6', fontStyle: 'sans' },
        deployment: { target: 'vercel' },
        credentialRequirements: [
          {
            integration: 'Supabase',
            label: 'Supabase Project Keys',
            fields: [
              { key: 'SUPABASE_URL', label: 'Supabase Project URL', type: 'url', required: true },
              { key: 'SUPABASE_ANON_KEY', label: 'Supabase Anon Key', type: 'text', required: true },
              { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase Service Role Key', type: 'password', required: true },
            ],
            when: 'before_build',
          },
          {
            integration: 'Stripe',
            label: 'Stripe API Keys',
            fields: [
              { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', type: 'password', required: true },
              { key: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Publishable Key', type: 'text', required: true },
              { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', type: 'password', required: true },
            ],
            when: 'before_build',
          },
        ],
      },
    },
  ],
}

// ─── Mock conversation state ──────────────────────────────────
// In-memory map: conversationId → turn number (1-indexed)
// Resets on server restart — fine for testing.

const mockTurnMap = new Map<string, number>()

// ─── DifyClient class ─────────────────────────────────────────

export class DifyClient {
  private readonly builderType: BuilderType

  constructor(builderType: BuilderType) {
    this.builderType = builderType
  }

  /** Read mock mode at call time so env changes after startup are respected */
  private get isMockMode(): boolean {
    return process.env.DIFY_MOCK_MODE === 'true'
  }

  /**
   * Send a message to the Dify workflow.
   *
   * @param userMessage  The user's input text
   * @param conversationId  Existing Dify conversation ID (null for first turn)
   * @returns DifyTurn with assistant message, completion status, and optional structured output
   */
  async sendMessage(userMessage: string, conversationId: string | null): Promise<DifyTurn> {
    if (this.isMockMode) {
      return this.sendMockMessage(userMessage, conversationId)
    }
    return this.sendRealMessage(userMessage, conversationId)
  }

  // ─── Mock mode ──────────────────────────────────────────────

  private sendMockMessage(userMessage: string, conversationId: string | null): DifyTurn {
    const script = MOCK_SCRIPTS[this.builderType]

    // Generate or reuse conversation ID
    const convId = conversationId ?? `mock-conv-${this.builderType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Get current turn (default 0 = not started)
    const currentTurn = mockTurnMap.get(convId) ?? 0
    const nextTurn = currentTurn + 1

    // Clamp to last script entry if we've gone past the end
    const scriptIndex = Math.min(nextTurn - 1, script.length - 1)
    const entry = script[scriptIndex]

    // Advance turn counter
    mockTurnMap.set(convId, nextTurn)

    return {
      conversationId: convId,
      message: entry.message,
      isComplete: entry.isComplete,
      structuredOutput: entry.structuredOutput,
      turnNumber: nextTurn,
    }
  }

  // ─── Real Dify API mode ──────────────────────────────────────

  private async sendRealMessage(userMessage: string, conversationId: string | null): Promise<DifyTurn> {
    const apiKey = process.env.DIFY_API_KEY
    const baseUrl = process.env.DIFY_BASE_URL ?? 'https://api.dify.ai/v1'
    const workflowId = getWorkflowId(this.builderType)

    if (!apiKey) {
      throw new Error('DIFY_API_KEY is not configured. Set DIFY_MOCK_MODE=true for testing.')
    }

    const body: Record<string, unknown> = {
      inputs: {},
      query: userMessage,
      response_mode: 'blocking',
      user: 'codedxp-server',
    }

    if (conversationId) {
      body.conversation_id = conversationId
    }

    const response = await fetch(`${baseUrl}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Workflow-Id': workflowId,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      throw new Error(`Dify API error ${response.status}: ${errorText}`)
    }

    const data = await response.json() as {
      conversation_id: string
      answer: string
      metadata?: {
        usage?: unknown
        retriever_resources?: unknown
      }
      // Dify structured output is in the answer or a custom field
      structured_output?: Record<string, unknown>
      is_complete?: boolean
    }

    const convId = data.conversation_id
    const message = data.answer ?? ''
    const isComplete = data.is_complete === true
    const structuredOutput = data.structured_output

    // Determine turn number from mock map (real mode uses it for tracking only)
    const currentTurn = mockTurnMap.get(convId) ?? 0
    const nextTurn = currentTurn + 1
    mockTurnMap.set(convId, nextTurn)

    return {
      conversationId: convId,
      message,
      isComplete,
      structuredOutput,
      turnNumber: nextTurn,
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────

export function getDifyClient(builderType: BuilderType): DifyClient {
  return new DifyClient(builderType)
}

// ─── Mock state cleanup (for tests) ──────────────────────────

export function clearMockConversation(conversationId: string): void {
  mockTurnMap.delete(conversationId)
}

export function clearAllMockConversations(): void {
  mockTurnMap.clear()
}
