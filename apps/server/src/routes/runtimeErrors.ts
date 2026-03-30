/**
 * runtimeErrors.ts — Sprint 16
 *
 * API routes for runtime error collection and repair
 */

import { Router } from 'express'
import { handleRuntimeErrorReport, getProjectRuntimeErrors, getRuntimeError, updateRuntimeErrorStatus } from '../services/runtimeErrorCollector'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import { repairRuntimeError } from '../services/runtimeErrorRepair'

export const router: Router = Router()

// ─── Public Routes (Client Error Collection) ───────────────────

/**
 * POST /api/runtime-errors
 * Collect runtime errors from client applications
 * No authentication required - uses project ID for validation
 */
router.post('/', handleRuntimeErrorReport)

// ─── Protected Routes (Dashboard & Management) ────────────────

/**
 * GET /api/runtime-errors/project/:projectId
 * Get all runtime errors for a project
 */
router.get('/project/:projectId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params
    const userId = req.user!.id

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId }
    })

    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' })
    }

    const errors = await getProjectRuntimeErrors(projectId)
    res.json({ errors })
  } catch (err) {
    console.error('Error fetching runtime errors:', err)
    res.status(500).json({ error: 'Failed to fetch runtime errors' })
  }
})

/**
 * GET /api/runtime-errors/:errorId
 * Get details for a specific runtime error
 */
router.get('/:errorId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { errorId } = req.params
    const userId = req.user!.id

    const error = await getRuntimeError(errorId)
    
    if (!error) {
      return res.status(404).json({ error: 'Runtime error not found' })
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: error.projectId, userId }
    })

    if (!project) {
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({ error })
  } catch (err) {
    console.error('Error fetching runtime error details:', err)
    res.status(500).json({ error: 'Failed to fetch error details' })
  }
})

/**
 * PATCH /api/runtime-errors/:errorId/status
 * Update the status of a runtime error
 */
router.patch('/:errorId/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { errorId } = req.params
    const { status } = req.body
    const userId = req.user!.id

    if (!['new', 'analyzing', 'repairing', 'resolved', 'ignored'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }

    const error = await getRuntimeError(errorId)
    
    if (!error) {
      return res.status(404).json({ error: 'Runtime error not found' })
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: error.projectId, userId }
    })

    if (!project) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const updatedError = await updateRuntimeErrorStatus(errorId, status)
    res.json({ error: updatedError })
  } catch (err) {
    console.error('Error updating runtime error status:', err)
    res.status(500).json({ error: 'Failed to update error status' })
  }
})

/**
 * POST /api/runtime-errors/:errorId/repair
 * Trigger repair for a runtime error
 */
router.post('/:errorId/repair', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { errorId } = req.params
    const userId = req.user!.id

    const error = await getRuntimeError(errorId)
    
    if (!error) {
      return res.status(404).json({ error: 'Runtime error not found' })
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: error.projectId, userId }
    })

    if (!project) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Start repair process
    const repairJob = await repairRuntimeError(error)
    
    res.json({ 
      message: 'Repair job started',
      jobId: repairJob.id
    })
  } catch (err) {
    console.error('Error starting runtime error repair:', err)
    res.status(500).json({ error: 'Failed to start repair job' })
  }
})

export default router
