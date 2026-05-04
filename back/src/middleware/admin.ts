import type { Request, Response, NextFunction } from 'express'

export function admin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role
  if (role !== 'admin' && role !== 'superadmin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}

export function superadmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json({ error: 'Superadmin access required' })
    return
  }
  next()
}
