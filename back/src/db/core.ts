import bcrypt from 'bcrypt'
import db from './connection.js'
import { config } from '../config.js'
import type { UserRow } from '../types.js'

// ===================== TABLES =====================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',
    credits    INTEGER NOT NULL DEFAULT ${config.defaultCredits},
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    credits       INTEGER NOT NULL DEFAULT 0,
    price         INTEGER NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    sort_order    INTEGER NOT NULL DEFAULT 0
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    data    TEXT NOT NULL DEFAULT '{}'
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    plan_id     INTEGER NOT NULL REFERENCES plans(id),
    invoice_id  TEXT NOT NULL UNIQUE,
    amount      REAL NOT NULL,
    currency    TEXT NOT NULL DEFAULT 'USD',
    status      TEXT NOT NULL DEFAULT 'pending',
    provider    TEXT NOT NULL DEFAULT 'cryptocloud',
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at     TEXT
  )
`)

// ===================== MIGRATIONS =====================

try { db.exec('ALTER TABLE plans ADD COLUMN description TEXT NOT NULL DEFAULT ""') } catch {}
try { db.exec('ALTER TABLE plans ADD COLUMN duration_days INTEGER NOT NULL DEFAULT 30') } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN plan_id INTEGER REFERENCES plans(id)') } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN plan_expires_at TEXT') } catch {}
try { db.exec('ALTER TABLE users ADD COLUMN advanced_settings INTEGER NOT NULL DEFAULT 1') } catch {}
try { db.exec('UPDATE users SET advanced_settings = 1 WHERE advanced_settings = 0') } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN visible_products TEXT NOT NULL DEFAULT '[\"wb-analytics\"]'") } catch {}

// ===================== PLAN HELPERS =====================

export interface PlanRow {
  id: number
  name: string
  description: string
  credits: number
  price: number
  duration_days: number
  sort_order: number
}

export function getAllPlans(): PlanRow[] {
  return db.prepare('SELECT * FROM plans ORDER BY sort_order, id').all() as PlanRow[]
}

export function findPlanById(id: number): PlanRow | undefined {
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow | undefined
}

export function createPlan(fields: Omit<PlanRow, 'id'>): PlanRow {
  const stmt = db.prepare('INSERT INTO plans (name, description, credits, price, duration_days, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
  const result = stmt.run(fields.name, fields.description, fields.credits, fields.price, fields.duration_days, fields.sort_order)
  return findPlanById(result.lastInsertRowid as number)!
}

export function updatePlan(id: number, fields: Partial<Omit<PlanRow, 'id'>>): PlanRow | undefined {
  const sets: string[] = []
  const values: unknown[] = []
  if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name) }
  if (fields.description !== undefined) { sets.push('description = ?'); values.push(fields.description) }
  if (fields.credits !== undefined) { sets.push('credits = ?'); values.push(fields.credits) }
  if (fields.price !== undefined) { sets.push('price = ?'); values.push(fields.price) }
  if (fields.duration_days !== undefined) { sets.push('duration_days = ?'); values.push(fields.duration_days) }
  if (fields.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(fields.sort_order) }
  if (sets.length === 0) return findPlanById(id)
  values.push(id)
  db.prepare(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return findPlanById(id)
}

export function deletePlan(id: number): boolean {
  return db.prepare('DELETE FROM plans WHERE id = ?').run(id).changes > 0
}

// ===================== USER HELPERS =====================

export function findUserByEmail(email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}

export function createUser(name: string, email: string, hashedPassword: string): UserRow {
  const stmt = db.prepare(
    'INSERT INTO users (name, email, password, credits) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(name, email, hashedPassword, config.defaultCredits)
  return findUserById(result.lastInsertRowid as number)!
}

export function getAllUsers(): Omit<UserRow, 'password'>[] {
  return db.prepare('SELECT id, name, email, role, credits, plan_id, plan_expires_at, created_at, advanced_settings, visible_products FROM users').all() as Omit<UserRow, 'password'>[]
}

export function updateUser(id: number, fields: Partial<Pick<UserRow, 'name' | 'role' | 'credits' | 'advanced_settings' | 'visible_products'>>): UserRow | undefined {
  const sets: string[] = []
  const values: unknown[] = []
  if (fields.name !== undefined) { sets.push('name = ?'); values.push(fields.name) }
  if (fields.role !== undefined) { sets.push('role = ?'); values.push(fields.role) }
  if (fields.credits !== undefined) { sets.push('credits = ?'); values.push(fields.credits) }
  if (fields.advanced_settings !== undefined) { sets.push('advanced_settings = ?'); values.push(fields.advanced_settings) }
  if (fields.visible_products !== undefined) { sets.push('visible_products = ?'); values.push(fields.visible_products) }
  if (sets.length === 0) return findUserById(id)
  values.push(id)
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return findUserById(id)
}

export function deleteUser(id: number): boolean {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return result.changes > 0
}

export function assignPlan(userId: number, planId: number, durationDays: number, credits: number): UserRow | undefined {
  const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString()
  db.prepare('UPDATE users SET plan_id = ?, plan_expires_at = ?, credits = credits + ? WHERE id = ?')
    .run(planId, expiresAt, credits, userId)
  return findUserById(userId)
}

export function removePlan(userId: number): UserRow | undefined {
  db.prepare('UPDATE users SET plan_id = NULL, plan_expires_at = NULL WHERE id = ?').run(userId)
  return findUserById(userId)
}

export function addCredits(userId: number, amount: number): UserRow | undefined {
  db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').run(amount, userId)
  return findUserById(userId)
}

export function updatePassword(id: number, hashedPassword: string): boolean {
  return db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, id).changes > 0
}

// ===================== SETTINGS HELPERS =====================

export function getSettings(userId: number): Record<string, unknown> {
  const row = db.prepare('SELECT data FROM settings WHERE user_id = ?').get(userId) as { data: string } | undefined
  return row ? JSON.parse(row.data) : {}
}

export function saveSettings(userId: number, data: Record<string, unknown>): Record<string, unknown> {
  const existing = getSettings(userId)
  const merged = { ...existing, ...data }
  db.prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = ?')
    .run(userId, JSON.stringify(merged), JSON.stringify(merged))
  return merged
}

// ===================== ADMIN SETTINGS HELPERS =====================

export function getAdminSetting(key: string): string {
  const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? ''
}

export function setAdminSetting(key: string, value: string): void {
  db.prepare('INSERT INTO admin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}

export function getAllAdminSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM admin_settings').all() as { key: string; value: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

export function decrementCredits(id: number): number {
  db.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0').run(id)
  const user = findUserById(id)
  return user?.credits ?? 0
}

// ===================== PAYMENT HELPERS =====================

export interface PaymentRow {
  id: number
  user_id: number
  plan_id: number
  invoice_id: string
  amount: number
  currency: string
  status: string
  provider: string
  created_at: string
  paid_at: string | null
}

export function createPayment(userId: number, planId: number, invoiceId: string, amount: number, currency: string): PaymentRow {
  const result = db.prepare(
    'INSERT INTO payments (user_id, plan_id, invoice_id, amount, currency) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, planId, invoiceId, amount, currency)
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid) as PaymentRow
}

export function findPaymentByInvoice(invoiceId: string): PaymentRow | undefined {
  return db.prepare('SELECT * FROM payments WHERE invoice_id = ?').get(invoiceId) as PaymentRow | undefined
}

export function markPaymentPaid(invoiceId: string): PaymentRow | undefined {
  db.prepare("UPDATE payments SET status = 'paid', paid_at = datetime('now') WHERE invoice_id = ?").run(invoiceId)
  return findPaymentByInvoice(invoiceId)
}

// ===================== SEEDS =====================

const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt
if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10)
  db.prepare(
    "INSERT INTO users (name, email, password, role, credits) VALUES ('Super Admin', 'admin@admin.com', ?, 'superadmin', 9999)"
  ).run(hash)
  console.log('Seeded superadmin: admin@admin.com / admin123')
}

const planCount = (db.prepare('SELECT COUNT(*) as cnt FROM plans').get() as { cnt: number }).cnt
if (planCount === 0) {
  const seedPlans = db.prepare('INSERT INTO plans (name, description, credits, price, duration_days, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
  seedPlans.run('Free', '<p>Для знакомства с платформой</p><ul><li>100 кредитов</li><li>Базовый AI-ассистент</li></ul>', 100, 0, 0, 0)
  seedPlans.run('Pro', '<p>Для активных пользователей</p><ul><li>5 000 кредитов</li><li>Приоритетные ответы</li><li>История диалогов</li></ul>', 5000, 990, 30, 1)
  seedPlans.run('Business', '<p>Для команд и бизнеса</p><ul><li>50 000 кредитов</li><li>Выделенный AI-агент</li><li>API доступ</li><li>Поддержка 24/7</li></ul>', 50000, 4990, 30, 2)
  console.log('Seeded default plans')
}

