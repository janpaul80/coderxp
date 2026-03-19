import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'

// ─── Register ─────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required' })
      return
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' })
      return
    }
    const hashedPassword = await bcrypt.hash(password, 12)
    // TODO: Save user to database
    const user = { id: 'user-id', name, email, createdAt: new Date() }
    const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ user, token })
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' })
  }
})

// ─── Login ────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }
    // TODO: Look up user in database and verify password
    res.status(401).json({ error: 'Invalid email or password' })
  } catch (err) {
    res.status(500).json({ error: 'Login failed' })
  }
})

// ─── Me ───────────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.slice(7)
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return }
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string }
    // TODO: Fetch user from database
    res.json({ user: { id: payload.userId, email: payload.email } })
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})

export { router as authRouter }
