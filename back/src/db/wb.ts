import pool from './pg-connection.js'

// ===================== SCHEMA =====================

export async function initWbSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_configs (
      user_id             INTEGER PRIMARY KEY,
      wb_api_key          TEXT NOT NULL DEFAULT '',
      tg_bot_token        TEXT NOT NULL DEFAULT '',
      tg_chat_id          TEXT NOT NULL DEFAULT '',
      drr_threshold       REAL NOT NULL DEFAULT 15.0,
      margin_threshold    REAL NOT NULL DEFAULT 20.0,
      conversion_drop_pct REAL NOT NULL DEFAULT 30.0,
      report_morning_hour INTEGER NOT NULL DEFAULT 9,
      report_weekly_day   INTEGER NOT NULL DEFAULT 1,
      enabled             INTEGER NOT NULL DEFAULT 0,
      daily_report_enabled  INTEGER NOT NULL DEFAULT 1,
      weekly_report_enabled INTEGER NOT NULL DEFAULT 1,
      api_key             TEXT NOT NULL DEFAULT '',
      sync_webhook_url    TEXT NOT NULL DEFAULT '',
      openrouter_api_key  TEXT NOT NULL DEFAULT '',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_products (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      nm_id        INTEGER NOT NULL,
      imt_id       INTEGER,
      subject      TEXT NOT NULL DEFAULT '',
      brand        TEXT NOT NULL DEFAULT '',
      title        TEXT NOT NULL DEFAULT '',
      article      TEXT NOT NULL DEFAULT '',
      cost_price   REAL NOT NULL DEFAULT 0,
      barcode      TEXT NOT NULL DEFAULT '',
      size         TEXT NOT NULL DEFAULT '',
      category     TEXT NOT NULL DEFAULT '',
      image_url    TEXT NOT NULL DEFAULT '',
      is_tracked   INTEGER NOT NULL DEFAULT 1,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, nm_id)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_snapshots (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL,
      nm_id            INTEGER NOT NULL,
      date             TEXT NOT NULL,
      revenue          REAL NOT NULL DEFAULT 0,
      orders_count     INTEGER NOT NULL DEFAULT 0,
      sales_count      INTEGER NOT NULL DEFAULT 0,
      returns_count    INTEGER NOT NULL DEFAULT 0,
      stock_qty        INTEGER NOT NULL DEFAULT 0,
      price            REAL NOT NULL DEFAULT 0,
      discount_pct     REAL NOT NULL DEFAULT 0,
      final_price      REAL NOT NULL DEFAULT 0,
      views            INTEGER NOT NULL DEFAULT 0,
      clicks           INTEGER NOT NULL DEFAULT 0,
      add_to_cart      INTEGER NOT NULL DEFAULT 0,
      conversion       REAL NOT NULL DEFAULT 0,
      position_avg     REAL,
      position_category TEXT NOT NULL DEFAULT '',
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, nm_id, date)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_ad_campaigns (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL,
      campaign_id    INTEGER NOT NULL,
      campaign_name  TEXT NOT NULL DEFAULT '',
      campaign_type  TEXT NOT NULL DEFAULT '',
      status         TEXT NOT NULL DEFAULT '',
      daily_budget   REAL NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, campaign_id)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_ad_stats (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL,
      campaign_id    INTEGER NOT NULL,
      nm_id          INTEGER,
      date           TEXT NOT NULL,
      views          INTEGER NOT NULL DEFAULT 0,
      clicks         INTEGER NOT NULL DEFAULT 0,
      ctr            REAL NOT NULL DEFAULT 0,
      cpc            REAL NOT NULL DEFAULT 0,
      spend          REAL NOT NULL DEFAULT 0,
      orders_count   INTEGER NOT NULL DEFAULT 0,
      orders_sum     REAL NOT NULL DEFAULT 0,
      atbs           INTEGER NOT NULL DEFAULT 0,
      shks           INTEGER NOT NULL DEFAULT 0,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, campaign_id, nm_id, date)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_reviews (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER NOT NULL,
      review_id           TEXT NOT NULL,
      nm_id               INTEGER NOT NULL,
      rating              INTEGER NOT NULL DEFAULT 5,
      text                TEXT NOT NULL DEFAULT '',
      author              TEXT NOT NULL DEFAULT '',
      sentiment           TEXT NOT NULL DEFAULT 'neutral',
      suggested_response  TEXT NOT NULL DEFAULT '',
      review_date         TEXT NOT NULL DEFAULT '',
      is_new              INTEGER NOT NULL DEFAULT 1,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, review_id)
    )
  `)

  await pool.query(`
    UPDATE wb_reviews SET sentiment = CASE
      WHEN rating >= 5 THEN 'positive'
      WHEN rating >= 4 THEN 'neutral'
      ELSE 'negative'
    END
    WHERE sentiment = 'neutral' AND rating != 4
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_reports (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      type         TEXT NOT NULL DEFAULT 'daily',
      status       TEXT NOT NULL DEFAULT 'generating',
      date_from    TEXT NOT NULL DEFAULT '',
      date_to      TEXT NOT NULL DEFAULT '',
      content      TEXT NOT NULL DEFAULT '',
      summary      TEXT NOT NULL DEFAULT '',
      error_text   TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wb_alerts (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      alert_type   TEXT NOT NULL,
      nm_id        INTEGER,
      title        TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      severity     TEXT NOT NULL DEFAULT 'warning',
      is_read      INTEGER NOT NULL DEFAULT 0,
      is_sent_tg   INTEGER NOT NULL DEFAULT 0,
      data_json    TEXT NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  // Migrations
  await pool.query(`ALTER TABLE wb_configs ADD COLUMN IF NOT EXISTS daily_report_enabled INTEGER NOT NULL DEFAULT 1`)
  await pool.query(`ALTER TABLE wb_configs ADD COLUMN IF NOT EXISTS weekly_report_enabled INTEGER NOT NULL DEFAULT 1`)

  const scheduleCols = [
    'schedule_sync_hour', 'schedule_sync_minute',
    'schedule_sales_hour', 'schedule_sales_minute',
    'schedule_stocks_hour', 'schedule_stocks_minute',
    'schedule_prices_hour', 'schedule_prices_minute',
    'schedule_reviews_hour', 'schedule_reviews_minute',
    'schedule_report_hour', 'schedule_report_minute',
  ]
  const defaults: Record<string, number> = {
    schedule_sync_hour: 6, schedule_sync_minute: 0,
    schedule_sales_hour: 7, schedule_sales_minute: 0,
    schedule_stocks_hour: 7, schedule_stocks_minute: 10,
    schedule_prices_hour: 7, schedule_prices_minute: 20,
    schedule_reviews_hour: 8, schedule_reviews_minute: 0,
    schedule_report_hour: 9, schedule_report_minute: 0,
  }
  for (const col of scheduleCols) {
    await pool.query(`ALTER TABLE wb_configs ADD COLUMN IF NOT EXISTS ${col} INTEGER NOT NULL DEFAULT ${defaults[col]}`)
  }

  await pool.query(`ALTER TABLE wb_configs ADD COLUMN IF NOT EXISTS schedule_report_weekly_hour INTEGER NOT NULL DEFAULT 9`)
  await pool.query(`ALTER TABLE wb_configs ADD COLUMN IF NOT EXISTS schedule_report_weekly_minute INTEGER NOT NULL DEFAULT 30`)

  const enabledCols = ['schedule_sync_enabled', 'schedule_sales_enabled', 'schedule_stocks_enabled', 'schedule_prices_enabled', 'schedule_reviews_enabled']
  for (const col of enabledCols) {
    await pool.query(`ALTER TABLE wb_configs ADD COLUMN IF NOT EXISTS ${col} INTEGER NOT NULL DEFAULT 1`)
  }

  console.log('[wb] PostgreSQL schema initialized')
}

// ===================== CONFIG =====================

export interface WbConfigRow {
  user_id: number
  wb_api_key: string
  tg_bot_token: string
  tg_chat_id: string
  drr_threshold: number
  margin_threshold: number
  conversion_drop_pct: number
  report_morning_hour: number
  report_weekly_day: number
  enabled: number
  daily_report_enabled: number
  weekly_report_enabled: number
  api_key: string
  sync_webhook_url: string
  openrouter_api_key: string
  schedule_sync_hour: number
  schedule_sync_minute: number
  schedule_sales_hour: number
  schedule_sales_minute: number
  schedule_stocks_hour: number
  schedule_stocks_minute: number
  schedule_prices_hour: number
  schedule_prices_minute: number
  schedule_reviews_hour: number
  schedule_reviews_minute: number
  schedule_report_hour: number
  schedule_report_minute: number
  schedule_report_weekly_hour: number
  schedule_report_weekly_minute: number
  schedule_sync_enabled: number
  schedule_sales_enabled: number
  schedule_stocks_enabled: number
  schedule_prices_enabled: number
  schedule_reviews_enabled: number
  created_at: string
}

export async function getWbConfig(userId: number): Promise<WbConfigRow | undefined> {
  const { rows } = await pool.query('SELECT * FROM wb_configs WHERE user_id = $1', [userId])
  return rows[0]
}

export async function getWbConfigByApiKey(apiKey: string): Promise<WbConfigRow | undefined> {
  if (!apiKey) return undefined
  const { rows } = await pool.query('SELECT * FROM wb_configs WHERE api_key = $1', [apiKey])
  return rows[0]
}

export async function upsertWbConfig(userId: number, fields: Partial<Omit<WbConfigRow, 'user_id' | 'api_key' | 'created_at'>>): Promise<WbConfigRow> {
  const existing = await getWbConfig(userId)
  if (!existing) {
    const apiKey = crypto.randomUUID()
    await pool.query('INSERT INTO wb_configs (user_id, api_key) VALUES ($1, $2)', [userId, apiKey])
  }
  const sets: string[] = []
  const values: unknown[] = []
  let idx = 1
  if (fields.wb_api_key !== undefined) { sets.push(`wb_api_key = $${idx++}`); values.push(fields.wb_api_key) }
  if (fields.tg_bot_token !== undefined) { sets.push(`tg_bot_token = $${idx++}`); values.push(fields.tg_bot_token) }
  if (fields.tg_chat_id !== undefined) { sets.push(`tg_chat_id = $${idx++}`); values.push(fields.tg_chat_id) }
  if (fields.drr_threshold !== undefined) { sets.push(`drr_threshold = $${idx++}`); values.push(fields.drr_threshold) }
  if (fields.margin_threshold !== undefined) { sets.push(`margin_threshold = $${idx++}`); values.push(fields.margin_threshold) }
  if (fields.conversion_drop_pct !== undefined) { sets.push(`conversion_drop_pct = $${idx++}`); values.push(fields.conversion_drop_pct) }
  if (fields.report_morning_hour !== undefined) { sets.push(`report_morning_hour = $${idx++}`); values.push(fields.report_morning_hour) }
  if (fields.report_weekly_day !== undefined) { sets.push(`report_weekly_day = $${idx++}`); values.push(fields.report_weekly_day) }
  if (fields.enabled !== undefined) { sets.push(`enabled = $${idx++}`); values.push(fields.enabled) }
  if (fields.daily_report_enabled !== undefined) { sets.push(`daily_report_enabled = $${idx++}`); values.push(fields.daily_report_enabled) }
  if (fields.weekly_report_enabled !== undefined) { sets.push(`weekly_report_enabled = $${idx++}`); values.push(fields.weekly_report_enabled) }
  if (fields.sync_webhook_url !== undefined) { sets.push(`sync_webhook_url = $${idx++}`); values.push(fields.sync_webhook_url) }
  if (fields.openrouter_api_key !== undefined) { sets.push(`openrouter_api_key = $${idx++}`); values.push(fields.openrouter_api_key) }
  if (fields.schedule_sync_hour !== undefined) { sets.push(`schedule_sync_hour = $${idx++}`); values.push(fields.schedule_sync_hour) }
  if (fields.schedule_sync_minute !== undefined) { sets.push(`schedule_sync_minute = $${idx++}`); values.push(fields.schedule_sync_minute) }
  if (fields.schedule_sales_hour !== undefined) { sets.push(`schedule_sales_hour = $${idx++}`); values.push(fields.schedule_sales_hour) }
  if (fields.schedule_sales_minute !== undefined) { sets.push(`schedule_sales_minute = $${idx++}`); values.push(fields.schedule_sales_minute) }
  if (fields.schedule_stocks_hour !== undefined) { sets.push(`schedule_stocks_hour = $${idx++}`); values.push(fields.schedule_stocks_hour) }
  if (fields.schedule_stocks_minute !== undefined) { sets.push(`schedule_stocks_minute = $${idx++}`); values.push(fields.schedule_stocks_minute) }
  if (fields.schedule_prices_hour !== undefined) { sets.push(`schedule_prices_hour = $${idx++}`); values.push(fields.schedule_prices_hour) }
  if (fields.schedule_prices_minute !== undefined) { sets.push(`schedule_prices_minute = $${idx++}`); values.push(fields.schedule_prices_minute) }
  if (fields.schedule_reviews_hour !== undefined) { sets.push(`schedule_reviews_hour = $${idx++}`); values.push(fields.schedule_reviews_hour) }
  if (fields.schedule_reviews_minute !== undefined) { sets.push(`schedule_reviews_minute = $${idx++}`); values.push(fields.schedule_reviews_minute) }
  if (fields.schedule_report_hour !== undefined) { sets.push(`schedule_report_hour = $${idx++}`); values.push(fields.schedule_report_hour) }
  if (fields.schedule_report_minute !== undefined) { sets.push(`schedule_report_minute = $${idx++}`); values.push(fields.schedule_report_minute) }
  if (fields.schedule_report_weekly_hour !== undefined) { sets.push(`schedule_report_weekly_hour = $${idx++}`); values.push(fields.schedule_report_weekly_hour) }
  if (fields.schedule_report_weekly_minute !== undefined) { sets.push(`schedule_report_weekly_minute = $${idx++}`); values.push(fields.schedule_report_weekly_minute) }
  if (fields.schedule_sync_enabled !== undefined) { sets.push(`schedule_sync_enabled = $${idx++}`); values.push(fields.schedule_sync_enabled) }
  if (fields.schedule_sales_enabled !== undefined) { sets.push(`schedule_sales_enabled = $${idx++}`); values.push(fields.schedule_sales_enabled) }
  if (fields.schedule_stocks_enabled !== undefined) { sets.push(`schedule_stocks_enabled = $${idx++}`); values.push(fields.schedule_stocks_enabled) }
  if (fields.schedule_prices_enabled !== undefined) { sets.push(`schedule_prices_enabled = $${idx++}`); values.push(fields.schedule_prices_enabled) }
  if (fields.schedule_reviews_enabled !== undefined) { sets.push(`schedule_reviews_enabled = $${idx++}`); values.push(fields.schedule_reviews_enabled) }
  if (sets.length > 0) {
    values.push(userId)
    await pool.query(`UPDATE wb_configs SET ${sets.join(', ')} WHERE user_id = $${idx}`, values)
  }
  return (await getWbConfig(userId))!
}

// ===================== PRODUCTS =====================

export interface WbProductRow {
  id: number
  user_id: number
  nm_id: number
  imt_id: number | null
  subject: string
  brand: string
  title: string
  article: string
  cost_price: number
  barcode: string
  size: string
  category: string
  image_url: string
  is_tracked: number
  created_at: string
}

export async function getWbProducts(userId: number): Promise<WbProductRow[]> {
  const { rows } = await pool.query('SELECT * FROM wb_products WHERE user_id = $1 ORDER BY title ASC', [userId])
  return rows
}

export async function upsertWbProduct(userId: number, product: { nm_id: number; imt_id?: number; subject?: string; brand?: string; title?: string; article?: string; barcode?: string; size?: string; category?: string; image_url?: string }): Promise<WbProductRow> {
  const { rows: existing } = await pool.query('SELECT * FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, product.nm_id])
  if (existing[0]) {
    const e = existing[0]
    await pool.query(
      `UPDATE wb_products SET imt_id = $1, subject = $2, brand = $3, title = $4, article = $5, barcode = $6, size = $7, category = $8, image_url = $9 WHERE id = $10`,
      [product.imt_id ?? e.imt_id, product.subject ?? e.subject, product.brand ?? e.brand, product.title ?? e.title, product.article ?? e.article, product.barcode ?? e.barcode, product.size ?? e.size, product.category ?? e.category, product.image_url ?? e.image_url, e.id]
    )
    const { rows } = await pool.query('SELECT * FROM wb_products WHERE id = $1', [e.id])
    return rows[0]
  }
  const { rows } = await pool.query(
    'INSERT INTO wb_products (user_id, nm_id, imt_id, subject, brand, title, article, barcode, size, category, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
    [userId, product.nm_id, product.imt_id ?? null, product.subject ?? '', product.brand ?? '', product.title ?? '', product.article ?? '', product.barcode ?? '', product.size ?? '', product.category ?? '', product.image_url ?? '']
  )
  return rows[0]
}

export async function updateWbProductCost(userId: number, nmId: number, costPrice: number): Promise<WbProductRow | undefined> {
  await pool.query('UPDATE wb_products SET cost_price = $1 WHERE user_id = $2 AND nm_id = $3', [costPrice, userId, nmId])
  const { rows } = await pool.query('SELECT * FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, nmId])
  return rows[0]
}

export async function updateWbProduct(userId: number, nmId: number, fields: { cost_price?: number; nm_id?: number; title?: string }): Promise<WbProductRow | undefined> {
  const { rows: existingRows } = await pool.query('SELECT id FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, nmId])
  if (!existingRows[0]) return undefined
  const existingId = existingRows[0].id
  if (fields.nm_id && fields.nm_id !== nmId) {
    const { rows: dup } = await pool.query('SELECT id FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, fields.nm_id])
    if (dup[0]) throw new Error(`Товар с NM ID ${fields.nm_id} уже существует`)
  }
  const newNmId = fields.nm_id ?? nmId
  const setClauses: string[] = []
  const values: unknown[] = []
  let idx = 1
  if (fields.nm_id !== undefined) { setClauses.push(`nm_id = $${idx++}`); values.push(fields.nm_id) }
  if (fields.cost_price !== undefined) { setClauses.push(`cost_price = $${idx++}`); values.push(fields.cost_price) }
  if (fields.title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(fields.title.trim()) }
  if (setClauses.length === 0) {
    const { rows } = await pool.query('SELECT * FROM wb_products WHERE id = $1', [existingId])
    return rows[0]
  }
  values.push(existingId)
  await pool.query(`UPDATE wb_products SET ${setClauses.join(', ')} WHERE id = $${idx}`, values)
  const { rows } = await pool.query('SELECT * FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, newNmId])
  return rows[0]
}

export async function deleteWbProduct(userId: number, nmId: number): Promise<boolean> {
  const res = await pool.query('DELETE FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, nmId])
  return (res.rowCount ?? 0) > 0
}

export async function addWbProductManual(userId: number, title: string, costPrice: number, nmId?: number): Promise<WbProductRow> {
  let finalNmId: number
  if (nmId && nmId > 0) {
    const { rows: existing } = await pool.query('SELECT id FROM wb_products WHERE user_id = $1 AND nm_id = $2', [userId, nmId])
    if (existing[0]) throw new Error(`Товар с NM ID ${nmId} уже существует`)
    finalNmId = nmId
  } else {
    const { rows } = await pool.query('SELECT MIN(nm_id) as min_nm FROM wb_products WHERE user_id = $1 AND nm_id < 0', [userId])
    finalNmId = (rows[0]?.min_nm ?? 0) - 1
  }
  const { rows } = await pool.query(
    'INSERT INTO wb_products (user_id, nm_id, title, cost_price) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, finalNmId, title.trim(), costPrice]
  )
  return rows[0]
}

export async function bulkImportWbProducts(userId: number, items: { title: string; cost_price: number }[]): Promise<number> {
  const { rows: minRow } = await pool.query('SELECT MIN(nm_id) as min_nm FROM wb_products WHERE user_id = $1 AND nm_id < 0', [userId])
  let nextNm = (minRow[0]?.min_nm ?? 0) - 1
  let count = 0
  for (const item of items) {
    const t = item.title.trim()
    if (!t) continue
    const { rows: existing } = await pool.query('SELECT id FROM wb_products WHERE user_id = $1 AND title = $2', [userId, t])
    if (existing[0]) {
      await pool.query('UPDATE wb_products SET cost_price = $1 WHERE id = $2', [item.cost_price, existing[0].id])
    } else {
      await pool.query('INSERT INTO wb_products (user_id, nm_id, title, cost_price) VALUES ($1, $2, $3, $4)', [userId, nextNm--, t, item.cost_price])
    }
    count++
  }
  return count
}

// ===================== SNAPSHOTS =====================

export interface WbSnapshotRow {
  id: number
  user_id: number
  nm_id: number
  date: string
  revenue: number
  orders_count: number
  sales_count: number
  returns_count: number
  stock_qty: number
  price: number
  discount_pct: number
  final_price: number
  views: number
  clicks: number
  add_to_cart: number
  conversion: number
  position_avg: number | null
  position_category: string
  created_at: string
}

export async function upsertWbSnapshotSales(userId: number, date: string, items: { nm_id: number; revenue: number; orders_count: number; sales_count: number; returns_count: number }[]): Promise<number> {
  let count = 0
  for (const item of items) {
    await pool.query(
      `INSERT INTO wb_snapshots (user_id, nm_id, date, revenue, orders_count, sales_count, returns_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(user_id, nm_id, date) DO UPDATE SET revenue=EXCLUDED.revenue, orders_count=EXCLUDED.orders_count, sales_count=EXCLUDED.sales_count, returns_count=EXCLUDED.returns_count`,
      [userId, item.nm_id, date, item.revenue, item.orders_count, item.sales_count, item.returns_count]
    )
    count++
  }
  return count
}

export async function upsertWbSnapshotStocks(userId: number, date: string, items: { nm_id: number; stock_qty: number }[]): Promise<number> {
  let count = 0
  for (const item of items) {
    await pool.query(
      `INSERT INTO wb_snapshots (user_id, nm_id, date, stock_qty)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(user_id, nm_id, date) DO UPDATE SET stock_qty=EXCLUDED.stock_qty`,
      [userId, item.nm_id, date, item.stock_qty]
    )
    count++
  }
  return count
}

export async function upsertWbSnapshotPrices(userId: number, date: string, items: { nm_id: number; price: number; discount_pct: number; final_price: number }[]): Promise<number> {
  let count = 0
  for (const item of items) {
    await pool.query(
      `INSERT INTO wb_snapshots (user_id, nm_id, date, price, discount_pct, final_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(user_id, nm_id, date) DO UPDATE SET price=EXCLUDED.price, discount_pct=EXCLUDED.discount_pct, final_price=EXCLUDED.final_price`,
      [userId, item.nm_id, date, item.price, item.discount_pct, item.final_price]
    )
    count++
  }
  return count
}

// ===================== ALERTS =====================

export interface WbAlertRow {
  id: number
  user_id: number
  alert_type: string
  nm_id: number | null
  title: string
  description: string
  severity: string
  is_read: number
  is_sent_tg: number
  data_json: string
  created_at: string
}

export async function getWbAlerts(userId: number, filters?: { is_read?: number; alert_type?: string }): Promise<WbAlertRow[]> {
  let sql = 'SELECT * FROM wb_alerts WHERE user_id = $1'
  const params: unknown[] = [userId]
  let idx = 2
  if (filters?.is_read !== undefined) { sql += ` AND is_read = $${idx++}`; params.push(filters.is_read) }
  if (filters?.alert_type) { sql += ` AND alert_type = $${idx++}`; params.push(filters.alert_type) }
  sql += ' ORDER BY created_at DESC LIMIT 100'
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function markWbAlertRead(id: number, userId: number): Promise<boolean> {
  const res = await pool.query('UPDATE wb_alerts SET is_read = 1 WHERE id = $1 AND user_id = $2', [id, userId])
  return (res.rowCount ?? 0) > 0
}

export async function markAllWbAlertsRead(userId: number): Promise<number> {
  const res = await pool.query('UPDATE wb_alerts SET is_read = 1 WHERE user_id = $1 AND is_read = 0', [userId])
  return res.rowCount ?? 0
}

// ===================== REVIEWS =====================

export interface WbReviewRow {
  id: number
  user_id: number
  review_id: string
  nm_id: number
  rating: number
  text: string
  author: string
  sentiment: string
  suggested_response: string
  review_date: string
  is_new: number
  created_at: string
}

export async function upsertWbReviews(userId: number, reviews: { review_id: string; nm_id: number; rating: number; text: string; author: string; review_date: string }[]): Promise<number> {
  let count = 0
  for (const r of reviews) {
    if (!r.review_id) continue
    await pool.query(
      `INSERT INTO wb_reviews (user_id, review_id, nm_id, rating, text, author, review_date, sentiment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(user_id, review_id) DO UPDATE SET rating=EXCLUDED.rating, text=EXCLUDED.text, author=EXCLUDED.author, sentiment=EXCLUDED.sentiment`,
      [userId, r.review_id, r.nm_id, r.rating, r.text, r.author, r.review_date, r.rating >= 5 ? 'positive' : r.rating >= 4 ? 'neutral' : 'negative']
    )
    count++
  }
  return count
}

export async function getNewNegativeReviews(userId: number): Promise<WbReviewRow[]> {
  const { rows } = await pool.query('SELECT * FROM wb_reviews WHERE user_id = $1 AND is_new = 1 AND rating <= 2', [userId])
  return rows
}

export async function updateWbReviewAnalysis(userId: number, reviewId: string, sentiment: string, suggestedResponse: string): Promise<boolean> {
  const res = await pool.query(
    'UPDATE wb_reviews SET sentiment = $1, suggested_response = $2, is_new = 0 WHERE user_id = $3 AND review_id = $4',
    [sentiment, suggestedResponse, userId, reviewId]
  )
  return (res.rowCount ?? 0) > 0
}

export async function getWbReviews(userId: number, filters?: { nm_id?: number; sentiment?: string; is_new?: number }): Promise<WbReviewRow[]> {
  let sql = 'SELECT * FROM wb_reviews WHERE user_id = $1'
  const params: unknown[] = [userId]
  let idx = 2
  if (filters?.nm_id) { sql += ` AND nm_id = $${idx++}`; params.push(filters.nm_id) }
  if (filters?.sentiment) { sql += ` AND sentiment = $${idx++}`; params.push(filters.sentiment) }
  if (filters?.is_new !== undefined) { sql += ` AND is_new = $${idx++}`; params.push(filters.is_new) }
  sql += ' ORDER BY created_at DESC LIMIT 200'
  const { rows } = await pool.query(sql, params)
  return rows
}

// ===================== REPORTS =====================

export interface WbReportRow {
  id: number
  user_id: number
  type: string
  status: string
  date_from: string
  date_to: string
  content: string
  summary: string
  error_text: string
  created_at: string
  completed_at: string | null
}

export async function createWbReport(userId: number, type: string, dateFrom: string, dateTo: string): Promise<WbReportRow> {
  const { rows } = await pool.query(
    'INSERT INTO wb_reports (user_id, type, date_from, date_to) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, type, dateFrom, dateTo]
  )
  return rows[0]
}

export async function updateWbReport(reportId: number, content: string, summary: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE wb_reports SET content = $1, summary = $2, status = 'done', completed_at = NOW() WHERE id = $3`,
    [content, summary, reportId]
  )
  return (res.rowCount ?? 0) > 0
}

export async function failWbReport(reportId: number, errorText: string): Promise<void> {
  await pool.query(
    `UPDATE wb_reports SET status = 'error', error_text = $1, completed_at = NOW() WHERE id = $2`,
    [errorText, reportId]
  )
}

export async function getWbReports(userId: number, filters?: { type?: string }): Promise<WbReportRow[]> {
  let sql = 'SELECT id, user_id, type, status, date_from, date_to, summary, error_text, created_at, completed_at FROM wb_reports WHERE user_id = $1'
  const params: unknown[] = [userId]
  let idx = 2
  if (filters?.type) { sql += ` AND type = $${idx++}`; params.push(filters.type) }
  sql += ' ORDER BY created_at DESC LIMIT 50'
  const { rows } = await pool.query(sql, params)
  return rows
}

export async function getWbReportById(id: number, userId: number): Promise<WbReportRow | undefined> {
  const { rows } = await pool.query('SELECT * FROM wb_reports WHERE id = $1 AND user_id = $2', [id, userId])
  return rows[0]
}

export async function getWbReportData(userId: number, type: string): Promise<Record<string, unknown>> {
  const now = new Date()
  let dateFrom: string, dateTo: string, prevFrom: string, prevTo: string
  dateTo = now.toISOString().slice(0, 10)

  if (type === 'weekly') {
    const from = new Date(now); from.setDate(from.getDate() - 7)
    dateFrom = from.toISOString().slice(0, 10)
    const pf = new Date(from); pf.setDate(pf.getDate() - 7)
    prevFrom = pf.toISOString().slice(0, 10)
    prevTo = dateFrom
  } else {
    const from = new Date(now); from.setDate(from.getDate() - 1)
    dateFrom = from.toISOString().slice(0, 10)
    const pf = new Date(from); pf.setDate(pf.getDate() - 1)
    prevFrom = pf.toISOString().slice(0, 10)
    prevTo = dateFrom
  }

  const report = await createWbReport(userId, type, dateFrom, dateTo)
  const { rows: products } = await pool.query('SELECT * FROM wb_products WHERE user_id = $1 AND is_tracked = 1', [userId])
  const { rows: snapshotsToday } = await pool.query('SELECT * FROM wb_snapshots WHERE user_id = $1 AND date >= $2 AND date <= $3', [userId, dateFrom, dateTo])
  const { rows: snapshotsPrev } = await pool.query('SELECT * FROM wb_snapshots WHERE user_id = $1 AND date >= $2 AND date <= $3', [userId, prevFrom, prevTo])
  const { rows: reviewsNew } = await pool.query('SELECT * FROM wb_reviews WHERE user_id = $1 AND is_new = 1 ORDER BY created_at DESC LIMIT 20', [userId])
  const { rows: alerts } = await pool.query('SELECT * FROM wb_alerts WHERE user_id = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 20', [userId, dateFrom])
  const config = await getWbConfig(userId)
  const thresholds = {
    drr_threshold: config?.drr_threshold ?? 15,
    margin_threshold: config?.margin_threshold ?? 20,
    conversion_drop_pct: config?.conversion_drop_pct ?? 30
  }

  return {
    type, date_from: dateFrom, date_to: dateTo, report_id: report.id,
    products, snapshots_today: snapshotsToday, snapshots_prev: snapshotsPrev,
    reviews_new: reviewsNew, alerts, thresholds
  }
}

// ===================== DASHBOARD =====================

export async function getWbDashboard(userId: number, dateFrom?: string, dateTo?: string) {
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)

  const dFrom = dateFrom || yesterday.toISOString().slice(0, 10)
  const dTo = dateTo || dFrom

  const from = new Date(dFrom + 'T00:00:00Z')
  const to = new Date(dTo + 'T00:00:00Z')
  const rangeDays = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  const prevTo = new Date(from); prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - rangeDays + 1)
  const dPrevFrom = prevFrom.toISOString().slice(0, 10)
  const dPrevTo = prevTo.toISOString().slice(0, 10)

  const [
    { rows: products },
    { rows: snapCurrent },
    { rows: snapPrev },
    { rows: reviewStats },
    { rows: alertStats },
    { rows: dailyReviews },
    { rows: dailyAlerts },
  ] = await Promise.all([
    pool.query('SELECT * FROM wb_products WHERE user_id = $1 AND is_tracked = 1 ORDER BY title ASC', [userId]),
    pool.query('SELECT * FROM wb_snapshots WHERE user_id = $1 AND date >= $2 AND date <= $3', [userId, dFrom, dTo]),
    pool.query('SELECT * FROM wb_snapshots WHERE user_id = $1 AND date >= $2 AND date <= $3', [userId, dPrevFrom, dPrevTo]),
    pool.query(`SELECT
      COALESCE(AVG(rating), 0) as avg_rating,
      COUNT(*) FILTER (WHERE is_new = 1 AND rating <= 2) as new_negatives,
      COUNT(*) as total
      FROM wb_reviews WHERE user_id = $1`, [userId]),
    pool.query('SELECT COUNT(*) FILTER (WHERE is_read = 0) as unread FROM wb_alerts WHERE user_id = $1', [userId]),
    pool.query(`SELECT review_date::text AS date, COALESCE(AVG(rating), 0) as avg_rating, COUNT(*) as count
      FROM wb_reviews WHERE user_id = $1 AND review_date::text >= $2 AND review_date::text <= $3
      GROUP BY review_date::text ORDER BY date`, [userId, dFrom, dTo]),
    pool.query(`SELECT created_at::date::text AS date, COUNT(*) as count
      FROM wb_alerts WHERE user_id = $1 AND created_at::date::text >= $2 AND created_at::date::text <= $3
      GROUP BY created_at::date::text ORDER BY date`, [userId, dFrom, dTo]),
  ])

  const aggregate = (snaps: any[]) => {
    const map: Record<number, any> = {}
    for (const s of snaps) {
      if (!map[s.nm_id]) {
        map[s.nm_id] = { ...s, revenue: 0, orders_count: 0, sales_count: 0, returns_count: 0 }
      }
      map[s.nm_id].revenue += s.revenue || 0
      map[s.nm_id].orders_count += s.orders_count || 0
      map[s.nm_id].sales_count += s.sales_count || 0
      map[s.nm_id].returns_count += s.returns_count || 0
      if (s.date > (map[s.nm_id]._latest_date || '')) {
        map[s.nm_id]._latest_date = s.date
        map[s.nm_id].stock_qty = s.stock_qty
        map[s.nm_id].price = s.price
        map[s.nm_id].final_price = s.final_price
        map[s.nm_id].discount_pct = s.discount_pct
      }
    }
    return map
  }

  const todayMap = aggregate(snapCurrent)
  const prevMap = aggregate(snapPrev)

  let revenue = 0, revenuePrev = 0, orders = 0, ordersPrev = 0
  let sales = 0, salesPrev = 0, returns = 0, returnsPrev = 0
  let totalStock = 0, lowStockCount = 0

  const productRows = products.map((p: any) => {
    const t = todayMap[p.nm_id] || {}
    const pr = prevMap[p.nm_id] || {}
    revenue += t.revenue || 0; revenuePrev += pr.revenue || 0
    orders += t.orders_count || 0; ordersPrev += pr.orders_count || 0
    sales += t.sales_count || 0; salesPrev += pr.sales_count || 0
    returns += t.returns_count || 0; returnsPrev += pr.returns_count || 0
    const stock = t.stock_qty ?? 0
    totalStock += stock
    if (stock > 0 && stock < 10) lowStockCount++
    const margin = p.cost_price > 0 && (t.final_price || 0) > 0
      ? Math.round(((t.final_price - p.cost_price) / t.final_price) * 100)
      : null
    return {
      nm_id: p.nm_id, title: p.title, image_url: p.image_url, cost_price: p.cost_price,
      revenue: t.revenue || 0, revenue_prev: pr.revenue || 0,
      orders_count: t.orders_count || 0, orders_prev: pr.orders_count || 0,
      stock_qty: stock, price: t.price || 0, final_price: t.final_price || 0,
      margin,
    }
  })

  return {
    date_from: dFrom,
    date_to: dTo,
    date_prev_from: dPrevFrom,
    date_prev_to: dPrevTo,
    totals: {
      revenue, revenue_prev: revenuePrev,
      orders, orders_prev: ordersPrev,
      sales, sales_prev: salesPrev,
      returns, returns_prev: returnsPrev,
    },
    stock: { total_qty: totalStock, low_stock_count: lowStockCount },
    reviews: {
      avg_rating: Number(Number(reviewStats[0]?.avg_rating || 0).toFixed(1)),
      new_negatives: Number(reviewStats[0]?.new_negatives || 0),
    },
    alerts: { unread: Number(alertStats[0]?.unread || 0) },
    products: productRows,
    daily: buildDaily(snapCurrent, dailyReviews, dailyAlerts, dFrom, dTo),
  }
}

function buildDaily(snaps: any[], dailyReviews: any[], dailyAlerts: any[], dFrom: string, dTo: string) {
  const byDate: Record<string, { revenue: number; orders: number; returns: number; stock: number }> = {}
  for (const s of snaps) {
    if (!byDate[s.date]) byDate[s.date] = { revenue: 0, orders: 0, returns: 0, stock: 0 }
    byDate[s.date].revenue += s.revenue || 0
    byDate[s.date].orders += s.orders_count || 0
    byDate[s.date].returns += s.returns_count || 0
    byDate[s.date].stock += s.stock_qty || 0
  }

  const reviewMap: Record<string, number> = {}
  for (const r of dailyReviews) reviewMap[r.date] = Number(Number(r.avg_rating).toFixed(1))
  const alertMap: Record<string, number> = {}
  for (const a of dailyAlerts) alertMap[a.date] = Number(a.count)

  const result: { date: string; revenue: number; orders: number; returns: number; stock: number; avg_rating: number; alerts: number }[] = []
  const cur = new Date(dFrom + 'T00:00:00Z')
  const end = new Date(dTo + 'T00:00:00Z')
  while (cur <= end) {
    const d = cur.toISOString().slice(0, 10)
    const s = byDate[d] || { revenue: 0, orders: 0, returns: 0, stock: 0 }
    result.push({ date: d, ...s, avg_rating: reviewMap[d] || 0, alerts: alertMap[d] || 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}


