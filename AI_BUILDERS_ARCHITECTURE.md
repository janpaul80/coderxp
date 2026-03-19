# AI Builders — Architecture Proposal
## Phase 8: Guided Builder Layer for Coded XP

**Status:** Proposal — pending approval before implementation  
**Scope:** Coded XP only (V1). Not HeftCoder. Not a public Dify page.  
**Product label:** AI Builders  
**Principle:** Dify is the intake engine. Coded XP is the platform.

---

## Table of Contents

1. [Cross-Slice Integration Review](#1-cross-slice-integration-review)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Internal Project Spec Contract](#3-internal-project-spec-contract)
4. [Normalization Layer](#4-normalization-layer)
5. [Dify Integration Layer](#5-dify-integration-layer)
6. [Backend API Design](#6-backend-api-design)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Handoff into Existing Build Pipeline](#8-handoff-into-existing-build-pipeline)
9. [V1 Builder Types & Scope](#9-v1-builder-types--scope)
10. [Risks & Tradeoffs](#10-risks--tradeoffs)
11. [Future Portability](#11-future-portability)
12. [Implementation Plan](#12-implementation-plan)

---

## 1. Cross-Slice Integration Review

Before adding new capability, here is an honest assessment of where the current experience is cohesive and where it still has gaps.

### 1.1 What Is Working Well

| Layer | Status | Notes |
|-------|--------|-------|
| Plan generation → approval | ✅ Cohesive | `chat:send` → `plan:created` → `plan:approve` → `job:created` is clean and traceable |
| Memory context injection | ✅ Wired | `getCombinedContext` injected into `generatePlan` at plan time |
| Live execution timeline | ✅ Wired | `job:log` → `ExecutionTimeline` → phase grouping works end-to-end |
| Credential handoff | ✅ Wired | `waitForCredentials` → `credentials:requested` → modal → `credentials:provide` → resolver |
| Self-healing / repair | ✅ Wired | `--legacy-peer-deps` fallback, `job:repair` re-queue, `repairAttemptCount` tracked |
| Browser control | ✅ Wired | `browser:approval_required` → modal → `browser:approve` → session active |
| Error state | ✅ Wired | `failureCategory` badge, `errorDetails` collapsible, "Retry Build" button |

### 1.2 Where the Experience Is Still Fragmented

**Gap 1 — AppMode is not fully driven by socket events**  
`transitionToBuilding`, `transitionToPreview`, `transitionToError` exist in `appStore.ts` but `useSocket.ts` does not call all of them consistently. `job:updated` updates `setPanelProgress` but does not call `transitionToBuilding` if the app is still in `idle` mode (e.g. on page reload). The right panel can show a building state while `appMode` is still `'idle'`.

**Gap 2 — No reconnection / state rehydration**  
If the user refreshes the page mid-build, the socket reconnects but the frontend has no mechanism to re-fetch the active job and resume the live timeline. The user sees an empty workspace even though a build is running.

**Gap 3 — Plan card and approval flow are chat-embedded**  
The plan approval UX lives inside the chat thread (`PlanCard` in `ChatThread`). This is functional but feels like a chat feature rather than a product decision moment. The right panel shows `PlanningView` but it is passive — the actual approve/reject controls are in the left panel chat.

**Gap 4 — Memory context is injected but not surfaced to the user**  
`getCombinedContext` is called and injected into the planner prompt, but the user never sees what memory context was used. There is no "what I remember about this project" summary visible anywhere.

**Gap 5 — Browser action feed has no persistent home**  
`BrowserActionFeed` exists as a component but is not mounted anywhere in the current layout. `BrowserSessionBadge` is mounted globally but the action feed has no panel to live in during an active session.

**Gap 6 — No unified completion state**  
When a build completes, the user gets a preview URL but there is no summary moment: "Here is what was built, here are the files, here is the preview." The transition from `building` → `preview` is abrupt.

### 1.3 Highest-Impact Polish Fixes (Phase 8 Stabilization)

These should be addressed as part of Phase 8 stabilization before the guided builder layer is added:

1. **State rehydration on reconnect** — on socket `connect`, fetch active job for the current project and call the appropriate transition helper
2. **AppMode driven by `job:updated`** — if `appMode === 'idle'` and a `job:updated` arrives with an active status, call `transitionToBuilding`
3. **Browser action feed panel** — mount `BrowserActionFeed` in the right panel when `activeBrowserSession !== null`
4. **Build completion summary** — on `job:complete`, show a summary card in the right panel before transitioning to preview

These are targeted fixes, not rewrites. They close the most visible gaps before the guided builder layer is added.

---

## 2. System Architecture Overview

### 2.1 Core Principle

> **Dify is the structured intake engine. Coded XP is the platform.**  
> The builder flow is a new entry path into the same execution engine.  
> After spec approval, the flow is identical to the existing `plan:approve` path.

The user never sees "Dify." They see **AI Builders** — a native Coded XP feature.

### 2.2 Full Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CODED XP PLATFORM                        │
│                                                                 │
│  User opens AI Builders                                         │
│          │                                                      │
│          ▼                                                      │
│  Builder type selection                                         │
│  (Landing Page / SaaS / Stripe+Auth+Supabase)                   │
│          │                                                      │
│          ▼                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              GUIDED WORKFLOW LAYER                        │  │
│  │                                                           │  │
│  │  User answers structured questions in Coded XP UI        │  │
│  │          │                                               │  │
│  │          ▼  (server-proxied, never exposed to frontend)  │  │
│  │  ┌─────────────────────────────────────────────────┐    │  │
│  │  │              DIFY WORKFLOW ENGINE               │    │  │
│  │  │  Collects structured requirements per builder   │    │  │
│  │  │  type. Outputs raw JSON when complete.          │    │  │
│  │  └─────────────────────────────────────────────────┘    │  │
│  │          │                                               │  │
│  │          ▼                                               │  │
│  │  Raw Dify JSON output                                    │  │
│  │          │                                               │  │
│  │          ▼                                               │  │
│  │  ┌─────────────────────────────────────────────────┐    │  │
│  │  │         NORMALIZATION LAYER (Coded XP owns)     │    │  │
│  │  │  Dify output → BuilderSpec (validated, Zod)     │    │  │
│  │  │  BuilderSpec → PlanOutput (existing contract)   │    │  │
│  │  └─────────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────────┘  │
│          │                                                      │
│          ▼                                                      │
│  User reviews BuilderSpec summary (native Coded XP UI)          │
│          │                                                      │
│          ▼                                                      │
│  User approves → plan:approve socket event                      │
│          │                                                      │
│          ▼                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              EXISTING EXECUTION ENGINE                    │  │
│  │                                                           │  │
│  │  builderQueue → scaffold → install → generate → preview  │  │
│  │  telemetry → live timeline → credential handoff          │  │
│  │  self-healing → repair → completion summary              │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 What Dify Is and Is Not

| Dify IS | Dify IS NOT |
|---------|-------------|
| The guided conversation engine | The platform identity |
| The structured intake layer | The build executor |
| A workflow that produces a JSON spec | A user-facing product |
| Server-side only (never called from frontend) | The source of truth for downstream execution |
| Replaceable without changing the build system | Visible to the user in any form |

---

## 3. Internal Project Spec Contract

This is the normalized spec that all builder outputs must map into. It is **Coded XP's contract** — not Dify's output format. The build system never sees raw Dify output.

```typescript
// apps/server/src/services/builderSpec.ts

export type BuilderType =
  | 'landing_page'
  | 'saas'
  | 'stripe_auth_supabase'

export interface BuilderSpec {
  // ── Builder metadata ──────────────────────────────────────
  builderType: BuilderType
  builderVersion: string          // e.g. '1.0.0'
  sessionId: string               // BuilderSession.id

  // ── Project identity ──────────────────────────────────────
  projectName: string
  projectGoal: string             // 1-2 sentence description of what will be built

  // ── Pages / screens ───────────────────────────────────────
  pages: BuilderPage[]

  // ── Features ──────────────────────────────────────────────
  features: string[]              // user-facing feature list (3-10 items)

  // ── Auth ──────────────────────────────────────────────────
  auth: {
    required: boolean
    provider: 'supabase' | 'jwt_only' | 'none'
    socialProviders: string[]     // e.g. ['google', 'github']
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
    tables: string[]              // high-level table/entity names
  }

  // ── Integrations ──────────────────────────────────────────
  integrations: BuilderIntegration[]

  // ── Styling / branding ────────────────────────────────────
  styling: {
    theme: 'minimal' | 'bold' | 'corporate' | 'playful'
    primaryColor?: string         // hex, e.g. '#6366f1'
    fontStyle: 'sans' | 'serif' | 'mono'
  }

  // ── Deployment ────────────────────────────────────────────
  deployment: {
    target: 'vercel' | 'railway' | 'docker'
  }

  // ── Credential requirements (pre-declared) ────────────────
  // Declared upfront so the build can request them at the right time.
  // These feed directly into the existing credential handoff flow.
  credentialRequirements: CredentialRequirement[]

  // ── Raw Dify output (preserved for debugging, never used downstream) ──
  _difyRaw?: unknown
}

export interface BuilderPage {
  name: string                    // e.g. 'Landing Page', 'Dashboard'
  path: string                    // e.g. '/', '/dashboard'
  description: string             // what this page does
  authenticated: boolean          // requires login to access
}

export interface BillingPlan {
  name: string                    // e.g. 'Starter', 'Pro'
  price: number                   // monthly USD cents (0 = free)
  features: string[]              // what's included
}

export interface BuilderIntegration {
  name: string                    // e.g. 'Stripe', 'Supabase', 'Resend'
  purpose: string                 // e.g. 'Payment processing'
  required: boolean
}

export interface CredentialRequirement {
  integration: string             // matches IntegrationType in frontend types
  label: string                   // e.g. 'Supabase Project Credentials'
  fields: Array<{
    key: string                   // e.g. 'SUPABASE_URL'
    label: string                 // e.g. 'Supabase Project URL'
    type: 'text' | 'password' | 'url'
    required: boolean
  }>
  when: 'before_build' | 'during_build'
}
```

### 3.1 Zod Validation Schema

Every `BuilderSpec` produced by the normalization layer must pass Zod validation before being stored or used. This prevents malformed Dify output from reaching the build system.

```typescript
import { z } from 'zod'

export const builderSpecSchema = z.object({
  builderType: z.enum(['landing_page', 'saas', 'stripe_auth_supabase']),
  builderVersion: z.string(),
  sessionId: z.string(),
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
      name: z.string(),
      price: z.number().min(0),
      features: z.array(z.string()),
    })),
  }),
  database: z.object({
    provider: z.enum(['supabase', 'postgres', 'none']),
    tables: z.array(z.string()),
  }),
  integrations: z.array(z.object({
    name: z.string(),
    purpose: z.string(),
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
    integration: z.string(),
    label: z.string(),
    fields: z.array(z.object({
      key: z.string(),
      label: z.string(),
      type: z.enum(['text', 'password', 'url']),
      required: z.boolean(),
    })),
    when: z.enum(['before_build', 'during_build']),
  })),
})
```

---

## 4. Normalization Layer

The normalization layer converts a validated `BuilderSpec` into the `PlanOutput` format that the existing planner pipeline and builder queue already understand. This is the critical decoupling point.

```typescript
// apps/server/src/services/builderSpec.ts

import type { PlanOutput } from './planner'

/**
 * Converts a BuilderSpec into the PlanOutput format.
 *
 * The build system never sees raw Dify output — only normalized PlanOutput.
 * This function is the single point of coupling between the builder layer
 * and the execution engine.
 */
export function builderSpecToPlanOutput(spec: BuilderSpec): PlanOutput {
  return {
    summary: spec.projectGoal,
    features: spec.features,
    techStack: buildTechStack(spec),
    frontendScope: spec.pages.map(p =>
      `${p.name} (${p.path})${p.authenticated ? ' [auth required]' : ''}`
    ),
    backendScope: buildBackendScope(spec),
    integrations: spec.integrations.map(i => `${i.name} — ${i.purpose}`),
    executionSteps: buildExecutionSteps(spec),
    estimatedComplexity: inferComplexity(spec),
  }
}

function buildTechStack(spec: BuilderSpec) {
  const frontend = ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS']
  const backend = ['Node.js', 'Express', 'TypeScript']

  const database = spec.database.provider === 'supabase'
    ? ['Supabase', 'PostgreSQL']
    : spec.database.provider === 'postgres'
    ? ['PostgreSQL', 'Prisma']
    : []

  const auth = spec.auth.provider === 'supabase'
    ? ['Supabase Auth', ...spec.auth.socialProviders.map(p => `${p} OAuth`)]
    : spec.auth.required
    ? ['JWT', 'bcrypt']
    : []

  const integrations = spec.integrations.map(i => i.name)

  const deployment = spec.deployment.target === 'vercel'
    ? ['Vercel']
    : spec.deployment.target === 'railway'
    ? ['Railway']
    : ['Docker']

  return { frontend, backend, database, auth, integrations, deployment }
}

function buildBackendScope(spec: BuilderSpec): string[] {
  const scope: string[] = []
  if (spec.auth.required) {
    scope.push('Auth endpoints (register, login, session, refresh)')
  }
  if (spec.billing.required) {
    scope.push('Stripe checkout session endpoint')
    scope.push('Stripe webhook handler (payment events)')
    if (spec.billing.plans.length > 0) {
      scope.push(`Subscription plans: ${spec.billing.plans.map(p => p.name).join(', ')}`)
    }
  }
  for (const table of spec.database.tables) {
    scope.push(`${table} CRUD API`)
  }
  return scope
}

function buildExecutionSteps(spec: BuilderSpec) {
  const steps: Array<{
    order: number
    title: string
    description: string
    estimatedDuration?: string
  }> = []

  let order = 1

  steps.push({
    order: order++,
    title: 'Project scaffold',
    description: 'Initialize project structure, install dependencies, configure environment variables',
    estimatedDuration: '2-3 min',
  })

  steps.push({
    order: order++,
    title: 'Core layout & routing',
    description: 'Build page shell, navigation structure, and client-side routing',
    estimatedDuration: '3-5 min',
  })

  for (const page of spec.pages) {
    steps.push({
      order: order++,
      title: `Build: ${page.name}`,
      description: page.description,
      estimatedDuration: '5-10 min',
    })
  }

  if (spec.auth.required) {
    steps.push({
      order: order++,
      title: 'Authentication',
      description: `Implement ${spec.auth.provider === 'supabase' ? 'Supabase Auth' : 'JWT'} flow${spec.auth.socialProviders.length > 0 ? ` with ${spec.auth.socialProviders.join(', ')} OAuth` : ''}`,
      estimatedDuration: '5-8 min',
    })
  }

  if (spec.billing.required) {
    steps.push({
      order: order++,
      title: 'Billing integration',
      description: `Stripe checkout, ${spec.billing.plans.map(p => p.name).join('/')} plans, and webhook handling`,
      estimatedDuration: '8-12 min',
    })
  }

  if (spec.database.tables.length > 0) {
    steps.push({
      order: order++,
      title: 'Database layer',
      description: `Schema + CRUD for: ${spec.database.tables.join(', ')}`,
      estimatedDuration: '5-10 min',
    })
  }

  steps.push({
    order: order,
    title: 'Integration & preview',
    description: 'Wire all flows end-to-end, validate connections, start preview server',
    estimatedDuration: '3-5 min',
  })

  return steps
}

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
```

---

## 5. Dify Integration Layer

### 5.1 How Dify Is Used

- Each builder type maps to **one Dify workflow** (3 workflows for V1)
- Dify workflows are conversational — they ask structured questions and collect answers
- The Dify workflow outputs a JSON object that maps to `BuilderSpec`
- **Coded XP proxies all Dify communication server-side** — the frontend never calls Dify directly
- Dify API key is a server-side env var only (`DIFY_API_KEY`, `DIFY_BASE_URL`)
- Dify workflow IDs are server-side config only (`DIFY_WORKFLOW_LANDING_PAGE`, etc.)

### 5.2 Dify Workflow Design (Per Builder Type)

**Landing Page Builder — workflow questions:**
1. What is the product or service name?
2. What is the one-sentence value proposition?
3. Who is the target audience?
4. Which sections do you need? (hero, features, pricing, testimonials, FAQ, CTA, footer)
5. Do you need a contact form or email capture?
6. What is the primary color and brand feel? (minimal / bold / corporate / playful)
7. Do you need a custom domain deployment?

**SaaS Builder — workflow questions:**
1. What does your SaaS do? (one sentence)
2. Who are the users?
3. What are the 3-5 core features?
4. Do you need user authentication? Which providers?
5. Do you need billing/subscriptions? What plans?
6. What data does the app manage? (list tables/entities)
7. What third-party integrations do you need?
8. Deployment target? (Vercel / Railway / Docker)

**Stripe + Auth + Supabase Builder — workflow questions:**
1. What is the app name and purpose?
2. What Stripe products/plans do you need? (names, prices)
3. What Supabase tables/data do you need?
4. What pages/screens are required?
5. Which social auth providers? (Google, GitHub, etc.)
6. Any additional integrations?
7. Deployment target?

### 5.3 Server-Side Dify Client

```typescript
// apps/server/src/services/difyClient.ts

export interface DifyMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface DifyTurnResponse {
  messageId: string
  conversationId: string
  answer: string
  /** True when the Dify workflow has collected all required inputs */
  isComplete: boolean
  /** Populated only when isComplete=true — raw structured output from Dify */
  structuredOutput?: unknown
}

export class DifyClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  /**
   * Send a user message to a Dify workflow conversation.
   * Uses blocking mode (not streaming) for simplicity in V1.
   * Streaming can be added later for a more responsive feel.
   */
  async sendMessage(params: {
    workflowId: string
    conversationId?: string
    message: string
    userId: string
  }): Promise<DifyTurnResponse> {
    const response = await fetch(`${this.baseUrl}/v1/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { workflow_id: params.workflowId },
        query: params.message,
        response_mode: 'blocking',
        conversation_id: params.conversationId ?? '',
        user: params.userId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Dify API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      message_id: string
      conversation_id: string
      answer: string
      metadata?: { is_complete?: boolean; structured_output?: unknown }
    }

    return {
      messageId: data.message_id,
      conversationId: data.conversation_id,
      answer: data.answer,
      isComplete: data.metadata?.is_complete ?? false,
      structuredOutput: data.metadata?.structured_output,
    }
  }

  async getConversationHistory(conversationId: string, userId: string): Promise<DifyMessage[]> {
    const response = await fetch(
      `${this.baseUrl}/v1/messages?conversation_id=${conversationId}&user=${userId}`,
      { headers: { 'Authorization': `Bearer ${this.apiKey}` } }
    )
    const data = await response.json() as { data: Array<{ role: string; query: string; answer: string }> }
    const messages: DifyMessage[] = []
    for (const item of data.data) {
      messages.push({ role: 'user', content: item.query })
      messages.push({ role: 'assistant', content: item.answer })
    }
    return messages
  }
}
```

### 5.4 Builder Session Schema (New Prisma Model)

```prisma
model BuilderSession {
  id                   String              @id @default(cuid())
  userId               String
  projectId            String?             // set after spec approval + project creation
  builderType          String              // 'landing_page' | 'saas' | 'stripe_auth_supabase'
  status               BuilderSessionStatus @default(in_progress)
  difyConversationId   String?             // Dify conversation ID (server-side only)
  spec                 Json?               // BuilderSpec (set when workflow completes, validated)
  planId               String?             // set after spec → plan conversion
  jobId                String?             // set after plan approval
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
  completedAt          DateTime?

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project? @relation(fields: [projectId], references: [id])

  @@map("builder_sessions")
}

enum BuilderSessionStatus {
  in_progress   // Dify workflow collecting inputs
  spec_ready    // Workflow complete, spec validated, awaiting user approval
  approved      // User approved spec, project + plan created
  building      // Job queued and running
  complete      // Build finished
  abandoned     // User left without completing
}
```

---

## 6. Backend API Design

### 6.1 New Routes: `/api/builders`

```
GET  /api/builders/types
  → Returns list of available builder types with name, description, icon, estimatedTime

POST /api/builders/sessions
  → Body: { builderType: BuilderType }
  → Creates BuilderSession, returns { sessionId, builderType, firstMessage }
  → firstMessage is the opening question from the Dify workflow

GET  /api/builders/sessions/:id
  → Returns session state + spec summary (if spec_ready)
  → Never returns difyConversationId or _difyRaw

POST /api/builders/sessions/:id/message
  → Body: { content: string }
  → Proxies to Dify, normalizes response
  → Returns { answer, isComplete, specSummary? }

POST /api/builders/sessions/:id/approve
  → Validates spec_ready status
  → Runs builderSpecToPlanOutput()
  → Creates Project + Plan + Chat
  → Emits plan:created socket event
  → Returns { projectId, planId, chatId }

DELETE /api/builders/sessions/:id
  → Marks session abandoned
```

### 6.2 `POST /api/builders/sessions/:id/message` — Detailed Flow

```
1. Auth: verify session ownership + status === 'in_progress'
2. Load session (get difyConversationId if exists)
3. Call DifyClient.sendMessage({ workflowId, conversationId, message, userId })
4. If Dify returns isComplete=true:
   a. Extract structuredOutput from Dify response
   b. Validate against builderSpecSchema (Zod) — throw if invalid
   c. Store validated spec in session: { spec, status: 'spec_ready' }
   d. Return { answer, isComplete: true, specSummary: buildSpecSummary(spec) }
5. If workflow still in progress:
   a. Update session.difyConversationId if new
   b. Return { answer, isComplete: false }
```

### 6.3 `POST /api/builders/sessions/:id/approve` — Detailed Flow

```
1. Auth: verify session ownership + status === 'spec_ready'
2. Load spec from session (already validated)
3. Call builderSpecToPlanOutput(spec) → PlanOutput
4. Create Project:
   { name: spec.projectName, description: spec.projectGoal, userId, status: 'planning' }
5. Create Chat for the project (workspace needs a thread to land on)
6. Create Plan from PlanOutput (same Prisma fields as planner.ts):
   { chatId, projectId, summary, features, techStack, frontendScope, backendScope,
     integrations, executionSteps, estimatedComplexity, status: 'pending_approval' }
7. Update session: { status: 'approved', projectId, planId }
8. Emit plan:created socket event to user's socket room
9. Return { projectId, planId, chatId }

IMPORTANT: approve does NOT queue the job. The user still goes through the existing
plan:approve socket event. This preserves the approval moment and keeps the execution
path 100% identical to the freeform chat flow.
```

---

## 7. Frontend Architecture

### 7.1 New Route

```typescript
// apps/web/src/App.tsx — add two routes

<Route path="/builders" element={<ProtectedRoute><BuildersPage /></ProtectedRoute>} />
<Route path="/builders/:sessionId" element={<ProtectedRoute><BuildersPage /></ProtectedRoute>} />
```

### 7.2 Component Tree

```
apps/web/src/pages/BuildersPage.tsx
  ├── BuilderGallery.tsx          — builder type selection grid (shown when no active session)
  └── BuilderFlow.tsx             — active guided conversation (shown when session exists)
      ├── BuilderHeader.tsx       — builder type label + step progress indicator
      ├── BuilderChat.tsx         — conversation thread (Dify messages, Coded XP styled)
      ├── BuilderInput.tsx        — message input (same feel as ChatInput.tsx)
      ├── BuilderSpecPreview.tsx  — spec summary card (shown when isComplete=true)
      └── BuilderApproveBar.tsx   — "Launch Build" CTA (shown when spec_ready)

apps/web/src/store/builderStore.ts  — Zustand store for builder session state
apps/web/src/lib/builderApi.ts      — API calls for /api/builders/*
apps/web/src/types/builder.ts       — BuilderSpec, BuilderSession, BuilderMessage types
```

### 7.3 Zustand Store

```typescript
// apps/web/src/store/builderStore.ts

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface BuilderMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface BuilderSpecSummary {
  projectName: string
  projectGoal: string
  builderType: string
  pages: string[]
  features: string[]
  auth: string
  billing: string
  database: string
  integrations: string[]
  deployment: string
  credentialRequirements: Array<{ label: string; when: string }>
  estimatedComplexity: 'low' | 'medium' | 'high'
}

interface BuilderStore {
  sessionId: string | null
  builderType: string | null
  messages: BuilderMessage[]
  isComplete: boolean
  specSummary: BuilderSpecSummary | null
  isLoading: boolean

  setSession: (sessionId: string, builderType: string) => void
  addMessage: (msg: BuilderMessage) => void
  setComplete: (specSummary: BuilderSpecSummary) => void
  setLoading: (v: boolean) => void
  reset: () => void
}

export const useBuilderStore = create<BuilderStore>()(
  devtools(
    (set) => ({
      sessionId: null,
      builderType: null,
      messages: [],
      isComplete: false,
      specSummary: null,
      isLoading: false,

      setSession: (sessionId, builderType) =>
        set({ sessionId, builderType }, false, 'setSession'),

      addMessage: (msg) =>
        set((s) => ({ messages: [...s.messages, msg] }), false, 'addMessage'),

      setComplete: (specSummary) =>
        set({ isComplete: true, specSummary }, false, 'setComplete'),

      setLoading: (v) => set({ isLoading: v }, false, 'setLoading'),

      reset: () =>
        set({
          sessionId: null, builderType: null, messages: [],
          isComplete: false, specSummary: null, isLoading: false,
        }, false, 'reset'),
    }),
    { name: 'CodedXP/BuilderStore' }
  )
)
```

### 7.4 Entry Point in Sidebar

Add an **"AI Builders"** button to the sidebar above the project list. This is the primary discovery path.

```
┌─────────────────────────────────┐
│  ⚡ CodedXP                      │
│                                 │
│  [+ New Project]                │
│  [✦ AI Builders]  ← NEW         │
│                                 │
│  ─── Projects ───               │
│  › my-saas-app                  │
│  › landing-page-v2              │
└─────────────────────────────────┘
```

### 7.5 Builder Gallery UX

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ AI Builders                                                  │
│  Answer a few questions. We'll build the rest.                  │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  🚀 Landing Page  │  │  ⚙️  SaaS App    │  │ 💳 Stripe +  │  │
│  │                  │  │                  │  │ Auth +       │  │
│  │  Fast, focused   │  │  Full-stack with  │  │ Supabase     │  │
│  │  marketing site  │  │  auth + billing  │  │              │  │
│  │  ~7 questions    │  │  ~8 questions    │  │ Production   │  │
│  │                  │  │                  │  │ ready stack  │  │
│  │  [Start →]       │  │  [Start →]       │  │ ~7 questions │  │
│  └──────────────────┘  └──────────────────┘  │              │  │
│                                              │  [Start →]   │  │
│                                              └──────────────┘  │
│                                                                 │
│  Prefer to describe it yourself?                                │
│  [────────────────────────────────────────] [→ Freeform Build]  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.6 Builder Flow UX

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ SaaS Builder                               Step 3 of 8       │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ● What are the 3-5 core features of your SaaS?         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  User: User authentication with Google login            │   │
│  │        Project management dashboard                     │   │
│  │        Team collaboration with roles                    │   │
│  │        Stripe billing with monthly/annual plans         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [────────────────────────────────────────────────] [Send →]   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.7 Spec Review + Launch UX

```
┌─────────────────────────────────────────────────────────────────┐
│  ✦ Your SaaS is ready to build                                  │
│                                                                 │
│  TeamFlow — Project management for remote teams                 │
│                                                                 │
│  Pages        Dashboard, Projects, Team, Settings, Auth         │
│  Auth         Supabase (Google, GitHub)                         │
│  Billing      Stripe — Starter $9/mo, Pro $29/mo               │
│  Database     Supabase — projects, tasks, team_members          │
│  Stack        React + Supabase + Stripe + Vercel                │
│  Complexity   Medium                                            │
│                                                                 │
│  ─── Credentials needed ────────────────────────────────────── │
│  ⚠  Supabase URL + Anon Key    (requested during build)         │
│  ⚠  Stripe Secret Key          (requested during build)         │
│                                                                 │
│  [← Revise]                          [🚀 Launch Build]          │
└─────────────────────────────────────────────────────────────────┘
```

After "Launch Build":
1. `POST /api/builders/sessions/:id/approve` → `{ projectId, planId, chatId }`
2. Frontend navigates to `/` (workspace) with `projectId` active
3. User sees the plan card in the workspace chat thread
4. User clicks "Approve Plan" → existing `plan:approve` socket event fires
5. Build begins — live timeline, credential modals, self-healing all work as normal

---

## 8. Handoff into Existing Build Pipeline

This is the most important architectural guarantee: **after spec approval, nothing changes**.

```
BuilderSession.approve()
        │
        ▼
builderSpecToPlanOutput(spec)     ← normalization layer
        │
        ▼
prisma.plan.create(planOutput)    ← same schema as freeform plans
        │
        ▼
socket.emit('plan:created', plan) ← same event as freeform flow
        │
        ▼
User clicks "Approve Plan"
        │
        ▼
socket.on('plan:approve')         ← existing handler in events.ts
        │
        ▼
builderQueue.add('build', ...)    ← existing queue
        │
        ▼
builderQueue.ts worker            ← existing worker (unchanged)
        │
        ├── scaffold
        ├── install
        ├── generate (LLM)
        ├── credential handoff    ← existing credentialService
        ├── preview start
        └── self-healing          ← existing repair flow
```

The builder layer adds **zero new code paths** to the execution engine. It only adds a new way to create a `Plan` record.

---

## 9. V1 Builder Types & Scope

### 9.1 Landing Page Builder

**Purpose:** Fast, focused marketing site. No auth, no backend, no database.  
**Output:** Single-page or multi-section React site with Tailwind styling.  
**Questions:** ~7  
**Credential requirements:** None (unless email capture needs a provider)  
**Complexity:** Low  

**Typical spec output:**
- Pages: Landing (hero, features, pricing, CTA, footer)
- Auth: none
- Billing: none
- Database: none
- Integrations: optionally Resend/Mailchimp for email capture

### 9.2 SaaS Builder

**Purpose:** Full-stack SaaS with auth, dashboard, and optional billing.  
**Output:** React frontend + Express backend + PostgreSQL/Supabase + optional Stripe.  
**Questions:** ~8  
**Credential requirements:** Supabase URL/key (if Supabase), Stripe key (if billing)  
**Complexity:** Medium–High  

**Typical spec output:**
- Pages: Landing, Auth, Dashboard, Settings, [feature pages]
- Auth: Supabase or JWT
- Billing: Stripe (optional)
- Database: Supabase or Postgres
- Integrations: varies

### 9.3 Stripe + Auth + Supabase Builder

**Purpose:** Production-ready stack with Stripe billing, Supabase auth + DB, pre-wired.  
**Output:** React + Supabase + Stripe + Vercel, fully integrated.  
**Questions:** ~7  
**Credential requirements:** Supabase URL/key, Stripe secret key  
**Complexity:** High  

**Typical spec output:**
- Pages: Landing, Auth, Dashboard, Billing, Settings
- Auth: Supabase (Google + GitHub)
- Billing: Stripe (2-3 plans)
- Database: Supabase (user-defined tables)
- Deployment: Vercel

### 9.4 What Is NOT in V1

- Customer Support Agent Builder (Phase 9+)
- Sales Agent Builder (Phase 9+)
- Mobile app builders
- E-commerce builders
- Custom workflow builders

Keep V1 focused. Three high-quality builders are better than six mediocre ones.

---

## 10. Risks & Tradeoffs

### 10.1 Dify Workflow Reliability

**Risk:** Dify workflow produces malformed or incomplete JSON output.  
**Mitigation:** Zod validation at the normalization layer. If validation fails, return an error to the frontend with a "Let me try again" option. Never let invalid spec reach the build system.  
**Fallback:** If Dify is unavailable, show a graceful error: "The guided builder is temporarily unavailable. You can still describe your project in the chat."

### 10.2 Dify Conversation State

**Risk:** Dify conversation ID is lost (server restart, session expiry).  
**Mitigation:** Store `difyConversationId` in `BuilderSession` DB record immediately on first turn. On reconnect, resume from stored ID.  
**Edge case:** If Dify conversation expires, the session must be restarted. Show a clear message: "Your session expired. Start a new builder session."

### 10.3 Spec Quality vs. Freeform Quality

**Risk:** The guided builder produces a more rigid spec than a skilled user's freeform prompt, potentially limiting what the LLM generates.  
**Mitigation:** The normalization layer (`builderSpecToPlanOutput`) produces a rich `PlanOutput` with detailed `executionSteps`, `frontendScope`, and `backendScope`. The LLM in `builderQueue.ts` still has full creative latitude within that structure.  
**Tradeoff accepted:** Guided builders trade flexibility for completeness. This is the right tradeoff for users who don't know how to write technical prompts.

### 10.4 Dify Vendor Lock-in

**Risk:** Dify changes its API, pricing, or availability.  
**Mitigation:** The `DifyClient` class is the only Dify-specific code. The `BuilderSpec` contract and normalization layer are Coded XP-owned. Replacing Dify means only replacing `DifyClient` — nothing else changes.  
**Future option:** Replace Dify with a custom LLM-powered intake flow using the same `BuilderSpec` output contract.

### 10.5 UX Friction: Two Entry Points

**Risk:** Having both freeform chat and AI Builders creates confusion about which to use.  
**Mitigation:** Clear positioning in the UI. AI Builders is for users who want guidance. Freeform chat is for users who know what they want. The gallery page should make this distinction explicit.  
**Copy suggestion:** "Not sure where to start? Use AI Builders. Know exactly what you want? Just describe it."

### 10.6 Credential Timing

**Risk:** The spec declares credential requirements upfront, but the build requests them mid-flow. If the user doesn't have credentials ready, the build stalls.  
**Mitigation:** The spec review screen (section 7.7) shows credential requirements before launch. This gives the user a chance to gather credentials before approving. The existing credential handoff flow handles the actual request during build.

---

## 11. Future Portability

The architecture is designed for future reuse without being built for it now.

### 11.1 What Is Portable

| Asset | Portable to HeftCoder? | Notes |
|-------|----------------------|-------|
| `BuilderSpec` interface | ✅ Yes | Same contract, same fields |
| `builderSpecToPlanOutput()` | ✅ Yes | Maps to HeftCoder's plan format with minor adaptation |
| `builderSpecSchema` (Zod) | ✅ Yes | Validation is format-agnostic |
| `DifyClient` | ✅ Yes | Same Dify API, different workflow IDs |
| `BuilderSession` Prisma model | ⚠️ Partial | Schema is portable, DB is separate |
| Frontend components | ⚠️ Partial | Design system differs, but logic is reusable |

### 11.2 What Is NOT Portable (By Design)

- `builderQueue.ts` — Coded XP-specific execution engine
- `credentialService.ts` — Coded XP-specific credential flow
- `previewManager.ts` — Coded XP-specific preview infrastructure
- `memory.ts` — Coded XP-specific memory layer

### 11.3 How to Port Later (When Ready)

1. Copy `BuilderSpec`, `builderSpecSchema`, `DifyClient` to HeftCoder
2. Write a `builderSpecToHeftCoderPlan()` normalization function
3. Wire into HeftCoder's plan approval flow
4. Reuse the same Dify workflows (or create HeftCoder-specific ones)
5. No changes needed to Coded XP

---

## 12. Implementation Plan

### Phase 8 Slice 1 — Stabilization (Before AI Builders)

Fix the 4 cross-slice gaps identified in Section 1.3:

- [ ] State rehydration on socket reconnect
- [ ] AppMode driven by `job:updated`
- [ ] Browser action feed panel in right panel
- [ ] Build completion summary card

### Phase 8 Slice 2 — Backend Foundation

- [ ] `apps/server/src/services/builderSpec.ts` — `BuilderSpec`, `builderSpecSchema`, `builderSpecToPlanOutput()`
- [ ] `apps/server/src/services/difyClient.ts` — `DifyClient` class
- [ ] `apps/server/prisma/schema.prisma` — `BuilderSession` model + `BuilderSessionStatus` enum
- [ ] `apps/server/prisma/migrations/` — migration for new model
- [ ] `apps/server/src/routes/builders.ts` — all 5 endpoints
- [ ] `apps/server/src/index.ts` — register `/api/builders` router
- [ ] `.env` — `DIFY_API_KEY`, `DIFY_BASE_URL`, `DIFY_WORKFLOW_LANDING_PAGE`, `DIFY_WORKFLOW_SAAS`, `DIFY_WORKFLOW_STRIPE_AUTH_SUPABASE`

### Phase 8 Slice 3 — Frontend

- [ ] `apps/web/src/types/builder.ts` — `BuilderSpec`, `BuilderSession`, `BuilderMessage`, `BuilderSpecSummary`
- [ ] `apps/web/src/store/builderStore.ts` — Zustand store
- [ ] `apps/web/src/lib/builderApi.ts` — API client functions
- [ ] `apps/web/src/pages/BuildersPage.tsx` — page shell
- [ ] `apps/web/src/components/builders/BuilderGallery.tsx`
- [ ] `apps/web/src/components/builders/BuilderFlow.tsx`
- [ ] `apps/web/src/components/builders/BuilderHeader.tsx`
- [ ] `apps/web/src/components/builders/BuilderChat.tsx`
- [ ] `apps/web/src/components/builders/BuilderInput.tsx`
- [ ] `apps/web/src/components/builders/BuilderSpecPreview.tsx`
- [ ] `apps/web/src/components/builders/BuilderApproveBar.tsx`
- [ ] `apps/web/src/App.tsx` — add `/builders` and `/builders/:sessionId` routes
- [ ] `apps/web/src/components/sidebar/Sidebar.tsx` — add "AI Builders" entry point

### Phase 8 Slice 4 — Dify Workflow Configuration

- [ ] Create 3 Dify workflows (one per builder type)
- [ ] Configure structured output format to match `BuilderSpec`
- [ ] Test each workflow end-to-end
- [ ] Verify normalization layer produces valid `PlanOutput` for each builder type

### Phase 8 Slice 5 — Testing & Closeout

- [ ] `test-phase8-slice2.mjs` — backend API tests (sessions, message proxy, approve flow)
- [ ] `test-phase8-slice3.mjs` — frontend component smoke tests (if applicable)
- [ ] Manual E2E: Landing Page Builder → spec → approve → build → preview
- [ ] Manual E2E: SaaS Builder → spec → approve → build → preview
- [ ] Manual E2E: Stripe+Auth+Supabase Builder → spec → approve → build → preview
- [ ] Update `TODO.md` and `CHANGELOG.md`
