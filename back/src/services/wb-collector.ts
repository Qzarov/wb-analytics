import {
  getWbConfig, getWbProducts, upsertWbProduct, upsertWbSnapshotSales, upsertWbSnapshotStocks,
  upsertWbSnapshotPrices, upsertWbReviews, getNewNegativeReviews, updateWbReviewAnalysis,
  getWbReportData, updateWbReport, failWbReport, type WbConfigRow,
} from '../db/wb.js'
import { sendAlert } from './alerter.js'
import { insertServiceLog } from '../db/service-logs.js'

const LOG = '[wb-collector]'
const ts = () => new Date().toISOString().slice(11, 19)
const collectingUsers = new Set<number>()

// ===================== WB API FETCH =====================

function shortUrl(url: string): string {
  try { return new URL(url).pathname } catch { return url }
}

function safeParseJson(text: string, url: string): any {
  if (!text || !text.trim()) throw new Error(`WB API вернул пустой ответ: ${shortUrl(url)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`WB API вернул невалидный JSON (${text.length} байт): ${shortUrl(url)}`)
  }
}

const WB_RETRY_ATTEMPTS = 2
const WB_RETRY_DELAY = 3000

async function wbGet(url: string, apiKey: string, userId?: number): Promise<any> {
  const path = shortUrl(url)
  for (let attempt = 0; attempt <= WB_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      console.log(`${LOG} GET retry ${attempt}/${WB_RETRY_ATTEMPTS} ${path}`)
      await new Promise(r => setTimeout(r, WB_RETRY_DELAY))
    }
    const start = Date.now()
    const res = await fetch(url, { headers: { Authorization: apiKey } })
    const ms = Date.now() - start
    if (!res.ok) {
      console.error(`${LOG} GET ${res.status} ${ms}ms ${url}`)
      if (userId) insertServiceLog('wb', userId, `GET ${path}`, 'http', 'error', `${res.status} ${res.statusText}`, ms).catch(() => {})
      throw new Error(`WB API ${res.status} ${res.statusText}: ${url}`)
    }
    try {
      const text = await res.text()
      const data = safeParseJson(text, url)
      console.log(`${LOG} GET ${res.status} ${ms}ms ${url}`)
      if (userId) insertServiceLog('wb', userId, `GET ${path}`, 'http', 'success', `${res.status}`, ms).catch(() => {})
      return data
    } catch (e) {
      if (attempt < WB_RETRY_ATTEMPTS) {
        console.warn(`${LOG} GET ${ms}ms empty/invalid body, will retry — ${path}`)
        continue
      }
      if (userId) insertServiceLog('wb', userId, `GET ${path}`, 'http', 'error', `empty body`, ms).catch(() => {})
      throw e
    }
  }
}

async function wbPost(url: string, apiKey: string, body: unknown, userId?: number): Promise<any> {
  const path = shortUrl(url)
  for (let attempt = 0; attempt <= WB_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      console.log(`${LOG} POST retry ${attempt}/${WB_RETRY_ATTEMPTS} ${path}`)
      await new Promise(r => setTimeout(r, WB_RETRY_DELAY))
    }
    const start = Date.now()
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const ms = Date.now() - start
    if (!res.ok) {
      console.error(`${LOG} POST ${res.status} ${ms}ms ${url}`)
      if (userId) insertServiceLog('wb', userId, `POST ${path}`, 'http', 'error', `${res.status} ${res.statusText}`, ms).catch(() => {})
      throw new Error(`WB API ${res.status} ${res.statusText}: ${url}`)
    }
    try {
      const text = await res.text()
      const data = safeParseJson(text, url)
      console.log(`${LOG} POST ${res.status} ${ms}ms ${url}`)
      if (userId) insertServiceLog('wb', userId, `POST ${path}`, 'http', 'success', `${res.status}`, ms).catch(() => {})
      return data
    } catch (e) {
      if (attempt < WB_RETRY_ATTEMPTS) {
        console.warn(`${LOG} POST ${ms}ms empty/invalid body, will retry — ${path}`)
        continue
      }
      if (userId) insertServiceLog('wb', userId, `POST ${path}`, 'http', 'error', `empty body`, ms).catch(() => {})
      throw e
    }
  }
}

// ===================== SYNC PRODUCTS =====================

export async function syncProducts(userId: number): Promise<{ upserted: number }> {
  const config = await getWbConfig(userId)
  if (!config?.wb_api_key) throw new Error('WB API key not configured')

  console.log(`${LOG} syncProducts user=${userId}`)
  let upserted = 0
  let cursor: Record<string, unknown> = { limit: 100 }

  while (true) {
    const data = await wbPost(
      'https://content-api.wildberries.ru/content/v2/get/cards/list',
      config.wb_api_key,
      { settings: { cursor, filter: { withPhoto: -1 } } },
      userId,
    )

    const cards: any[] = data.cards || []
    for (const c of cards) {
      if (!c.nmID) continue
      await upsertWbProduct(userId, {
        nm_id: c.nmID,
        imt_id: c.imtID || undefined,
        subject: c.subjectName || '',
        brand: c.brand || '',
        title: c.title || '',
        article: c.vendorCode || '',
        barcode: c.sizes?.[0]?.skus?.[0] || '',
        category: c.subjectName || '',
        image_url: c.photos?.[0]?.big || c.photos?.[0]?.tm || '',
      })
      upserted++
    }

    const next = data.cursor
    if (!next || next.total === 0 || cards.length === 0) break
    cursor = { limit: 100, updatedAt: next.updatedAt, nmID: next.nmID }
  }

  console.log(`${LOG} syncProducts user=${userId} upserted=${upserted}`)
  return { upserted }
}

// ===================== COLLECT DATA (sales + stocks + prices) =====================

export async function collectData(userId: number): Promise<{ sales: number; stocks: number; prices: number; errors: string[] }> {
  if (collectingUsers.has(userId)) throw new Error('Сбор данных уже выполняется, подождите завершения')
  collectingUsers.add(userId)

  try {
    const config = await getWbConfig(userId)
    if (!config?.wb_api_key) throw new Error('WB API key not configured')

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateFrom = yesterday.toISOString().slice(0, 10)
    const dateTo = new Date().toISOString().slice(0, 10)

    console.log(`${LOG} collectData user=${userId} period=${dateFrom}..${dateTo}`)

    const existingProducts = await getWbProducts(userId)
    if (existingProducts.length === 0) {
      console.log(`${LOG} collectData user=${userId} no products found, running syncProducts first`)
      try { await syncProducts(userId) }
      catch (e) { console.error(`${LOG} auto-syncProducts failed: ${e}`) }
    }

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

    let salesCount = 0, stocksCount = 0, pricesCount = 0
    const errors: string[] = []

    try { salesCount = await fetchSales(config, dateFrom, dateTo) }
    catch (e) { errors.push(formatWbError('Продажи', e)) }

    await delay(5000)

    try { stocksCount = await fetchStocks(config, dateFrom) }
    catch (e) { errors.push(formatWbError('Остатки', e)) }

    await delay(5000)

    try { pricesCount = await fetchPrices(config, dateFrom) }
    catch (e) { errors.push(formatWbError('Цены', e)) }

    if (errors.length) {
      console.error(`${LOG} [${ts()}] collectData user=${userId} errors: ${errors.join('; ')}`)
      sendAlert('WB Аналитика', `collectData user=${userId}: ${errors.join('; ')}`).catch(() => {})
    }

    console.log(`${LOG} collectData user=${userId} sales=${salesCount} stocks=${stocksCount} prices=${pricesCount} errors=${errors.length}`)
    return { sales: salesCount, stocks: stocksCount, prices: pricesCount, errors }
  } finally {
    collectingUsers.delete(userId)
  }
}

function formatWbError(source: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('429')) return `${source}: WB API перегружен, попробуйте позже`
  if (msg.includes('401') || msg.includes('403')) return `${source}: неверный или просроченный API ключ`
  if (msg.includes('500')) return `${source}: ошибка на стороне WB`
  return `${source}: ${msg}`
}

async function fetchSales(config: WbConfigRow, dateFrom: string, dateTo: string): Promise<number> {
  const data = await wbGet(
    `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    config.wb_api_key,
    config.user_id,
  )
  const records: any[] = Array.isArray(data) ? data : []
  const byNm: Record<number, { nm_id: number; revenue: number; orders_count: number; sales_count: number; returns_count: number }> = {}

  for (const r of records) {
    const nm = r.nm_id
    if (!nm) continue
    if (!byNm[nm]) byNm[nm] = { nm_id: nm, revenue: 0, orders_count: 0, sales_count: 0, returns_count: 0 }
    byNm[nm].revenue += r.ppvz_for_pay || 0
    if (r.doc_type_name === 'Продажа') byNm[nm].orders_count++
    const qty = r.quantity || 0
    if (qty > 0) byNm[nm].sales_count += qty
    if (qty < 0) byNm[nm].returns_count += Math.abs(qty)
  }

  const snapshots = Object.values(byNm)
  return await upsertWbSnapshotSales(config.user_id, dateFrom, snapshots)
}

