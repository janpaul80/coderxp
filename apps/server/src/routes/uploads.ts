// @ts-nocheck — Prisma client requires `prisma generate` before type-checking
import { Router, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import rateLimit from 'express-rate-limit'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'

export const router: Router = Router()

// ─── Rate limiter: 20 uploads per hour per user ───────────────

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req: any) => req.userId ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false }, // suppress ERR_ERL_KEY_GEN_IPV6 on IPv6 loopback
  message: { error: 'Upload limit reached (20 per hour). Please try again later.' },
})

// ─── Multer config ────────────────────────────────────────────

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')

// Ensure upload directory exists at startup
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
} catch {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
  'application/json',
  'text/javascript', 'text/typescript',
  'text/html', 'text/css',
  'audio/webm', 'audio/mp4', 'audio/mpeg',
]

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`))
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
})

// ─── Determine file type ──────────────────────────────────────

function getFileType(mimeType: string): 'image' | 'pdf' | 'text' | 'code' | 'audio' | 'other' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (['text/javascript', 'text/typescript', 'text/html', 'text/css', 'application/json'].includes(mimeType)) return 'code'
  if (mimeType.startsWith('text/')) return 'text'
  return 'other'
}

// ─── Single file upload ───────────────────────────────────────

router.post('/', requireAuth, uploadLimiter, (req, res, next) => {
  upload.single('file')(req as any, res as any, (err: any) => {
    if (!err) return next()

    // Multer size error → 400
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20MB)' : err.message
      return res.status(400).json({ error: message })
    }

    // fileFilter rejection → 415 Unsupported Media Type
    const message = err instanceof Error ? err.message : 'Upload validation failed'
    return res.status(415).json({ error: message })
  })
}, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) {
      res.status(400).json({ error: 'No file provided' })
      return
    }

    const { projectId } = req.body as { projectId?: string }

    const fileRecord = await prisma.file.create({
      data: {
        name: file.originalname,
        type: getFileType(file.mimetype),
        mimeType: file.mimetype,
        size: file.size,
        path: file.path,
        url: `/uploads/${file.filename}`,
        projectId: projectId ?? null,
      },
    })

    res.status(201).json({
      id: fileRecord.id,
      name: fileRecord.name,
      type: fileRecord.type,
      mimeType: fileRecord.mimeType,
      size: fileRecord.size,
      url: fileRecord.url,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    res.status(500).json({ error: message })
  }
})

// ─── Multiple files ───────────────────────────────────────────

router.post('/multiple', requireAuth, uploadLimiter, (req, res, next) => {
  upload.array('files', 10)(req as any, res as any, (err: any) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 20MB)' : err.message
      return res.status(400).json({ error: message })
    }
    const message = err instanceof Error ? err.message : 'Upload validation failed'
    return res.status(415).json({ error: message })
  })
}, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const files = (req as any).files as Express.Multer.File[]
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' })
      return
    }

    const { projectId } = req.body as { projectId?: string }

    const records = await Promise.all(
      files.map((file) =>
        prisma.file.create({
          data: {
            name: file.originalname,
            type: getFileType(file.mimetype),
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            url: `/uploads/${file.filename}`,
            projectId: projectId ?? null,
          },
        })
      )
    )

    res.status(201).json(records.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      mimeType: f.mimeType,
      size: f.size,
      url: f.url,
    })))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    res.status(500).json({ error: message })
  }
})

export { router as uploadsRouter }
