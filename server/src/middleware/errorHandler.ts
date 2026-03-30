import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.stack)
  res.status(500).json({
    error: config.isProd ? 'Internal server error' : err.message,
  })
}