async function fetchStocks(config: WbConfigRow, dateFrom: string): Promise<number> {
  const data = await wbGet(
    `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=${dateFrom}`,
    config.wb_api_key,
    config.user_id,
  )
  const records: any[] = Array.isArray(data) ? data : []
  const byNm: Record<number, { nm_id: number; stock_qty: number }> = {}

  for (const r of records) {
    const nm = r.nmId
    if (!nm) continue
    if (!byNm[nm]) byNm[nm] = { nm_id: nm, stock_qty: 0 }
    byNm[nm].stock_qty += r.quantity || 0
  }

  return await upsertWbSnapshotStocks(config.user_id, dateFrom, Object.values(byNm))
}

async function fetchPrices(config: WbConfigRow, date: string): Promise<number> {
  const data = await wbGet(
    'https://discounts-prices-api.wildberries.ru/api/v2/list/goods/filter?limit=1000&offset=0',
    config.wb_api_key,
    config.user_id,
  )
  const listGoods: any[] = data.data?.listGoods || []
  if (listGoods.length) {
    const sample = listGoods[0]
    console.log(`${LOG} fetchPrices raw sample: nmID=${sample.nmID} sizes[0]=${JSON.stringify(sample.sizes?.[0])}`)
  }
  const prices: { nm_id: number; price: number; discount_pct: number; final_price: number }[] = []

  for (const g of listGoods) {
    if (!g.nmID || !g.sizes?.length) continue
    const s = g.sizes[0]
    prices.push({
      nm_id: g.nmID,
      price: s.price || 0,
      discount_pct: s.discount || 0,
      final_price: s.discountedPrice || 0,
    })
  }

  return await upsertWbSnapshotPrices(config.user_id, date, prices)
}

