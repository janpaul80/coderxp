import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    email: string
    name: string
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' })
      return
    }

    const token = authHeader.slice(7)
    const secret = process.env.JWT_SECRET ?? 'codedxp-dev-secret'

    const payload = jwt.verify(token, secret) as { userId: string; email: string }

    // Verify session exists
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true, name: true } } },
    })

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: 'Session expired or invalid' })
      return
    }

    req.userId = payload.userId
    req.user = session.user
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Lightweight JWT-only check (no DB) for socket auth
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const secret = process.env.JWT_SECRET ?? 'codedxp-dev-secret'
    return jwt.verify(token, secret) as { userId: string; email: string }
  } catch {
    return null
  }
}
