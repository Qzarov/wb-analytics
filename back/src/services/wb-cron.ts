import * as cron from 'node-cron'
import {
  getEnabledWbConfigs, syncProducts,
  collectSales, collectStocks, collectPrices,
  collectReviews, generateReport,
} from './wb-collector.js'
import { sendAlert } from './alerter.js'
import type { WbConfigRow } from '../db/wb.js'
import { insertServiceLog, deleteOldServiceLogs } from '../db/service-logs.js'
import { getAdminSetting } from '../db/core.js'

const LOG = '[wb-cron]'
const ts = () => new Date().toISOString().slice(11, 19)

type TaskDef = {
  name: string
  hourField: keyof WbConfigRow
  minuteField: keyof WbConfigRow
  enabledField?: keyof WbConfigRow
  dayField?: keyof WbConfigRow
  fn: (userId: number) => Promise<unknown>
}

const tasks: TaskDef[] = [
  { name: 'syncProducts', hourField: 'schedule_sync_hour', minuteField: 'schedule_sync_minute', enabledField: 'schedule_sync_enabled', fn: syncProducts },
  { name: 'collectSales', hourField: 'schedule_sales_hour', minuteField: 'schedule_sales_minute', enabledField: 'schedule_sales_enabled', fn: collectSales },
  { name: 'collectStocks', hourField: 'schedule_stocks_hour', minuteField: 'schedule_stocks_minute', enabledField: 'schedule_stocks_enabled', fn: collectStocks },
  { name: 'collectPrices', hourField: 'schedule_prices_hour', minuteField: 'schedule_prices_minute', enabledField: 'schedule_prices_enabled', fn: collectPrices },
  { name: 'collectReviews', hourField: 'schedule_reviews_hour', minuteField: 'schedule_reviews_minute', enabledField: 'schedule_reviews_enabled', fn: collectReviews },
  { name: 'generateDailyReport', hourField: 'schedule_report_hour', minuteField: 'schedule_report_minute', enabledField: 'daily_report_enabled', fn: (uid) => generateReport(uid, 'daily') },
  { name: 'generateWeeklyReport', hourField: 'schedule_report_weekly_hour', minuteField: 'schedule_report_weekly_minute', enabledField: 'weekly_report_enabled', dayField: 'report_weekly_day', fn: (uid) => generateReport(uid, 'weekly') },
]

async function tick(): Promise<void> {
  const now = new Date()
  const h = now.getUTCHours()
  const m = now.getUTCMinutes()

  let configs: WbConfigRow[]
  try {
    configs = await getEnabledWbConfigs()
  } catch (err: any) {
    console.error(`${LOG} [${ts()}] failed to load configs: ${err.message}`)
    return
  }
  if (!configs.length) return

  for (const cfg of configs) {
    for (const task of tasks) {
      if (task.enabledField && !cfg[task.enabledField]) continue
      if (task.dayField && cfg[task.dayField] !== now.getUTCDay()) continue
      if (cfg[task.hourField] === h && cfg[task.minuteField] === m) {
        console.log(`${LOG} ${task.name} user=${cfg.user_id} (scheduled ${h}:${String(m).padStart(2, '0')} UTC)`)
        const t0 = Date.now()
        try {
          await task.fn(cfg.user_id)
          insertServiceLog('wb', cfg.user_id, task.name, 'cron', 'success', '', Date.now() - t0).catch(() => {})
        } catch (err: any) {
          const ms = Date.now() - t0
          console.error(`${LOG} [${ts()}] ${task.name} user=${cfg.user_id} error: ${err.message}`)
          insertServiceLog('wb', cfg.user_id, task.name, 'cron', 'error', err.message, ms).catch(() => {})
          sendAlert('WB Аналитика', `${task.name} user=${cfg.user_id}: ${err.message}`).catch(() => {})
        }
      }
    }
  }
}

async function cleanup(): Promise<void> {
  const days = Number(getAdminSetting('service_log_retention_days') || '30')
  try {
    const deleted = await deleteOldServiceLogs(days)
    if (deleted > 0) console.log(`${LOG} cleanup: deleted ${deleted} logs older than ${days}d`)
  } catch (err: any) {
    console.error(`${LOG} cleanup error: ${err.message}`)
  }
}

export function initWbCron(): void {
  cron.schedule('* * * * *', () => { tick() })
  cron.schedule('0 3 * * *', () => { cleanup() })
  console.log(`${LOG} scheduled: per-minute task check, daily 03:00 UTC log cleanup`)
}