// ===================== COLLECT REVIEWS =====================

export async function collectReviews(userId: number, dateFrom?: string, dateTo?: string): Promise<{ upserted: number; new_negatives: number }> {
  const config = await getWbConfig(userId)
  if (!config?.wb_api_key) throw new Error('WB API key not configured')

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dFrom = dateFrom || yesterday.toISOString().slice(0, 10)
  const dTo = dateTo || new Date().toISOString().slice(0, 10)

  const tsFrom = Math.floor(new Date(dFrom + 'T00:00:00Z').getTime() / 1000)
  const tsTo = Math.floor(new Date(dTo + 'T23:59:59Z').getTime() / 1000)

  console.log(`${LOG} collectReviews user=${userId} period=${dFrom}..${dTo} ts=${tsFrom}..${tsTo}`)
  const data = await wbGet(
    `https://feedbacks-api.wildberries.ru/api/v1/feedbacks?isAnswered=false&take=200&skip=0&order=dateDesc&dateFrom=${tsFrom}&dateTo=${tsTo}`,
    config.wb_api_key,
    userId,
  )
  const allFeedbacks: any[] = data.data?.feedbacks || []
  console.log(`${LOG} collectReviews user=${userId} got=${allFeedbacks.length}`)

  const reviews = allFeedbacks.map((f: any) => ({
    review_id: String(f.id),
    nm_id: f.productDetails?.nmId || 0,
    rating: f.productValuation || 5,
    text: f.text || '',
    author: f.userName || '',
    review_date: f.createdDate || '',
  }))

  const upserted = await upsertWbReviews(userId, reviews)
  const negatives = await getNewNegativeReviews(userId)
  console.log(`${LOG} collectReviews user=${userId} total=${allFeedbacks.length} upserted=${upserted} new_negatives=${negatives.length}`)
  return { upserted, new_negatives: negatives.length }
}

