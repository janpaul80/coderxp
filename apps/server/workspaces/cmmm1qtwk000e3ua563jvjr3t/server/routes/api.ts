import { Router } from 'express'

const router = Router()

// ─── Health ───────────────────────────────────────────────────

router.get('/status', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
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

// ─── Delete todo ─────────────────────────────────────────────────────

router.get('/delete-todo', async (_req, res) => {
  try {
    // TODO: Implement Delete todo listing
    res.json({ items: [], total: 0 })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch delete todo' })
  }
})

router.post('/delete-todo', async (req, res) => {
  try {
    // TODO: Implement Delete todo creation
    res.status(201).json({ id: 'new-id', ...req.body, createdAt: new Date() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create delete todo' })
  }
})

// ─── Mark complete ─────────────────────────────────────────────────────

router.get('/mark-complete', async (_req, res) => {
  try {
    // TODO: Implement Mark complete listing
    res.json({ items: [], total: 0 })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch mark complete' })
  }
})

router.post('/mark-complete', async (req, res) => {
  try {
    // TODO: Implement Mark complete creation
    res.status(201).json({ id: 'new-id', ...req.body, createdAt: new Date() })
  } catch (err) {
    res.status(500).json({ error: 'Failed to create mark complete' })
  }
})

export { router as apiRouter }
