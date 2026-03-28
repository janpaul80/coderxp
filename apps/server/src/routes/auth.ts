import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'

// ─── Supabase admin client (server-side, service role) ────────
// Used only to verify Supabase access tokens via getUser().
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const router: Router = Router()

// ─── Rate limiter: 10 requests per minute per IP (register + login) ──

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again in a minute' },
})

const JWT_SECRET = process.env.JWT_SECRET ?? 'codedxp-dev-secret'
const JWT_EXPIRES_IN = '7d'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_SESSION_TOKEN_RETRIES = 5

// ─── Schemas ──────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ─── Register ─────────────────────────────────────────────────

router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = registerSchema.parse(req.body)

    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const hashedPassword = await bcrypt.hash(body.password, 12)

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
      },
      select: { id: true, name: true, email: true, createdAt: true },
    })

    const token = jwt.sign({ userId: user.id, email: user.email, jti: crypto.randomUUID() }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    })

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    })

    res.status(201).json({ user, token })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    console.error('[Auth] Register error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

// ─── Login ────────────────────────────────────────────────────

async function createSessionWithRetry(userId: string, baseToken: string): Promise<string> {
  let token = baseToken

  for (let attempt = 0; attempt < MAX_SESSION_TOKEN_RETRIES; attempt++) {
    try {
      await prisma.session.create({
        data: {
          userId,
          token,
          expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
        },
      })
      return token
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
      token = `${baseToken}.${crypto.randomUUID()}`
    }
  }

  throw new Error('Failed to create unique session token after retries')
}

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const valid = await bcrypt.compare(body.password, user.password)
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const baseToken = jwt.sign({ userId: user.id, email: user.email, jti: crypto.randomUUID() }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    })

    const token = await createSessionWithRetry(user.id, baseToken)

    res.json({
      user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
      token,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors })
      return
    }
    console.error('[Auth] Login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// ─── Me ───────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({ user })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

// ─── Logout ───────────────────────────────────────────────────

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.slice(7)
    if (token) {
      await prisma.session.deleteMany({ where: { token } })
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' })
  }
})

// ─── POST /supabase — Supabase token exchange ─────────────────
// Frontend sends a Supabase access token; we verify it, upsert
// the user in our DB, create a backend Session, and return our JWT.

router.post('/supabase', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Supabase access token' })
      return
    }
    const supabaseToken = authHeader.slice(7)

    // Verify token with Supabase admin client
    const { data: { user: supabaseUser }, error } = await supabaseAdmin.auth.getUser(supabaseToken)
    if (error || !supabaseUser) {
      res.status(401).json({ error: 'Invalid or expired Supabase token' })
      return
    }

    const email = supabaseUser.email
    if (!email) {
      res.status(400).json({ error: 'Supabase user has no email address' })
      return
    }

    // Derive display name from Supabase user metadata
    const rawName =
      (supabaseUser.user_metadata?.full_name as string | undefined) ??
      (supabaseUser.user_metadata?.name as string | undefined) ??
      email.split('@')[0]

    // Upsert user — create if new, update name if changed
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: rawName,
        // No password — Supabase-authed users don't use local passwords
        password: '',
      },
      update: {
        // Only update name if it was blank (don't overwrite user-set names)
        name: rawName,
      },
      select: { id: true, name: true, email: true, createdAt: true },
    })

    // Issue backend JWT
    const baseToken = jwt.sign(
      { userId: user.id, email: user.email, jti: crypto.randomUUID() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    const token = await createSessionWithRetry(user.id, baseToken)

    res.json({ user, token })
  } catch (err) {
    console.error('[Auth] Supabase exchange error:', err)
    res.status(500).json({ error: 'Token exchange failed' })
  }
})

export { router as authRouter }