// ===================== ANALYZE REVIEW (LLM) =====================

export async function analyzeReview(userId: number, reviewId: string, reviewData: { product_title: string; rating: number; text: string }): Promise<{ sentiment: string; suggested_response: string }> {
  const config = await getWbConfig(userId)
  if (!config?.openrouter_api_key) throw new Error('OpenRouter API key not configured')

  const prompt = `Ты — менеджер маркетплейса Wildberries. Проанализируй отзыв покупателя.

Товар: ${reviewData.product_title}
Рейтинг: ${reviewData.rating}/5
Текст отзыва: ${reviewData.text}

Ответь СТРОГО в формате JSON (без markdown):
{
  "sentiment": "positive" или "neutral" или "negative",
  "key_issues": ["проблема 1", "проблема 2"],
  "suggested_response": "Вежливый ответ продавца на отзыв, 2-3 предложения"
}`

  console.log(`${LOG} analyzeReview user=${userId} review=${reviewId}`)
  const llmResult = await callOpenRouter(config.openrouter_api_key, prompt)

  let sentiment = 'neutral'
  let suggested_response = ''
  try {
    const match = llmResult.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(match ? match[0] : llmResult)
    sentiment = parsed.sentiment || 'neutral'
    suggested_response = parsed.suggested_response || ''
  } catch {
    console.error(`${LOG} [${ts()}] analyzeReview user=${userId} review=${reviewId} failed to parse LLM response`)
  }

  await updateWbReviewAnalysis(userId, reviewId, sentiment, suggested_response)
  console.log(`${LOG} analyzeReview user=${userId} review=${reviewId} sentiment=${sentiment}`)
  return { sentiment, suggested_response }
}

// ===================== GENERATE REPORT (LLM) =====================

export async function generateReport(userId: number, type?: string, force = false): Promise<{ report_id: number; summary: string } | null> {
  const config = await getWbConfig(userId)
  if (!config?.openrouter_api_key) throw new Error('OpenRouter API key not configured')

  if (!type) {
    const day = new Date().getDay()
    type = day === 1 ? 'weekly' : 'daily'
  }

  if (!force) {
    if (type === 'daily' && !config.daily_report_enabled) {
      console.log(`${LOG} generateReport user=${userId} daily reports disabled, skipping`)
      return null
    }
    if (type === 'weekly' && !config.weekly_report_enabled) {
      console.log(`${LOG} generateReport user=${userId} weekly reports disabled, skipping`)
      return null
    }
  }

  console.log(`${LOG} generateReport user=${userId} type=${type}`)
  const data = await getWbReportData(userId, type)
  const reportId = data.report_id as number

  try {
    const { staticPart, prompt } = buildReportPrompt(type, data)
    const llmResponse = await callOpenRouter(config.openrouter_api_key, prompt)

    let reviewConclusion = ''
    let actions = llmResponse.trim()
    const conclusionMatch = llmResponse.match(/ВЫВОД_ОТЗЫВОВ:\s*(.+)/i)
    if (conclusionMatch) {
      reviewConclusion = conclusionMatch[1].trim()
      const actionsMatch = llmResponse.match(/ДЕЙСТВИЯ:\s*([\s\S]+)/i)
      actions = actionsMatch ? actionsMatch[1].trim() : actions
    }

    const parts = [staticPart]
    if (reviewConclusion) parts.push(reviewConclusion)
    parts.push('')
    parts.push(`Рекомендуемые действия:\n${actions}`)
    const fullReport = parts.join('\n')

    const summaryLines = staticPart.split('\n').filter(l => l.startsWith('Выручка:') || l.startsWith('Заказов:') || l.startsWith('Прибыль:'))
    const summary = summaryLines.join(' | ') || fullReport.substring(0, 200)

    await updateWbReport(reportId, fullReport, summary)

    if (config.tg_bot_token && config.tg_chat_id) {
      await sendTelegramMessage(config.tg_bot_token, config.tg_chat_id, fullReport).catch(err =>
        console.error(`${LOG} [${ts()}] generateReport telegram error: ${err.message}`)
      )
    }

    console.log(`${LOG} generateReport user=${userId} report_id=${reportId} done`)
    return { report_id: reportId, summary }
  } catch (e: any) {
    await failWbReport(reportId, e.message || String(e)).catch(() => {})
    throw e
  }
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100, mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? '+∞' : '0'
  const pct = ((curr - prev) / prev * 100).toFixed(0)
  return Number(pct) > 0 ? `+${pct}` : pct
}

