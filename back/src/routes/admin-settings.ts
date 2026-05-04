import { Router } from 'express'
import { getAllAdminSettings, setAdminSetting } from '../db/core.js'
import { sendTestAlert } from '../services/alerter.js'

const router = Router()

const ALLOWED_KEYS = ['alert_bot_token', 'alert_chat_id', 'alert_enabled']

router.get('/', (_req, res) => {
  const all = getAllAdminSettings()
  const filtered: Record<string, string> = {}
  for (const key of ALLOWED_KEYS) {
    filtered[key] = all[key] ?? ''
  }
  if (filtered.alert_bot_token) {
    filtered.alert_bot_token = '***'
  }
  res.json(filtered)
})

router.put('/', (req, res) => {
  const data = req.body
  if (!data || typeof data !== 'object') { res.status(400).json({ error: 'Invalid body' }); return }

  for (const [key, value] of Object.entries(data)) {
    if (!ALLOWED_KEYS.includes(key)) continue
    if (key === 'alert_bot_token' && value === '***') continue
    setAdminSetting(key, String(value))
  }

  console.log('[admin-settings] Alert settings updated')
  res.json({ ok: true })
})

router.post('/test-alert', async (_req, res) => {
  const ok = await sendTestAlert()
  if (!ok) { res.status(400).json({ error: 'Failed to send test alert. Check bot token and chat ID.' }); return }
  res.json({ ok: true })
})

export default router
