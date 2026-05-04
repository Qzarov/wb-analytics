import { Router } from 'express'
import { getAllPlans, createPlan, updatePlan, deletePlan } from '../db.js'
import { auth } from '../middleware/auth.js'
import { admin } from '../middleware/admin.js'

const router = Router()

router.get('/plans', (_req, res) => {
  res.json(getAllPlans())
})

router.get('/info', auth, admin, (_req, res) => {
  res.json({ providers: [], plans: getAllPlans() })
})

router.post('/plans', auth, admin, (req, res) => {
  const { name, description, credits, price, duration_days, sort_order } = req.body
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const plan = createPlan({
    name, description: description || '',
    credits: Number(credits) || 0, price: Number(price) || 0,
    duration_days: Number(duration_days) || 30, sort_order: Number(sort_order) || 0,
  })
  res.status(201).json(plan)
})

router.put('/plans/:id', auth, admin, (req, res) => {
  const { name, description, credits, price, duration_days, sort_order } = req.body
  const plan = updatePlan(Number(req.params.id), {
    name, description,
    credits: credits !== undefined ? Number(credits) : undefined,
    price: price !== undefined ? Number(price) : undefined,
    duration_days: duration_days !== undefined ? Number(duration_days) : undefined,
    sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
  })
  if (!plan) { res.status(404).json({ error: 'Plan not found' }); return }
  res.json(plan)
})

router.delete('/plans/:id', auth, admin, (req, res) => {
  const ok = deletePlan(Number(req.params.id))
  if (!ok) { res.status(404).json({ error: 'Plan not found' }); return }
  res.json({ deleted: true })
})

export default router
