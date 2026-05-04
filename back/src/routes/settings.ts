import { Router } from 'express'
import { getSettings, saveSettings } from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  res.json(getSettings(req.user!.id))
})

router.put('/', (req, res) => {
  const data = req.body
  if (!data || typeof data !== 'object') { res.status(400).json({ error: 'Invalid body' }); return }
  res.json(saveSettings(req.user!.id, data))
})

export default router
