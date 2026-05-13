const BASE = import.meta.env.VITE_API_URL || '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data as T
}

export interface AuthResponse {
  token: string
  user: User
}

export interface User {
  id: number
  name: string
  email: string
  role: string
  credits: number
  plan_id: number | null
  plan_expires_at: string | null
  created_at?: string
  advanced_settings: number
  visible_products: string
}

export interface Plan {
  id: number
  name: string
  description: string
  credits: number
  price: number
  duration_days: number
  sort_order: number
}

export interface PaymentsInfo {
  providers: { id: string; name: string; status: string; currency: string }[]
  plans: Plan[]
}

// --- Service Logs ---
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

// --- WB Analytics ---
export interface WbConfig {
  user_id: number
  wb_api_key_set: boolean
  wb_api_key_masked: string
  tg_bot_token_set: boolean
  tg_bot_token_masked: string
  tg_chat_id: string
  drr_threshold: number
  margin_threshold: number
  conversion_drop_pct: number
  report_morning_hour: number
  report_weekly_day: number
  enabled: number
  daily_report_enabled: number
  weekly_report_enabled: number
  openrouter_api_key_set: boolean
  openrouter_api_key_masked: string
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
}

export interface WbProduct {
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

export interface WbAlert {
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

export const api = {
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getUsers: () => request<User[]>('/users'),

  getUser: (id: number) => request<User>(`/users/${id}`),

  updateUser: (id: number, data: Partial<Pick<User, 'name' | 'role' | 'credits' | 'advanced_settings' | 'visible_products'>>) =>
    request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    request<{ deleted: boolean }>(`/users/${id}`, { method: 'DELETE' }),

  assignPlan: (userId: number, planId: number) =>
    request<User>(`/users/${userId}/plan`, {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId }),
    }),

  removePlan: (userId: number) =>
    request<User>(`/users/${userId}/plan`, { method: 'DELETE' }),