function buildReportPrompt(type: string, data: Record<string, unknown>): { staticPart: string; prompt: string } {
  const products = (data.products || []) as any[]
  const today = (data.snapshots_today || []) as any[]
  const prev = (data.snapshots_prev || []) as any[]
  const todayMap: Record<number, any> = {}
  for (const s of today) todayMap[s.nm_id] = s
  const prevMap: Record<number, any> = {}
  for (const s of prev) prevMap[s.nm_id] = s

  let revenue = 0, revenuePrev = 0, orders = 0, ordersPrev = 0
  let totalCost = 0, totalRevenue = 0

  for (const p of products) {
    const t = todayMap[p.nm_id] || {}
    const pr = prevMap[p.nm_id] || {}
    revenue += t.revenue || 0; revenuePrev += pr.revenue || 0
    orders += t.orders_count || 0; ordersPrev += pr.orders_count || 0
    if (p.cost_price > 0) totalCost += p.cost_price * (t.sales_count || 0)
    totalRevenue += t.revenue || 0
  }

  const profit = totalRevenue - totalCost
  const drr = totalRevenue > 0 ? 0 : 0 // no ad spend data yet
  const compLabel = type === 'weekly' ? 'к прошлой неделе' : 'к вчера'
  const dateStr = data.date_from === data.date_to ? String(data.date_from) : `${data.date_from} — ${data.date_to}`

  const reviews = (data.reviews_new || []) as any[]
  const negCount = reviews.filter((r: any) => r.rating <= 2).length
  const posCount = reviews.filter((r: any) => r.rating >= 5).length

  const report: string[] = []
  report.push(`WB · Отчёт за ${dateStr}`)
  report.push('')
  report.push(`Выручка: ${revenue.toLocaleString('ru-RU')} ₽ (${pctChange(revenue, revenuePrev)}% ${compLabel})`)
  report.push(`Заказов: ${orders} (${pctChange(orders, ordersPrev)}% ${compLabel})`)
  report.push(`Прибыль: ${profit.toLocaleString('ru-RU')} ₽`)
  report.push('')

  report.push(`Отзывы:`)
  report.push(`${negCount} негативных, ${posCount} положительных.`)

  const staticPart = report.join('\n')

  const productRows: { title: string; revenue: number; orders: number; stock: number; rating: number }[] = []
  for (const p of products) {
    const t = todayMap[p.nm_id] || {}
    productRows.push({
      title: p.title || `nm_id:${p.nm_id}`,
      revenue: t.revenue || 0,
      orders: t.orders_count || 0,
      stock: t.stock_qty ?? 0,
      rating: 0,
    })
  }
  productRows.sort((a, b) => b.revenue - a.revenue)

  const contextLines: string[] = []
  contextLines.push(`Выручка: ${revenue}р (пред. период: ${revenuePrev}р), заказов: ${orders} (пред.: ${ordersPrev}), прибыль: ${profit}р`)

  if (productRows.length) {
    contextLines.push('')
    contextLines.push('Товары (топ по выручке):')
    for (const p of productRows.slice(0, 10)) {
      contextLines.push(`- ${p.title}: выручка ${p.revenue}р, заказов ${p.orders}, остаток ${p.stock} шт`)
    }
  }

  if (reviews.length) {
    contextLines.push('')
    contextLines.push(`Отзывы (${negCount} негат., ${posCount} позит.):`)
    for (const r of reviews.slice(0, 5)) {
      const prodTitle = products.find((p: any) => p.nm_id === r.nm_id)?.title || `nm_id:${r.nm_id}`
      contextLines.push(`- ★${r.rating} "${prodTitle}": ${(r.text || '').substring(0, 80)}`)
    }
  }

  const alerts = (data.alerts || []) as any[]
  if (alerts.length) {
    contextLines.push('')
    contextLines.push(`Триггеры: ${alerts.map((a: any) => a.title).slice(0, 3).join(', ')}`)
  }

  const prompt = `Ты — аналитик маркетплейсов Wildberries. Ниже готовая часть ${type === 'weekly' ? 'недельного' : 'дневного'} отчёта и контекст с реальными данными.

ВАЖНО: используй ТОЛЬКО названия товаров и цифры из контекста ниже. НЕ выдумывай товары, модели, артикулы или цифры, которых нет в данных. Если данных недостаточно — пиши общие рекомендации без конкретных названий.

Тебе нужно дописать ДВА блока:

1) Краткий вывод из отзывов — одно предложение. Если отзывов нет, напиши "Новых отзывов за период нет."

2) 3 конкретных действия на основе данных.

Готовая часть отчёта:
${staticPart}

Контекст:
${contextLines.join('\n')}

Ответь строго в формате (без лишнего текста):
ВЫВОД_ОТЗЫВОВ: {одно предложение}
ДЕЙСТВИЯ:
1. {действие}
2. {действие}
3. {действие}`

  return { staticPart, prompt }
}

