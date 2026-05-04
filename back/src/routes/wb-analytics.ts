import { Router } from 'express'
import {
  getWbConfig, upsertWbConfig,
  getWbProducts, updateWbProductCost, updateWbProduct, deleteWbProduct, addWbProductManual, bulkImportWbProducts,
  getWbAlerts, markWbAlertRead, markAllWbAlertsRead,
  getWbReviews, getWbReportById, getWbReports,
  getWbDashboard,
} from '../db.js'
import { syncProducts, collectData, collectReviews, analyzeReview, generateReport } from '../services/wb-collector.js'
import { sendAlert } from '../services/alerter.js'
import { insertServiceLog } from '../db/service-logs.js'

const router = Router()

// ===================== DASHBOARD =====================

router.get('/dashboard', async (req, res) => {
  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : undefined
  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : undefined
  console.log(`[wb-analytics] GET /dashboard user=${req.user!.id} dateFrom=${dateFrom || 'default'} dateTo=${dateTo || 'default'}`)
  const data = await getWbDashboard(req.user!.id, dateFrom, dateTo)
  res.json(data)
})

// ===================== CONFIG =====================

function maskKey(key: string): string {
  if (!key || key.length < 12) return ''
  return key.slice(0, 5) + '***' + key.slice(-5)
}

router.get('/config', async (req, res) => {
  console.log(`[wb-analytics] GET /config user=${req.user!.id}`)
  let config = await getWbConfig(req.user!.id)
  if (!config) {
    config = await upsertWbConfig(req.user!.id, {})
  }
  const { wb_api_key, tg_bot_token, openrouter_api_key, api_key, sync_webhook_url, ...safe } = config
  res.json({
    ...safe,
    wb_api_key_set: !!wb_api_key,
    wb_api_key_masked: maskKey(wb_api_key),
    tg_bot_token_set: !!tg_bot_token,
    tg_bot_token_masked: maskKey(tg_bot_token),
    openrouter_api_key_set: !!openrouter_api_key,
    openrouter_api_key_masked: maskKey(openrouter_api_key),
  })
})

const SCHEDULE_PAIRS = [
  ['schedule_sync_hour', 'schedule_sync_minute'],
  ['schedule_sales_hour', 'schedule_sales_minute'],
  ['schedule_stocks_hour', 'schedule_stocks_minute'],
  ['schedule_prices_hour', 'schedule_prices_minute'],
  ['schedule_reviews_hour', 'schedule_reviews_minute'],
  ['schedule_report_hour', 'schedule_report_minute'],
] as const

router.put('/config', async (req, res) => {
  console.log(`[wb-analytics] PUT /config user=${req.user!.id}`)

  const existing = await getWbConfig(req.user!.id)
  const merged = { ...existing, ...req.body }
  const times = SCHEDULE_PAIRS.map(([hk, mk]) => `${merged[hk] ?? 0}:${merged[mk] ?? 0}`)
  const unique = new Set(times)
  if (unique.size < times.length) {
    res.status(400).json({ error: 'Нельзя ставить одинаковое время для разных задач' })
    return
  }

  const config = await upsertWbConfig(req.user!.id, req.body)
  const { wb_api_key, tg_bot_token, openrouter_api_key, api_key, sync_webhook_url, ...safe } = config
  res.json({
    ...safe,
    wb_api_key_set: !!wb_api_key,
    wb_api_key_masked: maskKey(wb_api_key),
    tg_bot_token_set: !!tg_bot_token,
    tg_bot_token_masked: maskKey(tg_bot_token),
    openrouter_api_key_set: !!openrouter_api_key,
    openrouter_api_key_masked: maskKey(openrouter_api_key),
  })
})

router.post('/config/test', async (req, res) => {
  let wb_api_key = req.body.wb_api_key
  if (!wb_api_key) {
    const saved = await getWbConfig(req.user!.id)
    wb_api_key = saved?.wb_api_key
  }
  if (!wb_api_key) { res.status(400).json({ error: 'wb_api_key required' }); return }
  console.log(`[wb-analytics] POST /config/test user=${req.user!.id}`)
  try {
    const resp = await fetch('https://discounts-prices-api.wildberries.ru/api/v2/list/goods/size/nm?limit=1', {
      headers: { Authorization: wb_api_key },
    })
    if (resp.status === 401 || resp.status === 403) { res.json({ valid: false, error: 'Неверный API ключ' }); return }
    res.json({ valid: true })
  } catch (e: any) {
    res.json({ valid: false, error: e.message })
  }
})

// ===================== PRODUCTS =====================

router.get('/products', async (req, res) => {
  console.log(`[wb-analytics] GET /products user=${req.user!.id}`)
  res.json(await getWbProducts(req.user!.id))
})

