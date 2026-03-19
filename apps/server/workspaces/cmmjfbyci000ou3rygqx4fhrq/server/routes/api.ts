import { Router } from 'express'

const router = Router()

// ─── Health ───────────────────────────────────────────────────

router.get('/status', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── User authentication ─────────────────────────────────────────────────────

router.get('/user-authentication', async (_req, res) => {
  try {
    // TODO: Implement User authentication listing
    res.json({ items: [], total: 0 })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user authentication' })
  }
})

router.post('/user-authentication', async (req, res) => {
  try {
    // TODO: Implement User authentication creation
    res.status(201).json({ id: 'new-id', ...req.body, createdAt: new Date() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user authentication' })
  }
})

// ─── Create todo ─────────────────────────────────────────────────────

router.get('/create-todo', async (_req, res) => {
  try {
    // TODO: Implement Create todo listing
    res.json({ items: [], total: 0 })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch create todo' })
  }
})

router.post('/create-todo', async (req, res) => {
  try {
    // TODO: Implement Create todo creation
    res.status(201).json({ id: 'new-id', ...req.body, createdAt: new Date() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create create todo' })
  }
})

// ─── Read todo ─────────────────────────────────────────────────────

router.get('/read-todo', async (_req, res) => {
  try {
    // TODO: Implement Read todo listing
    res.json({ items: [], total: 0 })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch read todo' })
  }
})

router.post('/read-todo', async (req, res) => {
  try {
    // TODO: Implement Read todo creation
    res.status(201).json({ id: 'new-id', ...req.body, createdAt: new Date() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create read todo' })
  }
})

// ─── Update todo ─────────────────────────────────────────────────────

router.get('/update-todo', async (_req, res) => {
  try {
    // TODO: Implement Update todo listing
    res.json({ items: [], total: 0 })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch update todo' })
  }
})

router.post('/update-todo', async (req, res) => {
  try {
    // TODO: Implement Update todo creation
    res.status(201).json({ id: 'new-id', ...req.body, createdAt: new Date() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create update todo' })
  }
})

export { router as apiRouter }
