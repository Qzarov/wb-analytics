import { Router } from 'express'
import { getAllUsers, findUserById, updateUser, deleteUser, findPlanById, assignPlan, removePlan, addCredits, getAdminNotes, createAdminNote, deleteAdminNote } from '../db.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json(getAllUsers())
})

router.get('/:id', (req, res) => {
  const user = findUserById(Number(req.params.id))
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const { password, ...safe } = user
  res.json(safe)
})

router.put('/:id', (req, res) => {
  const { name, role, credits, advanced_settings, visible_products } = req.body
  const caller = req.user!
  const targetId = Number(req.params.id)

  const target = findUserById(targetId)
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  // Only superadmin can change roles to/from admin/superadmin
  if (role !== undefined && role !== target.role) {
    if (caller.role !== 'superadmin') {
      res.status(403).json({ error: 'Only superadmin can change roles' })
      return
    }
    // Cannot demote another superadmin
    if (target.role === 'superadmin' && caller.id !== target.id) {
      res.status(403).json({ error: 'Cannot change superadmin role' })
      return
    }
  }

  const user = updateUser(targetId, { name, role, credits, advanced_settings: advanced_settings !== undefined ? (advanced_settings ? 1 : 0) : undefined, visible_products })!
  const { password, ...safe } = user
  res.json(safe)
})

router.delete('/:id', (req, res) => {
  const target = findUserById(Number(req.params.id))
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  // Only superadmin can delete admins; nobody can delete superadmin
  if (target.role === 'superadmin') {
    res.status(403).json({ error: 'Cannot delete superadmin' })
    return
  }
  if (target.role === 'admin' && req.user!.role !== 'superadmin') {
    res.status(403).json({ error: 'Only superadmin can delete admins' })
    return
  }

  deleteUser(target.id)
  res.json({ deleted: true })
})

// Assign plan to user
router.post('/:id/plan', (req, res) => {
  const { plan_id } = req.body
  const target = findUserById(Number(req.params.id))
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const plan = findPlanById(Number(plan_id))
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' })
    return
  }
  const user = assignPlan(target.id, plan.id, plan.duration_days, plan.credits)!
  const { password, ...safe } = user
  res.json(safe)
})

// Remove plan from user
router.delete('/:id/plan', (req, res) => {
  const target = findUserById(Number(req.params.id))
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const user = removePlan(target.id)!
  const { password, ...safe } = user
  res.json(safe)
})

// Add/subtract credits
router.post('/:id/credits', (req, res) => {
  const { amount } = req.body
  if (typeof amount !== 'number') {
    res.status(400).json({ error: 'amount (number) required' })
    return
  }
  const target = findUserById(Number(req.params.id))
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const user = addCredits(target.id, amount)!
  const { password, ...safe } = user
  res.json(safe)
})

// Admin notes
router.get('/:id/notes', (req, res) => {
  const target = findUserById(Number(req.params.id))
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json(getAdminNotes(target.id))
})

router.post('/:id/notes', (req, res) => {
  const { text } = req.body
  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  const target = findUserById(Number(req.params.id))
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const note = createAdminNote(target.id, req.user!.id, text.trim())
  res.json(note)
})

router.delete('/:id/notes/:noteId', (req, res) => {
  const deleted = deleteAdminNote(Number(req.params.noteId))
  if (!deleted) {
    res.status(404).json({ error: 'Note not found' })
    return
  }
  res.json({ deleted: true })
})

export default router