  addCredits: (userId: number, amount: number) =>
    request<User>(`/users/${userId}/credits`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  getMe: () => request<User>('/auth/me'),

  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password, new_password }),
    }),

  getPayments: () => request<PaymentsInfo>('/payments/info'),

  getPlans: () => request<Plan[]>('/payments/plans'),

  createPlan: (data: Omit<Plan, 'id'>) =>
    request<Plan>('/payments/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePlan: (id: number, data: Partial<Omit<Plan, 'id'>>) =>
    request<Plan>(`/payments/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePlan: (id: number) =>
    request<{ deleted: boolean }>(`/payments/plans/${id}`, { method: 'DELETE' }),

  checkout: (planId: number) =>
    request<{ payment_url: string; invoice_id: string }>('/payments/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId }),
    }),

  // --- WB Analytics ---
  getWbDashboard: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    const qs = params.toString()
    return request<any>(`/wb/dashboard${qs ? '?' + qs : ''}`)
  },

  getWbConfig: () => request<WbConfig>('/wb/config'),

  saveWbConfig: (data: Record<string, unknown>) =>
    request<WbConfig>('/wb/config', { method: 'PUT', body: JSON.stringify(data) }),

  testWbApiKey: (wb_api_key: string) =>
    request<{ valid: boolean; error?: string; data?: unknown }>('/wb/config/test', {
      method: 'POST', body: JSON.stringify({ wb_api_key }),
    }),

  getWbProducts: () => request<WbProduct[]>('/wb/products'),

  updateWbProductCost: (nmId: number, cost_price: number) =>
    request<WbProduct>(`/wb/products/${nmId}/cost`, {
      method: 'PUT', body: JSON.stringify({ cost_price }),
    }),

  updateWbProduct: (nmId: number, fields: { cost_price?: number; nm_id?: number; title?: string }) =>
    request<WbProduct>(`/wb/products/${nmId}`, {
      method: 'PUT', body: JSON.stringify(fields),
    }),

  deleteWbProduct: (nmId: number) =>
    request<{ ok: boolean }>(`/wb/products/${nmId}`, { method: 'DELETE' }),

  addWbProduct: (title: string, cost_price: number, nm_id?: number) =>
    request<WbProduct>('/wb/products', {
      method: 'POST', body: JSON.stringify({ title, cost_price, ...(nm_id ? { nm_id } : {}) }),
    }),

  bulkImportWbProducts: (items: { title: string; cost_price: number }[]) =>
    request<{ imported: number }>('/wb/products/import', {
      method: 'POST', body: JSON.stringify({ items }),
    }),

  getWbAlerts: (filters?: { is_read?: number; alert_type?: string }) => {
    const params = new URLSearchParams()
    if (filters?.is_read !== undefined) params.set('is_read', String(filters.is_read))
    if (filters?.alert_type) params.set('alert_type', filters.alert_type)
    const qs = params.toString()
    return request<WbAlert[]>(`/wb/alerts${qs ? '?' + qs : ''}`)
  },

  markWbAlertRead: (id: number) =>
    request<{ ok: boolean }>(`/wb/alerts/${id}/read`, { method: 'PUT' }),

  markAllWbAlertsRead: () =>
    request<{ marked: number }>('/wb/alerts/read-all', { method: 'POST' }),

  syncWbProducts: () =>
    request<{ upserted: number }>('/wb/sync-products', { method: 'POST' }),

  collectWbData: () =>
    request<{ sales: number; stocks: number; prices: number; errors: string[] }>('/wb/collect', { method: 'POST' }),

  collectWbReviews: () =>
    request<{ upserted: number; new_negatives: number }>('/wb/collect-reviews', { method: 'POST' }),

  analyzeWbReview: (review_id: string, product_title: string, rating: number, text: string) =>
    request<{ sentiment: string; suggested_response: string }>('/wb/analyze-review', {
      method: 'POST', body: JSON.stringify({ review_id, product_title, rating, text }),
    }),

  generateWbReport: (type?: string) =>
    request<{ report_id: number; summary: string }>('/wb/generate-report', {
      method: 'POST', body: JSON.stringify(type ? { type } : {}),
    }),

  getWbReviews: (filters?: { nm_id?: number; sentiment?: string; is_new?: number }) => {
    const params = new URLSearchParams()
    if (filters?.nm_id) params.set('nm_id', String(filters.nm_id))
    if (filters?.sentiment) params.set('sentiment', filters.sentiment)
    if (filters?.is_new !== undefined) params.set('is_new', String(filters.is_new))
    const qs = params.toString()
    return request<any[]>(`/wb/reviews${qs ? '?' + qs : ''}`)
  },

  getWbReports: (type?: string) => {
    const qs = type ? `?type=${type}` : ''
    return request<any[]>(`/wb/reports${qs}`)
  },

  getWbReport: (id: number) => request<any>(`/wb/reports/${id}`),

  // --- Admin Notes ---
  getUserNotes: (userId: number) =>
    request<{ id: number; user_id: number; author_id: number; author_name: string; text: string; created_at: string }[]>(`/users/${userId}/notes`),

  addUserNote: (userId: number, text: string) =>
    request<{ id: number; user_id: number; author_id: number; author_name: string; text: string; created_at: string }>(`/users/${userId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  deleteUserNote: (userId: number, noteId: number) =>
    request<{ deleted: boolean }>(`/users/${userId}/notes/${noteId}`, { method: 'DELETE' }),

  // --- Admin Settings ---
  getAdminSettings: () => request<Record<string, string>>('/admin/settings'),

  saveAdminSettings: (data: Record<string, string>) =>
    request<{ ok: boolean }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  testAlert: () => request<{ ok: boolean }>('/admin/settings/test-alert', { method: 'POST' }),

  // --- Service Logs ---
  getServiceLogs: (params: Record<string, string | number>) => {
    const qs = Object.entries(params).filter(([, v]) => v !== '' && v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    return request<{ rows: ServiceLogRow[]; total: number }>(`/admin/logs?${qs}`)
  },

  getServiceLogFilters: (service?: string) =>
    request<{ services: string[]; tasks: string[] }>(`/admin/logs/filters${service ? '?service=' + service : ''}`),

  getLogRetention: () => request<{ days: number }>('/admin/logs/retention'),

  setLogRetention: (days: number) =>
    request<{ days: number }>('/admin/logs/retention', { method: 'PUT', body: JSON.stringify({ days }) }),

  cleanupLogs: () => request<{ deleted: number; days: number }>('/admin/logs/cleanup', { method: 'POST' }),
}
