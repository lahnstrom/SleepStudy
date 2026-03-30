import { Router } from 'express'
import path from 'node:path'
import { requireAuth } from '../middleware/auth.js'
import { config } from '../config.js'

const router = Router()

router.get('/{*filepath}', requireAuth, (req, res) => {
  const filePath = String(req.params.filepath)
  if (!filePath || filePath.includes('..')) {
    res.status(400).json({ error: 'Invalid image path' })
    return
  }

  const fullPath = path.join(config.imageDir, filePath)
  res.sendFile(fullPath, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  }, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'Image not found' })
    }
  })
})

export default router
