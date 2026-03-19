// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
import { Router, Response } from 'express'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'

export const billingRouter: Router = Router()

// ─── Plan config ──────────────────────────────────────────────

export const PLAN_CONFIG = {
  basic: {
    name: 'Basic',
    price: 900,          // cents — $9/month
    promoPrice: 300,     // cents — $3 first month
    credits: 100,
    projectLimit: 5,
    previewLimit: 1,
    storageLimitMb: 5120,
    stripePriceId: process.env.STRIPE_PRICE_BASIC ?? '',
    stripePromoPriceId: process.env.STRIPE_PRICE_BASIC_PROMO ?? '',
  },
  pro: {
    name: 'Pro',
    price: 1900,         // cents — $19/month
    promoPrice: null,
    credits: 400,
    projectLimit: 25,
    previewLimit: 3,
    storageLimitMb: 25600,
    stripePriceId: process.env.STRIPE_PRICE_PRO ?? '',
    stripePromoPriceId: null,
  },
  teams: {
    name: 'Teams',
    price: 4900,         // cents — $49/month
    promoPrice: null,
    credits: 1500,
    projectLimit: 999,
    previewLimit: 10,
    storageLimitMb: 102400,
    stripePriceId: process.env.STRIPE_PRICE_TEAMS ?? '',
    stripePromoPriceId: null,
  },
} as const

export type PlanId = keyof typeof PLAN_CONFIG

// ─── GET /billing/plans — public plan info ────────────────────

billingRouter.get('/plans', (_req, res: Response) => {
  const plans = Object.entries(PLAN_CONFIG).map(([id, config]) => ({
    id,
    name: config.name,
    price: config.price / 100,
    promoPrice: config.promoPrice ? config.promoPrice / 100 : null,
    credits: config.credits,
    projectLimit: config.projectLimit,
    previewLimit: config.previewLimit,
    storageLimitMb: config.storageLimitMb,
  }))
  res.json({ plans })
})

// ─── GET /billing/subscription — current user subscription ───

billingRouter.get('/subscription', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.userId! },
      include: {
        usage: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!subscription) {
      return res.json({
        subscription: null,
        plan: 'free',
        status: 'none',
        usage: null,
      })
    }

    const currentUsage = subscription.usage[0] ?? null

    res.json({
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        promoApplied: subscription.promoApplied,
      },
      usage: currentUsage
        ? {
            creditsUsed: currentUsage.creditsUsed,
            creditsLimit: currentUsage.creditsLimit,
            storageUsedMb: currentUsage.storageUsedMb,
            storageLimitMb: currentUsage.storageLimitMb,
            projectCount: currentUsage.projectCount,
            projectLimit: currentUsage.projectLimit,
            periodEnd: currentUsage.periodEnd,
          }
        : null,
    })
  } catch (err) {
    console.error('[billing] get subscription error:', err)
    res.status(500).json({ error: 'Failed to fetch subscription' })
  }
})

// ─── GET /billing/usage — current period usage ───────────────

billingRouter.get('/usage', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { userId: req.userId! },
      include: {
        usage: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!subscription) {
      // Free tier defaults
      const projectCount = await prisma.project.count({ where: { userId: req.userId! } })
      return res.json({
        plan: 'free',
        creditsUsed: 0,
        creditsLimit: 10,
        storageUsedMb: 0,
        storageLimitMb: 512,
        projectCount,
        projectLimit: 3,
        periodEnd: null,
      })
    }

    const currentUsage = subscription.usage[0] ?? null
    res.json({
      plan: subscription.plan,
      creditsUsed: currentUsage?.creditsUsed ?? 0,
      creditsLimit: currentUsage?.creditsLimit ?? 0,
      storageUsedMb: currentUsage?.storageUsedMb ?? 0,
      storageLimitMb: currentUsage?.storageLimitMb ?? 0,
      projectCount: currentUsage?.projectCount ?? 0,
      projectLimit: currentUsage?.projectLimit ?? 0,
      periodEnd: currentUsage?.periodEnd ?? null,
    })
  } catch (err) {
    console.error('[billing] get usage error:', err)
    res.status(500).json({ error: 'Failed to fetch usage' })
  }
})

// ─── POST /billing/checkout — create Stripe checkout session ─

const checkoutSchema = z.object({
  planId: z.enum(['basic', 'pro', 'teams']),
  applyPromo: z.boolean().optional().default(false),
})

billingRouter.post('/checkout', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { planId, applyPromo } = checkoutSchema.parse(req.body)
    const plan = PLAN_CONFIG[planId]

    // Stripe not yet configured — return placeholder
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        error: 'Billing not yet configured',
        message: 'Stripe integration coming soon. Your plan selection has been noted.',
        planId,
        planName: plan.name,
      })
    }

    // TODO: Wire Stripe when STRIPE_SECRET_KEY is provided
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    // const session = await stripe.checkout.sessions.create({ ... })
    // res.json({ url: session.url })

    res.status(501).json({ error: 'Stripe checkout not yet implemented' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.errors })
    }
    console.error('[billing] checkout error:', err)
    res.status(500).json({ error: 'Checkout failed' })
  }
})

// ─── POST /billing/portal — Stripe customer portal ───────────

billingRouter.post('/portal', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        error: 'Billing not yet configured',
        message: 'Stripe integration coming soon.',
      })
    }

    // TODO: Wire Stripe customer portal
    res.status(501).json({ error: 'Customer portal not yet implemented' })
  } catch (err) {
    console.error('[billing] portal error:', err)
    res.status(500).json({ error: 'Portal failed' })
  }
})

// ─── POST /billing/webhook — Stripe webhook handler ──────────

billingRouter.post(
  '/webhook',
  // Note: raw body needed for Stripe signature verification
  // In index.ts, mount this BEFORE express.json() middleware
  async (req, res: Response) => {
    const sig = req.headers['stripe-signature']

    if (!process.env.STRIPE_WEBHOOK_SECRET || !sig) {
      return res.status(400).json({ error: 'Webhook not configured' })
    }

    try {
      // TODO: Verify Stripe webhook signature and handle events:
      // - checkout.session.completed → create/update subscription
      // - customer.subscription.updated → update plan/status
      // - customer.subscription.deleted → cancel subscription
      // - invoice.payment_failed → mark past_due

      res.json({ received: true })
    } catch (err) {
      console.error('[billing] webhook error:', err)
      res.status(400).json({ error: 'Webhook processing failed' })
    }
  }
)