// ===================== TELEGRAM =====================

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<void> {
  const MAX_LEN = 4096
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) { chunks.push(remaining); break }
    let cut = remaining.lastIndexOf('\n', MAX_LEN)
    if (cut < 1) cut = MAX_LEN
    chunks.push(remaining.substring(0, cut))
    remaining = remaining.substring(cut).trimStart()
  }

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'HTML' }),
    })
    const data = await res.json() as any
    if (!data.ok) console.error(`${LOG} [${ts()}] telegram sendMessage error: ${JSON.stringify(data)}`)
    else console.log(`${LOG} telegram sent chunk (${chunk.length} chars) to chat=${chatId}`)
  }
}

// ===================== OPENROUTER =====================

async function callOpenRouter(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${text}`)
  }

  const json = await res.json()
  return json.choices?.[0]?.message?.content || ''
}

// ===================== GET ENABLED USERS =====================

import pool from '../db/pg-connection.js'

export async function collectSales(userId: number): Promise<number> {
  const config = await getWbConfig(userId)
  if (!config?.wb_api_key) throw new Error('WB API key not configured')
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const dateFrom = yesterday.toISOString().slice(0, 10)
  const dateTo = new Date().toISOString().slice(0, 10)
  return fetchSales(config, dateFrom, dateTo)
}

export async function collectStocks(userId: number): Promise<number> {
  const config = await getWbConfig(userId)
  if (!config?.wb_api_key) throw new Error('WB API key not configured')
  const dateFrom = new Date().toISOString().slice(0, 10)
  return fetchStocks(config, dateFrom)
}

export async function collectPrices(userId: number): Promise<number> {
  const config = await getWbConfig(userId)
  if (!config?.wb_api_key) throw new Error('WB API key not configured')
  const date = new Date().toISOString().slice(0, 10)
  return fetchPrices(config, date)
}

export async function getEnabledWbUsers(): Promise<number[]> {
  const { rows } = await pool.query('SELECT user_id FROM wb_configs WHERE enabled = 1 AND wb_api_key != $1', [''])
  return rows.map((r: any) => r.user_id)
}

export async function getEnabledWbConfigs(): Promise<WbConfigRow[]> {
  const { rows } = await pool.query('SELECT * FROM wb_configs WHERE enabled = 1 AND wb_api_key != $1', [''])
  return rows
}
