// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
import { Response, NextFunction } from 'express'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { AuthRequest } from './auth'

/**
 * Middleware that authenticates via CoderXP API key (cxp_ prefix).
 * Populates req.userId and req.user just like requireAuth does,
 * so downstream handlers work identically.
 */
export async function requireApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer cxp_')) {
      res.status(401).json({
        error: { type: 'authentication_error', message: 'Missing or invalid API key', code: 'invalid_api_key' },
      })
      return
    }

    const rawKey = authHeader.slice(7) // strip "Bearer "
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: { select: { id: true, email: true, name: true } } },
    })

    if (!apiKey || apiKey.revokedAt) {
      res.status(401).json({
        error: { type: 'authentication_error', message: 'Invalid or revoked API key', code: 'invalid_api_key' },
      })
      return
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      res.status(401).json({
        error: { type: 'authentication_error', message: 'API key has expired', code: 'invalid_api_key' },
      })
      return
    }

    // Update lastUsedAt (fire-and-forget)
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

    req.userId = apiKey.user.id
    req.user = apiKey.user
    next()
  } catch (err) {
    res.status(401).json({
      error: { type: 'authentication_error', message: 'Authentication failed', code: 'invalid_api_key' },
    })
  }
}

/**
 * Accepts EITHER a JWT session token OR a cxp_ API key.
 * Useful for endpoints that should work with both auth methods.
 */
export async function requireAuthOrApiKey(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer cxp_')) {
    return requireApiKey(req, res, next)
  }
  // Fall through to standard JWT auth
  const { requireAuth } = await import('./auth')
  return requireAuth(req, res, next)
}