router.put('/products/:nmId/cost', async (req, res) => {
  const nmId = Number(req.params.nmId)
  const { cost_price } = req.body
  if (cost_price === undefined) { res.status(400).json({ error: 'cost_price required' }); return }
  console.log(`[wb-analytics] PUT /products/${nmId}/cost user=${req.user!.id} cost=${cost_price}`)
  const product = await updateWbProductCost(req.user!.id, nmId, Number(cost_price))
  if (!product) { res.status(404).json({ error: 'Product not found' }); return }
  res.json(product)
})

router.put('/products/:nmId', async (req, res) => {
  const nmId = Number(req.params.nmId)
  const { cost_price, nm_id, title } = req.body
  console.log(`[wb-analytics] PUT /products/${nmId} user=${req.user!.id}`)
  try {
    const product = await updateWbProduct(req.user!.id, nmId, {
      cost_price: cost_price !== undefined ? Number(cost_price) : undefined,
      nm_id: nm_id !== undefined ? Number(nm_id) : undefined,
      title: title !== undefined ? String(title) : undefined,
    })
    if (!product) { res.status(404).json({ error: 'Product not found' }); return }
    res.json(product)
  } catch (e: any) { res.status(409).json({ error: e.message }) }
})

router.delete('/products/:nmId', async (req, res) => {
  const nmId = Number(req.params.nmId)
  console.log(`[wb-analytics] DELETE /products/${nmId} user=${req.user!.id}`)
  const deleted = await deleteWbProduct(req.user!.id, nmId)
  if (!deleted) { res.status(404).json({ error: 'Product not found' }); return }
  res.json({ ok: true })
})

router.post('/products', async (req, res) => {
  const { title, cost_price, nm_id } = req.body
  if (!title) { res.status(400).json({ error: 'title required' }); return }
  console.log(`[wb-analytics] POST /products user=${req.user!.id} title="${title}" cost=${cost_price} nm_id=${nm_id || 'auto'}`)
  try {
    const product = await addWbProductManual(req.user!.id, title, Number(cost_price) || 0, nm_id ? Number(nm_id) : undefined)
    res.json(product)
  } catch (e: any) { res.status(409).json({ error: e.message }) }
})

router.post('/products/import', async (req, res) => {
  const { items } = req.body
  if (!Array.isArray(items)) { res.status(400).json({ error: 'items array required' }); return }
  console.log(`[wb-analytics] POST /products/import user=${req.user!.id} count=${items.length}`)
  const count = await bulkImportWbProducts(req.user!.id, items)
  res.json({ imported: count })
})

// ===================== ALERTS =====================

router.get('/alerts', async (req, res) => {
  const filters: { is_read?: number; alert_type?: string } = {}
  if (req.query.is_read !== undefined) filters.is_read = Number(req.query.is_read)
  if (req.query.alert_type && typeof req.query.alert_type === 'string') filters.alert_type = req.query.alert_type
  console.log(`[wb-analytics] GET /alerts user=${req.user!.id}`)
  res.json(await getWbAlerts(req.user!.id, filters))
})

router.put('/alerts/:id/read', async (req, res) => {
  const id = Number(req.params.id)
  const ok = await markWbAlertRead(id, req.user!.id)
  if (!ok) { res.status(404).json({ error: 'Alert not found' }); return }
  res.json({ ok: true })
})

router.post('/alerts/read-all', async (req, res) => {
  const count = await markAllWbAlertsRead(req.user!.id)
  res.json({ marked: count })
})

// ===================== REVIEWS =====================

router.get('/reviews', async (req, res) => {
  const filters: { nm_id?: number; sentiment?: string; is_new?: number } = {}
  if (req.query.nm_id) filters.nm_id = Number(req.query.nm_id)
  if (req.query.sentiment && typeof req.query.sentiment === 'string') filters.sentiment = req.query.sentiment
  if (req.query.is_new !== undefined) filters.is_new = Number(req.query.is_new)
  console.log(`[wb-analytics] GET /reviews user=${req.user!.id}`)
  res.json(await getWbReviews(req.user!.id, filters))
})

// ===================== REPORTS =====================

router.get('/reports', async (req, res) => {
  const filters: { type?: string } = {}
  if (req.query.type && typeof req.query.type === 'string') filters.type = req.query.type
  console.log(`[wb-analytics] GET /reports user=${req.user!.id}`)
  res.json(await getWbReports(req.user!.id, filters))
})

