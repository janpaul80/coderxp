/**
 * productIntelligence.ts — Roadmap Item #4: Product-Level Intelligence
 *
 * Generates structured product intelligence from a user's app request:
 *   - Product Brief: goals, user roles, core flows, page hierarchy, features, onboarding
 *   - User Flows: step-by-step flow definitions for each core user journey
 *   - Branding Direction: visual style, color palette, typography, personality, logo brief
 *   - Marketing Copy: headline, subheadline, feature copy, CTA copy, SEO metadata
 *   - Analytics Blueprint: event definitions with name, trigger, and category
 *
 * Injected into Planner → Frontend → Image prompts to drive informed, product-aware builds.
 */

import { z } from 'zod'
import { completeJSON, isProviderAvailable } from '../lib/providers'

// ─── Interfaces ────────────────────────────────────────────────

export interface ProductBrief {
  productGoals: string[]
  userRoles: Array<{ role: string; description: string }>
  coreFlows: string[]
  pageHierarchy: Array<{ page: string; sections: string[]; priority: 'critical' | 'important' | 'nice-to-have' }>
  features: Array<{ name: string; description: string; userRole: string }>
  onboardingRequirements: string[]
}

export interface UserFlow {
  name: string
  userRole: string
  steps: Array<{ order: number; action: string; page: string; outcome: string }>
  triggers: string[]
}

export interface BrandingDirection {
  style: 'minimal' | 'bold' | 'playful' | 'corporate' | 'premium' | 'editorial'
  colorPalette: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  typography: {
    headingFont: string
    bodyFont: string
    monoFont: string
  }
  personality: string[]
  logoBrief: string
}

export interface MarketingCopy {
  headline: string
  subheadline: string
  featureCopy: Array<{ feature: string; copy: string }>
  ctaCopy: { primary: string; secondary: string }
  seoMetadata: { title: string; description: string; keywords: string[] }
}

export interface AnalyticsBlueprint {
  events: Array<{
    name: string
    trigger: string
    category: 'engagement' | 'conversion' | 'navigation' | 'error' | 'system'
    properties?: string[]
  }>
}

export interface ProductIntelligence {
  brief: ProductBrief
  userFlows: UserFlow[]
  branding: BrandingDirection
  marketingCopy: MarketingCopy
  analytics: AnalyticsBlueprint
}

// ─── Zod schemas ────────────────────────────────────────────────

const productBriefSchema = z.object({
  productGoals: z.array(z.string()).min(1).max(5),
  userRoles: z.array(z.object({
    role: z.string(),
    description: z.string(),
  })).min(1).max(5),
  coreFlows: z.array(z.string()).min(1).max(8),
  pageHierarchy: z.array(z.object({
    page: z.string(),
    sections: z.array(z.string()),
    priority: z.enum(['critical', 'important', 'nice-to-have']),
  })).min(1).max(15),
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    userRole: z.string(),
  })).min(1).max(15),
  onboardingRequirements: z.array(z.string()).min(1).max(6),
})

const userFlowSchema = z.object({
  name: z.string(),
  userRole: z.string(),
  steps: z.array(z.object({
    order: z.number(),
    action: z.string(),
    page: z.string(),
    outcome: z.string(),
  })).min(2).max(10),
  triggers: z.array(z.string()).min(1).max(4),
})

const brandingSchema = z.object({
  style: z.enum(['minimal', 'bold', 'playful', 'corporate', 'premium', 'editorial']),
  colorPalette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string(),
    text: z.string(),
  }),
  typography: z.object({
    headingFont: z.string(),
    bodyFont: z.string(),
    monoFont: z.string(),
  }),
  personality: z.array(z.string()).min(2).max(5),
  logoBrief: z.string(),
})

const marketingCopySchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  featureCopy: z.array(z.object({
    feature: z.string(),
    copy: z.string(),
  })).min(2).max(10),
  ctaCopy: z.object({
    primary: z.string(),
    secondary: z.string(),
  }),
  seoMetadata: z.object({
    title: z.string(),
    description: z.string(),
    keywords: z.array(z.string()).min(3).max(10),
  }),
})

