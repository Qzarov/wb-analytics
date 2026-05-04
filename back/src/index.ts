import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { auth } from './middleware/auth.js'
import { admin } from './middleware/admin.js'
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import settingsRoutes from './routes/settings.js'
import wbAnalyticsRoutes from './routes/wb-analytics.js'
import adminSettingsRoutes from './routes/admin-settings.js'
import serviceLogsRoutes from './routes/service-logs.js'
import paymentsRoutes from './routes/payments.js'
import { initWbSchema } from './db/wb.js'
import { initServiceLogsSchema } from './db/service-logs.js'
import { initWbCron } from './services/wb-cron.js'
import { sendAlert, sendRestart } from './services/alerter.js'

const app = express()

app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map(s => s.trim()),
}))
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/users', auth, admin, usersRoutes)
app.use('/api/settings', auth, settingsRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/wb', auth, wbAnalyticsRoutes)
app.use('/api/admin/settings', auth, admin, adminSettingsRoutes)
app.use('/api/admin/logs', auth, admin, serviceLogsRoutes)

// Catch unmatched API routes → alert + 404
app.use('/api', (req, res) => {
  const msg = `${req.method} ${req.originalUrl}`
  console.warn(`[global] API 404: ${msg}`)
  sendAlert('API 404', msg, { ip: req.ip || '' }).catch(() => {})
  res.status(404).json({ error: 'Not found' })
})

// Global Express error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[global] Unhandled route error:', err.message)
  sendAlert('Express', err.stack || err.message).catch(() => {})
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

process.on('uncaughtException', (err) => {
  console.error('[global] Uncaught exception:', err.message)
  sendAlert('Process', `Uncaught exception: ${err.stack || err.message}`).catch(() => {})
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason)
  console.error('[global] Unhandled rejection:', msg)
  sendAlert('Process', `Unhandled rejection: ${msg}`).catch(() => {})
})

async function bootstrap() {
  await Promise.all([
    initWbSchema(),
    initServiceLogsSchema(),
  ])

  initWbCron()

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`)
    sendRestart().catch(() => {})
  })
}

bootstrap().catch((err) => {
  console.error('[startup] failed:', err)
  process.exit(1)
})