router.get('/reports/:id', async (req, res) => {
  const id = Number(req.params.id)
  console.log(`[wb-analytics] GET /reports/${id} user=${req.user!.id}`)
  const report = await getWbReportById(id, req.user!.id)
  if (!report) { res.status(404).json({ error: 'Report not found' }); return }
  res.json(report)
})

// ===================== ACTIONS (triggers) =====================

router.post('/sync-products', async (req, res) => {
  console.log(`[wb-analytics] POST /sync-products user=${req.user!.id}`)
  const t0 = Date.now()
  try {
    const result = await syncProducts(req.user!.id)
    insertServiceLog('wb', req.user!.id, 'syncProducts', 'manual', 'success', `upserted: ${result.upserted}`, Date.now() - t0).catch(() => {})
    res.json(result)
  } catch (e: any) {
    insertServiceLog('wb', req.user!.id, 'syncProducts', 'manual', 'error', e.message, Date.now() - t0).catch(() => {})
    sendAlert('WB Аналитика', `syncProducts: ${e.message}`).catch(() => {}); res.status(502).json({ error: e.message })
  }
})

router.post('/collect', async (req, res) => {
  console.log(`[wb-analytics] POST /collect user=${req.user!.id}`)
  const t0 = Date.now()
  try {
    let data = { sales: 0, stocks: 0, prices: 0, errors: [] as string[] }

    try { data = await collectData(req.user!.id) }
    catch (e: any) { console.error(`[wb-analytics] collect data error: ${e.message}`); data.errors.push('Сбор данных: ' + e.message); sendAlert('WB Аналитика', `collect data: ${e.message}`).catch(() => {}) }

    const ms = Date.now() - t0
    const hasData = data.sales > 0 || data.stocks > 0 || data.prices > 0
    const status = !data.errors.length ? 'success' : hasData ? 'partial' : 'error'
    const parts: string[] = []
    if (hasData) parts.push(`sales:${data.sales} stocks:${data.stocks} prices:${data.prices}`)
    if (data.errors.length) parts.push(data.errors.join('; '))
    insertServiceLog('wb', req.user!.id, 'collectData', 'manual', status, parts.join(' | '), ms).catch(() => {})

    res.json({ sales: data.sales, stocks: data.stocks, prices: data.prices, errors: data.errors })
  } catch (e: any) {
    insertServiceLog('wb', req.user!.id, 'collectData', 'manual', 'error', e.message, Date.now() - t0).catch(() => {})
    sendAlert('WB Аналитика', `collect: ${e.message}`).catch(() => {}); res.status(502).json({ error: e.message })
  }
})

router.post('/collect-reviews', async (req, res) => {
  console.log(`[wb-analytics] POST /collect-reviews user=${req.user!.id}`)
  const t0 = Date.now()
  try {
    const result = await collectReviews(req.user!.id)
    insertServiceLog('wb', req.user!.id, 'collectReviews', 'manual', 'success', `upserted: ${result.upserted}`, Date.now() - t0).catch(() => {})
    res.json(result)
  } catch (e: any) {
    insertServiceLog('wb', req.user!.id, 'collectReviews', 'manual', 'error', e.message, Date.now() - t0).catch(() => {})
    sendAlert('WB Аналитика', `collect-reviews: ${e.message}`).catch(() => {}); res.status(502).json({ error: e.message })
  }
})

router.post('/analyze-review', async (req, res) => {
  const { review_id, product_title, rating, text } = req.body
  if (!review_id) { res.status(400).json({ error: 'review_id required' }); return }
  console.log(`[wb-analytics] POST /analyze-review user=${req.user!.id} review=${review_id}`)
  try {
    const result = await analyzeReview(req.user!.id, review_id, {
      product_title: product_title || '',
      rating: Number(rating) || 0,
      text: text || '',
    })
    res.json(result)
  } catch (e: any) { sendAlert('WB Аналитика', `analyze-review: ${e.message}`).catch(() => {}); res.status(502).json({ error: e.message }) }
})

router.post('/generate-report', async (req, res) => {
  const type = req.body.type || undefined
  console.log(`[wb-analytics] POST /generate-report user=${req.user!.id} type=${type || 'auto'}`)
  const t0 = Date.now()
  try {
    const result = await generateReport(req.user!.id, type, true)
    insertServiceLog('wb', req.user!.id, 'generateReport', 'manual', 'success', `type: ${type || 'auto'}`, Date.now() - t0).catch(() => {})
    res.json(result)
  } catch (e: any) {
    insertServiceLog('wb', req.user!.id, 'generateReport', 'manual', 'error', e.message, Date.now() - t0).catch(() => {})
    sendAlert('WB Аналитика', `generate-report: ${e.message}`).catch(() => {}); res.status(502).json({ error: e.message })
  }
})

export default router