const analyticsSchema = z.object({
  events: z.array(z.object({
    name: z.string(),
    trigger: z.string(),
    category: z.enum(['engagement', 'conversion', 'navigation', 'error', 'system']),
    properties: z.array(z.string()).optional(),
  })).min(3).max(20),
})

const fullProductIntelligenceSchema = z.object({
  brief: productBriefSchema,
  userFlows: z.array(userFlowSchema).min(1).max(6),
  branding: brandingSchema,
  marketingCopy: marketingCopySchema,
  analytics: analyticsSchema,
})

// ─── AI generation ──────────────────────────────────────────────

const PRODUCT_INTELLIGENCE_SYSTEM_PROMPT = `You are a senior product strategist and UX architect for an AI app builder called CoderXP.
Given a user's app idea, generate comprehensive product intelligence that informs every agent in the build pipeline.

You MUST return a valid JSON object matching this exact schema:
{
  "brief": {
    "productGoals": ["Goal 1", ...],
    "userRoles": [{ "role": "Admin", "description": "..." }],
    "coreFlows": ["User signs up → completes onboarding → creates first project"],
    "pageHierarchy": [{ "page": "Home", "sections": ["Hero", "Features", ...], "priority": "critical" }],
    "features": [{ "name": "Feature", "description": "...", "userRole": "User" }],
    "onboardingRequirements": ["Email verification", "Profile setup", ...]
  },
  "userFlows": [
    {
      "name": "Sign Up Flow",
      "userRole": "New User",
      "steps": [{ "order": 1, "action": "Click Sign Up", "page": "Landing", "outcome": "Registration form shown" }],
      "triggers": ["CTA click", "Pricing page"]
    }
  ],
  "branding": {
    "style": "minimal" | "bold" | "playful" | "corporate" | "premium" | "editorial",
    "colorPalette": { "primary": "#...", "secondary": "#...", "accent": "#...", "background": "#...", "text": "#..." },
    "typography": { "headingFont": "Inter", "bodyFont": "Inter", "monoFont": "JetBrains Mono" },
    "personality": ["Professional", "Innovative"],
    "logoBrief": "One-sentence description of ideal logo"
  },
  "marketingCopy": {
    "headline": "Main hero headline",
    "subheadline": "Supporting subtitle",
    "featureCopy": [{ "feature": "Feature name", "copy": "Marketing copy for this feature" }],
    "ctaCopy": { "primary": "Get Started Free", "secondary": "See How It Works" },
    "seoMetadata": { "title": "Page title", "description": "Meta description", "keywords": ["keyword1", ...] }
  },
  "analytics": {
    "events": [
      { "name": "signup_started", "trigger": "User clicks Sign Up", "category": "conversion", "properties": ["source", "plan"] }
    ]
  }
}

RULES:
- productGoals: 2-5 concrete business goals (not vague)
- userRoles: 1-4 distinct user types with clear descriptions
- coreFlows: 3-8 end-to-end user journeys as brief sentences
- pageHierarchy: every page the app needs with its sections and priority
- features: map each feature to a user role
- onboardingRequirements: what a new user must do on first visit
- userFlows: 2-6 step-by-step flows covering the most critical user journeys
- branding: infer style from the product type (SaaS→minimal/premium, kids→playful, enterprise→corporate)
- colorPalette: use hex colors. Choose a cohesive palette that matches the style.
- typography: suggest Google Fonts that match the style. Default to Inter for clean/modern.
- marketingCopy: write actual copy, not placeholders. Headline should be punchy (5-10 words).
- analytics: 5-15 key events covering signup, core feature usage, and conversion
- Return ONLY the JSON object, no markdown, no explanation`

/**
 * Generate full product intelligence from a user request.
 * Used by the Planner to enrich the build plan with product-level context.
 */
