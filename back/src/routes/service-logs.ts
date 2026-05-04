import { Router } from 'express'
import { getServiceLogs, getServiceLogServices, getServiceLogTasks, deleteOldServiceLogs } from '../db/service-logs.js'
import { getAdminSetting, setAdminSetting } from '../db/core.js'

const router = Router()

const RETENTION_KEY = 'service_log_retention_days'
const RETENTION_OPTIONS: Record<string, number> = { '1': 1, '7': 7, '30': 30 }

router.get('/', async (req, res) => {
  const filters = {
    service: typeof req.query.service === 'string' ? req.query.service : undefined,
    user_id: req.query.user_id ? Number(req.query.user_id) : undefined,
    task: typeof req.query.task === 'string' ? req.query.task : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    source: typeof req.query.source === 'string' ? req.query.source : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 100,
    offset: req.query.offset ? Number(req.query.offset) : 0,
  }
  const data = await getServiceLogs(filters)
  res.json(data)
})

router.get('/filters', async (req, res) => {
  const service = typeof req.query.service === 'string' ? req.query.service : undefined
  const [services, tasks] = await Promise.all([
    getServiceLogServices(),
    getServiceLogTasks(service),
  ])
  res.json({ services, tasks })
})

router.get('/retention', (_req, res) => {
  const days = getAdminSetting(RETENTION_KEY) || '30'
  res.json({ days: Number(days) })
})

router.put('/retention', (req, res) => {
  const days = String(req.body.days)
  if (!RETENTION_OPTIONS[days]) {
    res.status(400).json({ error: 'Допустимые значения: 1, 7, 30' })
    return
  }
  setAdminSetting(RETENTION_KEY, days)
  console.log(`[service-logs] Retention set to ${days} days by user=${req.user!.id}`)
  res.json({ days: Number(days) })
})

router.post('/cleanup', async (req, res) => {
  const days = Number(getAdminSetting(RETENTION_KEY) || '30')
  const deleted = await deleteOldServiceLogs(days)
  console.log(`[service-logs] Manual cleanup: deleted ${deleted} logs older than ${days} days`)
  res.json({ deleted, days })
})

export default router
