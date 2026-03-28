// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
import { Router, Response } from 'express'
import crypto from 'crypto'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'

export const apiKeysRouter: Router = Router()

const MAX_KEYS_PER_USER = 5

// ─── Helpers ──────────────────────────────────────────────────

function generateApiKey(): string {
  const random = crypto.randomBytes(24).toString('base64url')
  return `cxp_${random}`
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// ─── GET /keys — list user's API keys ─────────────────────────

apiKeysRouter.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.userId!, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ keys })
  } catch (err) {
    console.error('[api-keys] list error:', err)
    res.status(500).json({ error: 'Failed to list API keys' })
  }
})

// ─── POST /keys — create a new API key ────────────────────────

const createKeySchema = z.object({
  name: z.string().min(1).max(64).optional().default('Default'),
})

apiKeysRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = createKeySchema.parse(req.body)

    // Enforce max keys per user
    const activeCount = await prisma.apiKey.count({
      where: { userId: req.userId!, revokedAt: null },
    })
    if (activeCount >= MAX_KEYS_PER_USER) {
      return res.status(400).json({
        error: `Maximum ${MAX_KEYS_PER_USER} active API keys allowed. Revoke an existing key first.`,
      })
    }

    const rawKey = generateApiKey()
    const keyHash = hashKey(rawKey)
    const keyPrefix = rawKey.slice(0, 12) // "cxp_" + 8 chars

    await prisma.apiKey.create({
      data: {
        userId: req.userId!,
        name,
        keyPrefix,
        keyHash,
      },
    })

    // Return the raw key ONCE — it cannot be retrieved again
    res.status(201).json({
      key: rawKey,
      keyPrefix,
      name,
      message: 'Save this key now — it will not be shown again.',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: err.errors })
    }
    console.error('[api-keys] create error:', err)
    res.status(500).json({ error: 'Failed to create API key' })
  }
})

// ─── DELETE /keys/:id — revoke an API key ─────────────────────

apiKeysRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const key = await prisma.apiKey.findFirst({
      where: { id: req.params.id, userId: req.userId!, revokedAt: null },
    })
    if (!key) {
      return res.status(404).json({ error: 'API key not found' })
    }

    await prisma.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    })

    res.json({ message: 'API key revoked' })
  } catch (err) {
    console.error('[api-keys] revoke error:', err)
    res.status(500).json({ error: 'Failed to revoke API key' })
  }
})