export async function generateProductIntelligence(
  userRequest: string,
  projectName?: string,
  memoryContext?: string,
): Promise<ProductIntelligence | null> {
  if (!isProviderAvailable('openrouter') && !isProviderAvailable('openclaw')) {
    console.warn('[ProductIntelligence] No AI provider available — skipping')
    return null
  }

  const memoryBlock = memoryContext
    ? `\n\nMemory context (respect prior decisions):\n${memoryContext}`
    : ''

  try {
    const result = await completeJSON({
      role: 'planner',
      schema: fullProductIntelligenceSchema,
      systemPrompt: PRODUCT_INTELLIGENCE_SYSTEM_PROMPT,
      userPrompt: `User request: "${userRequest}"${projectName ? `\nProject name: "${projectName}"` : ''}${memoryBlock}

Generate comprehensive product intelligence for this app.`,
      temperature: 0.4,
      maxTokens: 3000,
      retries: 1,
    })

    return result.parsed as ProductIntelligence
  } catch (err) {
    console.warn('[ProductIntelligence] AI generation failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Context formatting for prompt injection ────────────────────

/**
 * Format ProductIntelligence into a compact context block for injection
 * into agent prompts (Planner, Frontend, Image).
 */
export function buildProductIntelligenceContext(pi: ProductIntelligence): string {
  const lines: string[] = [
    '=== PRODUCT INTELLIGENCE ===',
    '',
    '--- Product Brief ---',
    `Goals: ${pi.brief.productGoals.join('; ')}`,
    `User Roles: ${pi.brief.userRoles.map(r => `${r.role} (${r.description})`).join('; ')}`,
    `Core Flows: ${pi.brief.coreFlows.join('; ')}`,
    `Onboarding: ${pi.brief.onboardingRequirements.join('; ')}`,
    '',
    '--- Page Hierarchy ---',
  ]

  for (const page of pi.brief.pageHierarchy) {
    lines.push(`  ${page.page} [${page.priority}]: ${page.sections.join(', ')}`)
  }

  lines.push('')
  lines.push('--- User Flows ---')
  for (const flow of pi.userFlows) {
    const stepsStr = flow.steps.map(s => `${s.order}. ${s.action} → ${s.outcome}`).join(' → ')
    lines.push(`  ${flow.name} (${flow.userRole}): ${stepsStr}`)
  }

  lines.push('')
  lines.push('--- Branding ---')
  lines.push(`Style: ${pi.branding.style}`)
  lines.push(`Colors: primary=${pi.branding.colorPalette.primary}, secondary=${pi.branding.colorPalette.secondary}, accent=${pi.branding.colorPalette.accent}, bg=${pi.branding.colorPalette.background}, text=${pi.branding.colorPalette.text}`)
  lines.push(`Typography: heading=${pi.branding.typography.headingFont}, body=${pi.branding.typography.bodyFont}`)
  lines.push(`Personality: ${pi.branding.personality.join(', ')}`)
  lines.push(`Logo brief: ${pi.branding.logoBrief}`)

  lines.push('')
  lines.push('--- Marketing Copy ---')
  lines.push(`Headline: "${pi.marketingCopy.headline}"`)
  lines.push(`Subheadline: "${pi.marketingCopy.subheadline}"`)
  lines.push(`CTA: primary="${pi.marketingCopy.ctaCopy.primary}", secondary="${pi.marketingCopy.ctaCopy.secondary}"`)
  lines.push(`SEO: title="${pi.marketingCopy.seoMetadata.title}", desc="${pi.marketingCopy.seoMetadata.description}"`)

  lines.push('')
  lines.push('--- Analytics Events ---')
  for (const evt of pi.analytics.events.slice(0, 10)) {
    lines.push(`  ${evt.name} [${evt.category}]: ${evt.trigger}`)
  }

  lines.push('')
  lines.push('Follow the product intelligence above: use the branding colors, typography, and marketing copy in the frontend. Implement the page hierarchy and user flows. Track the analytics events.')

  return lines.join('\n')
}

/**
 * Build a compact branding-only context for the Image agent.
 */
export function buildBrandingContext(pi: ProductIntelligence): string {
  return [
    '=== BRANDING DIRECTION ===',
    `Style: ${pi.branding.style}`,
    `Colors: primary=${pi.branding.colorPalette.primary}, secondary=${pi.branding.colorPalette.secondary}, accent=${pi.branding.colorPalette.accent}`,
    `Personality: ${pi.branding.personality.join(', ')}`,
    `Logo brief: ${pi.branding.logoBrief}`,
    '',
    'Generate visual assets that match this branding direction. Use the specified color palette and style.',
  ].join('\n')
}
