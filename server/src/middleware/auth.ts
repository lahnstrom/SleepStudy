import type { Request, Response, NextFunction } from 'express'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  if (req.session.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}

export function requireLabAccess(paramName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (req.session.role === 'admin') {
      next()
      return
    }
    const paramValue = req.params[paramName]
    const requestedLabId = parseInt(Array.isArray(paramValue) ? paramValue[0] : paramValue, 10)
    if (req.session.labId !== requestedLabId) {
      res.status(403).json({ error: 'Access denied to this lab' })
      return
    }
    next()
  }
}
