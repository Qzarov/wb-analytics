import pool from './pg-connection.js'

export async function initServiceLogsSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_logs (
      id          SERIAL PRIMARY KEY,
      service     TEXT NOT NULL,
      user_id     INTEGER NOT NULL,
      task        TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'cron',
      status      TEXT NOT NULL,
      message     TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_svc_logs_created ON service_logs (created_at)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_svc_logs_service ON service_logs (service)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_svc_logs_user ON service_logs (user_id)`)
  console.log('[service-logs] PostgreSQL schema initialized')
}

export interface ServiceLogRow {
  id: number
  service: string
  user_id: number
  task: string
  source: string
  status: string
  message: string
  duration_ms: number | null
  created_at: string
}

export async function insertServiceLog(
  service: string, userId: number, task: string, source: string, status: string, message: string, durationMs?: number,
): Promise<void> {
  await pool.query(
    'INSERT INTO service_logs (service, user_id, task, source, status, message, duration_ms) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [service, userId, task, source, status, message, durationMs ?? null],
  )
}

export async function getServiceLogs(filters: {
  service?: string; user_id?: number; task?: string; status?: string; source?: string
  from?: string; to?: string; limit?: number; offset?: number
}): Promise<{ rows: ServiceLogRow[]; total: number }> {
  const where: string[] = []
  const params: unknown[] = []
  let idx = 1
  if (filters.service) { where.push(`service = $${idx++}`); params.push(filters.service) }
  if (filters.user_id) { where.push(`user_id = $${idx++}`); params.push(filters.user_id) }
  if (filters.task) { where.push(`task = $${idx++}`); params.push(filters.task) }
  if (filters.status) { where.push(`status = $${idx++}`); params.push(filters.status) }
  if (filters.source) { where.push(`source = $${idx++}`); params.push(filters.source) }
  if (filters.from) { where.push(`created_at >= $${idx++}`); params.push(filters.from) }
  if (filters.to) { where.push(`created_at <= $${idx++}::timestamptz + interval '1 day'`); params.push(filters.to) }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : ''

  const countRes = await pool.query(`SELECT count(*)::int as total FROM service_logs ${clause}`, params)
  const total = countRes.rows[0].total

  const limit = Math.min(filters.limit || 100, 500)
  const offset = filters.offset || 0
  const dataParams = [...params, limit, offset]
  const { rows } = await pool.query(
    `SELECT * FROM service_logs ${clause} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, dataParams,
  )
  return { rows, total }
}

export async function getServiceLogServices(): Promise<string[]> {
  const { rows } = await pool.query('SELECT DISTINCT service FROM service_logs ORDER BY service')
  return rows.map((r: any) => r.service)
}

export async function getServiceLogTasks(service?: string): Promise<string[]> {
  if (service) {
    const { rows } = await pool.query('SELECT DISTINCT task FROM service_logs WHERE service = $1 ORDER BY task', [service])
    return rows.map((r: any) => r.task)
  }
  const { rows } = await pool.query('SELECT DISTINCT task FROM service_logs ORDER BY task')
  return rows.map((r: any) => r.task)
}

export async function deleteOldServiceLogs(olderThanDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM service_logs WHERE created_at < NOW() - ($1 || ' days')::interval`, [olderThanDays],
  )
  return rowCount ?? 0
}
