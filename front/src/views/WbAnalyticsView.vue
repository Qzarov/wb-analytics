<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { api, type WbConfig, type WbProduct, type WbAlert } from '@/api'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

type Tab = 'dashboard' | 'reviews' | 'reports' | 'settings'
const tab = ref<Tab>('dashboard')
const loading = ref(false)

// --- Toast ---
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string, type: 'success' | 'error' = 'success') {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

// ===================== CONFIG =====================
const config = reactive({
  wb_api_key: '',
  tg_bot_token: '',
  tg_chat_id: '',
  drr_threshold: 15,
  margin_threshold: 20,
  conversion_drop_pct: 30,
  report_morning_hour: 9,
  report_weekly_day: 1,
  daily_report_enabled: 1,
  weekly_report_enabled: 1,
  enabled: 0,
  openrouter_api_key: '',
  wb_api_key_set: false,
  wb_api_key_masked: '',
  tg_bot_token_set: false,
  tg_bot_token_masked: '',
  openrouter_api_key_set: false,
  openrouter_api_key_masked: '',
  schedule_sync_hour: 6,
  schedule_sync_minute: 0,
  schedule_sales_hour: 7,
  schedule_sales_minute: 0,
  schedule_stocks_hour: 7,
  schedule_stocks_minute: 10,
  schedule_prices_hour: 7,
  schedule_prices_minute: 20,
  schedule_reviews_hour: 8,
  schedule_reviews_minute: 0,
  schedule_report_hour: 9,
  schedule_report_minute: 0,
  schedule_report_weekly_hour: 9,
  schedule_report_weekly_minute: 30,
  schedule_sync_enabled: 1,
  schedule_sales_enabled: 1,
  schedule_stocks_enabled: 1,
  schedule_prices_enabled: 1,
  schedule_reviews_enabled: 1,
})
const configSaving = ref(false)
const testingKey = ref(false)
const testResult = ref<{ valid: boolean; error?: string } | null>(null)

const scheduleTasks = [
  { label: 'Синхронизация товаров', hourKey: 'schedule_sync_hour', minuteKey: 'schedule_sync_minute', enabledKey: 'schedule_sync_enabled' },
  { label: 'Продажи', hourKey: 'schedule_sales_hour', minuteKey: 'schedule_sales_minute', enabledKey: 'schedule_sales_enabled' },
  { label: 'Остатки', hourKey: 'schedule_stocks_hour', minuteKey: 'schedule_stocks_minute', enabledKey: 'schedule_stocks_enabled' },
  { label: 'Цены', hourKey: 'schedule_prices_hour', minuteKey: 'schedule_prices_minute', enabledKey: 'schedule_prices_enabled' },
  { label: 'Отзывы', hourKey: 'schedule_reviews_hour', minuteKey: 'schedule_reviews_minute', enabledKey: 'schedule_reviews_enabled' },
] as const

const scheduleDuplicateError = computed(() => {
  const times = scheduleTasks.map(t => `${(config as any)[t.hourKey]}:${(config as any)[t.minuteKey]}`)
  const seen = new Set<string>()
  for (const time of times) {
    if (seen.has(time)) return `Время ${time.split(':').map(s => s.padStart(2, '0')).join(':')} уже занято другой задачей`
    seen.add(time)
  }
  return ''
})

async function loadConfig() {
  try {
    const data = await api.getWbConfig()
    Object.assign(config, data)
  } catch {}
}

async function saveConfig() {
  if (scheduleDuplicateError.value) {
    showToast(scheduleDuplicateError.value, 'error')
    return
  }
  configSaving.value = true
  try {
    const { wb_api_key_set, wb_api_key_masked, tg_bot_token_set, tg_bot_token_masked, openrouter_api_key_set, openrouter_api_key_masked, ...fields } = config
    const payload: Record<string, unknown> = { ...fields }
    if (!config.wb_api_key) delete payload.wb_api_key
    if (!config.tg_bot_token) delete payload.tg_bot_token
    if (!config.openrouter_api_key) delete payload.openrouter_api_key
    const data = await api.saveWbConfig(payload)
    Object.assign(config, data)
    config.wb_api_key = ''
    config.tg_bot_token = ''
    config.openrouter_api_key = ''
    showToast('Настройки сохранены')
  } catch (e: any) { showToast(e.message, 'error') }
  finally { configSaving.value = false }
}

async function testApiKey() {
  const key = config.wb_api_key
  if (!key && !config.wb_api_key_set) { showToast('Введите API ключ', 'error'); return }
  testingKey.value = true
  testResult.value = null
  try {
    testResult.value = await api.testWbApiKey(key || '')
  } catch (e: any) { testResult.value = { valid: false, error: e.message } }
  finally { testingKey.value = false }
}

// ===================== PRODUCTS =====================
const products = ref<WbProduct[]>([])
const expandedNmId = ref<number | null>(null)
const productReviews = ref<any[]>([])
const productReviewsLoading = ref(false)
const analyzingReviewId = ref<string | null>(null)
const editingNmId = ref<number | null>(null)
const editForm = ref({ nm_id: 0, title: '', cost_price: 0 })
const bulkCostText = ref('')
const showBulkImport = ref(false)
const showAddOne = ref(false)
const newProductTitle = ref('')
const newProductCost = ref<number>(0)
const newProductNmId = ref<number | null>(null)

async function loadProducts() {
  try { products.value = await api.getWbProducts() } catch {}
}

function getProduct(nmId: number): WbProduct | undefined {
  return products.value.find(p => p.nm_id === nmId)
}

async function toggleExpand(nmId: number) {
  if (expandedNmId.value === nmId) {
    expandedNmId.value = null
    editingNmId.value = null
    productReviews.value = []
  } else {
    expandedNmId.value = nmId
    editingNmId.value = null
    productReviews.value = []
    if (nmId > 0) {
      productReviewsLoading.value = true
      try { productReviews.value = await api.getWbReviews({ nm_id: nmId }) } catch {}
      finally { productReviewsLoading.value = false }
    }
  }
}

async function analyzeReview(review: any) {
  analyzingReviewId.value = review.review_id
  try {
    const product = getProduct(review.nm_id)
    const result = await api.analyzeWbReview(review.review_id, product?.title || '', review.rating, review.text)
    review.sentiment = result.sentiment
    review.suggested_response = result.suggested_response
    showToast('Отзыв проанализирован')
  } catch (e: any) { showToast('Ошибка анализа: ' + e.message, 'error') }
  finally { analyzingReviewId.value = null }
}

function ratingStars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating)
}

function sentimentLabel(s: string | null): string {
  if (!s) return ''
  const map: Record<string, string> = { positive: 'Позитивный', negative: 'Негативный', neutral: 'Нейтральный' }
  return map[s] || s
}

function formatReviewDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ===================== REVIEWS TAB =====================
const allReviewsRaw = ref<any[]>([])
const allReviewsLoading = ref(false)
const collectingReviews = ref(false)
const reviewFilter = reactive({ nm_id: 0, sentiment: '' })

const allReviews = computed(() => {
  let list = allReviewsRaw.value
  if (reviewFilter.nm_id) list = list.filter(r => r.nm_id === reviewFilter.nm_id)
  if (reviewFilter.sentiment) list = list.filter(r => r.sentiment === reviewFilter.sentiment)
  return list
})

const reviewProducts = computed(() => {
  const map = new Map<number, string>()
  for (const r of allReviewsRaw.value) {
    if (!map.has(r.nm_id)) {
      const p = products.value.find(x => x.nm_id === r.nm_id)
      map.set(r.nm_id, p?.title || String(r.nm_id))
    }
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
})

async function loadAllReviews() {
  allReviewsLoading.value = true
  try {
    allReviewsRaw.value = await api.getWbReviews({})
  } catch {}
  finally { allReviewsLoading.value = false }
}

async function runCollectReviews() {
  collectingReviews.value = true
  try {
    const r = await api.collectWbReviews()
    showToast(`Отзывы обновлены: ${r.upserted} шт.${r.new_negatives ? `, негативных: ${r.new_negatives}` : ''}`)
    await loadAllReviews()
  } catch (e: any) { showToast('Ошибка: ' + e.message, 'error') }
  finally { collectingReviews.value = false }
}

function resetReviewFilters() { reviewFilter.nm_id = 0; reviewFilter.sentiment = '' }

const syncing = ref(false)
async function syncProducts() {
  syncing.value = true
  try {
    const result = await api.syncWbProducts()
    showToast(`Синхронизировано товаров: ${result.upserted}`)
    await Promise.all([loadProducts(), loadDashboard()])
  } catch (e: any) { showToast('Ошибка: ' + e.message, 'error') }
  finally { syncing.value = false }
}

function startEdit(p: WbProduct) {
  editingNmId.value = p.nm_id
  editForm.value = { nm_id: p.nm_id, title: p.title || '', cost_price: p.cost_price }
}

function cancelEdit() { editingNmId.value = null }

async function saveEdit(origNmId: number) {
  const fields: Record<string, unknown> = {}
  const p = products.value.find(x => x.nm_id === origNmId)
  if (!p) return
  if (editForm.value.nm_id !== origNmId) fields.nm_id = editForm.value.nm_id
  if (editForm.value.title !== (p.title || '')) fields.title = editForm.value.title
  if (editForm.value.cost_price !== p.cost_price) fields.cost_price = editForm.value.cost_price
  if (Object.keys(fields).length === 0) { editingNmId.value = null; return }
  try {
    const updated = await api.updateWbProduct(origNmId, fields as any)
    const idx = products.value.findIndex(x => x.nm_id === origNmId)
    if (idx >= 0) products.value[idx] = updated
    editingNmId.value = null
    showToast('Товар обновлён')
    loadDashboard()
  } catch (e: any) { showToast(e.message, 'error') }
}

async function addOneProduct() {
  const title = newProductTitle.value.trim()
  if (!title) { showToast('Введите название', 'error'); return }
  try {
    const product = await api.addWbProduct(title, newProductCost.value || 0, newProductNmId.value || undefined)
    products.value.push(product)
    newProductTitle.value = ''
    newProductCost.value = 0
    newProductNmId.value = null
    showAddOne.value = false
    showToast('Товар добавлен')
    loadDashboard()
  } catch (e: any) { showToast(e.message, 'error') }
}

async function removeProduct(p: WbProduct) {
  if (!confirm(`Удалить «${p.title || p.article || p.nm_id}»?`)) return
  try {
    await api.deleteWbProduct(p.nm_id)
    products.value = products.value.filter(x => x.nm_id !== p.nm_id)
    expandedNmId.value = null
    showToast('Товар удалён')
    loadDashboard()
  } catch (e: any) { showToast(e.message, 'error') }
}

async function bulkImportCosts() {
  const lines = bulkCostText.value.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) { showToast('Вставьте данные', 'error'); return }
  const items: { title: string; cost_price: number }[] = []
  for (const line of lines) {
    const sep = line.lastIndexOf(':')
    if (sep < 1) { showToast(`Неверный формат: "${line}"`, 'error'); return }
    const title = line.slice(0, sep).trim()
    const cost = Number(line.slice(sep + 1).trim())
    if (!title || isNaN(cost)) { showToast(`Неверный формат: "${line}"`, 'error'); return }
    items.push({ title, cost_price: cost })
  }
  try {
    const result = await api.bulkImportWbProducts(items)
    showToast(`Импортировано: ${result.imported}`)
    showBulkImport.value = false
    bulkCostText.value = ''
    await Promise.all([loadProducts(), loadDashboard()])
  } catch (e: any) { showToast(e.message, 'error') }
}

// ===================== ALERTS =====================
const alerts = ref<WbAlert[]>([])
const unreadAlerts = computed(() => alerts.value.filter(a => !a.is_read))

async function loadAlerts() {
  try { alerts.value = await api.getWbAlerts() } catch {}
}

async function markRead(id: number) {
  await api.markWbAlertRead(id)
  const a = alerts.value.find(x => x.id === id)
  if (a) a.is_read = 1
}

async function markAllRead() {
  await api.markAllWbAlertsRead()
  alerts.value.forEach(a => { a.is_read = 1 })
}

// ===================== REPORTS =====================
const reports = ref<any[]>([])
const reportsLoading = ref(false)
const generating = ref(false)
const expandedReportId = ref<number | null>(null)
const expandedReportContent = ref<string>('')

async function loadReports() {
  reportsLoading.value = true
  try { reports.value = await api.getWbReports() } catch {}
  finally { reportsLoading.value = false }
}

async function requestReport(type: string) {
  generating.value = true
  try {
    const r = await api.generateWbReport(type)
    showToast(`Отчёт сформирован (#${r.report_id})`)
    await loadReports()
  } catch (e: any) { showToast('Ошибка: ' + e.message, 'error') }
  finally { generating.value = false }
}

async function toggleReport(id: number) {
  if (expandedReportId.value === id) {
    expandedReportId.value = null
    return
  }
  try {
    const full = await api.getWbReport(id)
    expandedReportContent.value = (full.content || 'Нет содержимого').replace(/\n/g, '<br>')
    expandedReportId.value = id
  } catch { expandedReportContent.value = 'Ошибка загрузки' }
}

function formatReportDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ===================== DASHBOARD =====================
const dashboard = ref<any>(null)
const dashboardLoading = ref(false)
const collecting = ref(false)
const collectCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
const defaultDate = yesterday.toISOString().slice(0, 10)
const dateFrom = ref(defaultDate)
const dateTo = ref(defaultDate)

async function loadDashboard() {
  dashboardLoading.value = true
  try { dashboard.value = await api.getWbDashboard(dateFrom.value, dateTo.value) } catch {}
  finally { dashboardLoading.value = false }
}

function setPreset(days: number) {
  const to = new Date()
  to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - days + 1)
  dateFrom.value = from.toISOString().slice(0, 10)
  dateTo.value = to.toISOString().slice(0, 10)
  loadDashboard()
}

function onDateChange() {
  if (dateFrom.value && dateTo.value && dateFrom.value <= dateTo.value) {
    loadDashboard()
  }
}

async function runCollect() {
  if (collectCooldown.value > 0) return
  collecting.value = true
  try {
    const r = await api.collectWbData()
    const parts: string[] = []
    if (r.sales > 0) parts.push(`Продажи: ${r.sales}`)
    if (r.stocks > 0) parts.push(`Остатки: ${r.stocks}`)
    if (r.prices > 0) parts.push(`Цены: ${r.prices}`)
    const ok = parts.length ? parts.join(', ') : ''
    const fail = r.errors?.length ? r.errors.join('; ') : ''
    if (fail && ok) {
      showToast(`${ok}. Ошибки: ${fail}`, 'error')
    } else if (fail) {
      showToast(fail, 'error')
    } else {
      showToast(ok || 'Нет новых данных')
    }
    await Promise.all([loadDashboard(), loadProducts()])
    collectCooldown.value = 60
    cooldownTimer = setInterval(() => {
      collectCooldown.value--
      if (collectCooldown.value <= 0 && cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null }
    }, 1000)
  } catch (e: any) { showToast('Ошибка: ' + e.message, 'error') }
  finally { collecting.value = false }
}

function delta(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? '+' : ''
  const pct = ((curr - prev) / prev * 100).toFixed(0)
  return Number(pct) > 0 ? `+${pct}%` : `${pct}%`
}

function deltaClass(curr: number, prev: number): string {
  if (curr > prev) return 'delta-up'
  if (curr < prev) return 'delta-down'
  return ''
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

// ===================== PRODUCTS PAGINATION & SORT =====================
const prodPage = ref(1)
const prodPerPage = ref(10)
const prodSortKey = ref<string>('revenue')
const prodSortAsc = ref(false)

type SortableKey = 'title' | 'revenue' | 'orders_count' | 'stock_qty' | 'price' | 'final_price' | 'margin'

const sortedProducts = computed(() => {
  if (!dashboard.value) return []
  const list = [...dashboard.value.products]
  const key = prodSortKey.value as SortableKey
  const dir = prodSortAsc.value ? 1 : -1
  list.sort((a: any, b: any) => {
    const av = a[key] ?? 0
    const bv = b[key] ?? 0
    if (typeof av === 'string') return dir * av.localeCompare(bv)
    return dir * (av - bv)
  })
  return list
})

const paginatedProducts = computed(() => {
  const start = (prodPage.value - 1) * prodPerPage.value
  return sortedProducts.value.slice(start, start + prodPerPage.value)
})

const prodTotalPages = computed(() => Math.max(1, Math.ceil(sortedProducts.value.length / prodPerPage.value)))

function setProdSort(key: string) {
  if (prodSortKey.value === key) {
    prodSortAsc.value = !prodSortAsc.value
  } else {
    prodSortKey.value = key
    prodSortAsc.value = key === 'title'
  }
  prodPage.value = 1
}

function sortIndicator(key: string) {
  if (prodSortKey.value !== key) return ''
  return prodSortAsc.value ? ' ▲' : ' ▼'
}

watch(prodPerPage, () => { prodPage.value = 1 })

// ===================== CHART =====================
type ChartMetric = 'revenue' | 'orders' | 'returns' | 'stock' | 'avg_rating' | 'alerts'
const chartMetric = ref<ChartMetric>('revenue')

const chartMetrics: { key: ChartMetric; label: string; color: string }[] = [
  { key: 'revenue', label: 'Выручка', color: '#6366f1' },
  { key: 'orders', label: 'Заказы', color: '#22c55e' },
  { key: 'returns', label: 'Возвраты', color: '#ef4444' },
  { key: 'stock', label: 'Остатки', color: '#3b82f6' },
  { key: 'avg_rating', label: 'Рейтинг', color: '#eab308' },
  { key: 'alerts', label: 'Алерты', color: '#f97316' },
]

const chartData = computed(() => {
  const daily = dashboard.value?.daily || []
  const m = chartMetrics.find(x => x.key === chartMetric.value)!
  return {
    labels: daily.map((d: any) => d.date.slice(5)),
    datasets: [{
      label: m.label,
      data: daily.map((d: any) => d[chartMetric.value]),
      borderColor: m.color,
      backgroundColor: m.color + '20',
      fill: true,
      tension: 0.3,
      pointRadius: daily.length > 30 ? 0 : 3,
    }],
  }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { tooltip: { mode: 'index' as const, intersect: false } },
  scales: {
    x: { grid: { display: false } },
    y: { beginAtZero: true },
  },
}))

// ===================== HELPERS =====================
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const weekDays = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

// ===================== INIT =====================
onMounted(async () => {
  loading.value = true
  await Promise.all([loadConfig(), loadProducts(), loadAlerts(), loadDashboard(), loadReports()])
  loading.value = false
})
</script>

<template>
  <div class="wb-page">
    <div class="wb-container">
      <div class="wb-header">
        <h1 class="page-title">WB Аналитика</h1>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" :class="{ active: tab === 'dashboard' }" @click="tab = 'dashboard'; loadAlerts(); loadDashboard()">
          Дашборд
          <span v-if="unreadAlerts.length" class="tab-badge tab-badge-accent">{{ unreadAlerts.length }}</span>
        </button>
        <button class="tab" :class="{ active: tab === 'reviews' }" @click="tab = 'reviews'; loadAllReviews()">
          Отзывы <span v-if="allReviews.length" class="tab-badge">{{ allReviews.length }}</span>
        </button>
        <button class="tab" :class="{ active: tab === 'reports' }" @click="tab = 'reports'; loadReports()">
          Отчёты <span class="tab-badge">{{ reports.length }}</span>
        </button>
        <button class="tab" :class="{ active: tab === 'settings' }" @click="tab = 'settings'">Настройки</button>
      </div>

      <!-- Toast -->
      <Transition name="toast">
        <div v-if="toast" class="toast" :class="'toast-' + toast.type" @click="toast = null">
          {{ toast.text }}
        </div>
      </Transition>

      <!-- ==================== TAB: Дашборд ==================== -->
      <div v-if="tab === 'dashboard'" class="tab-content">
        <div v-if="loading || dashboardLoading" class="empty">Загрузка...</div>
        <template v-else>
          <!-- Date range picker -->
          <div class="section">
            <div class="date-range-bar">
              <div class="date-presets">
                <button class="btn btn-secondary btn-sm" @click="setPreset(1)">Вчера</button>
                <button class="btn btn-secondary btn-sm" @click="setPreset(7)">7 дней</button>
                <button class="btn btn-secondary btn-sm" @click="setPreset(14)">14 дней</button>
                <button class="btn btn-secondary btn-sm" @click="setPreset(30)">30 дней</button>
              </div>
              <div class="date-inputs">
                <input type="date" v-model="dateFrom" @change="onDateChange" :max="dateTo" />
                <span class="date-sep">&mdash;</span>
                <input type="date" v-model="dateTo" @change="onDateChange" :min="dateFrom" :max="defaultDate" />
              </div>
              <button class="btn btn-secondary btn-sm" @click="runCollect" :disabled="collecting || collectCooldown > 0">
                {{ collecting ? 'Сбор...' : collectCooldown > 0 ? `Подождите ${collectCooldown}с` : 'Собрать данные' }}
              </button>
              <button class="btn btn-secondary btn-sm" @click="syncProducts" :disabled="syncing">
                {{ syncing ? 'Синхронизация...' : 'Синхронизировать товары' }}
              </button>
            </div>
          </div>

          <!-- Summary cards -->
          <div class="section">
            <div class="section-header">
              <h2 class="section-title">
                Сводка за {{ dashboard?.date_from === dashboard?.date_to ? dashboard?.date_from : dashboard?.date_from + ' — ' + dashboard?.date_to }}
              </h2>
              <span v-if="dashboard" class="date-compare-hint">
                сравнение с {{ dashboard.date_prev_from === dashboard.date_prev_to ? dashboard.date_prev_from : dashboard.date_prev_from + ' — ' + dashboard.date_prev_to }}
              </span>
            </div>

            <div v-if="!dashboard || !dashboard.products.length" class="empty">
              Данные появятся после первого сбора. Нажмите «Собрать данные» или дождитесь утреннего cron (07:00).
            </div>

            <div v-else class="kpi-grid">
              <div class="kpi-card">
                <div class="kpi-label">Выручка</div>
                <div class="kpi-value">{{ fmtMoney(dashboard.totals.revenue) }} &#8381;</div>
                <div class="kpi-delta" :class="deltaClass(dashboard.totals.revenue, dashboard.totals.revenue_prev)">
                  {{ delta(dashboard.totals.revenue, dashboard.totals.revenue_prev) }}
                </div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Заказы</div>
                <div class="kpi-value">{{ dashboard.totals.orders }}</div>
                <div class="kpi-delta" :class="deltaClass(dashboard.totals.orders, dashboard.totals.orders_prev)">
                  {{ delta(dashboard.totals.orders, dashboard.totals.orders_prev) }}
                </div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Возвраты</div>
                <div class="kpi-value">{{ dashboard.totals.returns }}</div>
                <div class="kpi-delta" :class="deltaClass(dashboard.totals.returns_prev, dashboard.totals.returns)">
                  {{ dashboard.totals.sales ? ((dashboard.totals.returns / dashboard.totals.sales) * 100).toFixed(1) + '%' : '—' }}
                </div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Остатки</div>
                <div class="kpi-value">{{ dashboard.stock.total_qty }}</div>
                <div class="kpi-delta" :class="dashboard.stock.low_stock_count > 0 ? 'delta-down' : ''">
                  {{ dashboard.stock.low_stock_count > 0 ? dashboard.stock.low_stock_count + ' мало' : 'OK' }}
                </div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Рейтинг</div>
                <div class="kpi-value">{{ dashboard.reviews.avg_rating }}</div>
                <div class="kpi-delta" :class="dashboard.reviews.new_negatives > 0 ? 'delta-down' : ''">
                  {{ dashboard.reviews.new_negatives > 0 ? dashboard.reviews.new_negatives + ' негат.' : 'нет негативных' }}
                </div>
              </div>
              <div class="kpi-card">
                <div class="kpi-label">Алерты</div>
                <div class="kpi-value">{{ dashboard.alerts.unread }}</div>
                <div class="kpi-delta" :class="dashboard.alerts.unread > 0 ? 'delta-down' : ''">
                  {{ dashboard.alerts.unread > 0 ? 'непрочитанных' : 'все прочитаны' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Chart -->
          <div v-if="dashboard && dashboard.daily && dashboard.daily.length > 1" class="section">
            <div class="chart-metrics">
              <button v-for="m in chartMetrics" :key="m.key"
                class="chart-metric-btn" :class="{ active: chartMetric === m.key }"
                :style="chartMetric === m.key ? { background: m.color, borderColor: m.color, color: '#fff' } : {}"
                @click="chartMetric = m.key">
                {{ m.label }}
              </button>
            </div>
            <div class="chart-wrap">
              <Line :data="chartData" :options="chartOptions" />
            </div>
          </div>

          <!-- Products table -->
          <div class="section">
            <div class="section-header">
              <h2 class="section-title">Товары <span class="section-count">{{ dashboard?.products.length || 0 }}</span></h2>
              <div class="prod-per-page">
                <span class="per-page-label">На странице:</span>
                <select v-model.number="prodPerPage">
                  <option :value="10">10</option>
                  <option :value="30">30</option>
                  <option :value="50">50</option>
                </select>
              </div>
            </div>

            <div v-if="!dashboard || !dashboard.products.length" class="empty">
              Данные появятся после первого сбора или синхронизации.
            </div>
            <div v-else class="products-table-wrap">
              <table class="products-table">
                <thead>
                  <tr>
                    <th></th>
                    <th class="sortable" @click="setProdSort('title')">Товар{{ sortIndicator('title') }}</th>
                    <th class="sortable" @click="setProdSort('revenue')">Выручка{{ sortIndicator('revenue') }}</th>
                    <th class="sortable" @click="setProdSort('orders_count')">Заказы{{ sortIndicator('orders_count') }}</th>
                    <th class="sortable" @click="setProdSort('stock_qty')">Остаток{{ sortIndicator('stock_qty') }}</th>
                    <th class="sortable" @click="setProdSort('price')">Цена{{ sortIndicator('price') }}</th>
                    <th class="sortable" @click="setProdSort('final_price')">Со скидкой{{ sortIndicator('final_price') }}</th>
                    <th class="sortable" @click="setProdSort('margin')">Маржа{{ sortIndicator('margin') }}</th>
                  </tr>
                </thead>
                <tbody v-for="p in paginatedProducts" :key="p.nm_id">
                  <tr class="product-row" :class="{ 'product-row-expanded': expandedNmId === p.nm_id }" @click="toggleExpand(p.nm_id)">
                    <td><img v-if="p.image_url" :src="p.image_url" class="product-img" /></td>
                    <td>
                      <div class="product-article-row">
                        <span>{{ p.title || '—' }}</span>
                        <a v-if="p.nm_id > 0" :href="`https://www.wildberries.ru/catalog/${p.nm_id}/detail.aspx`" target="_blank" rel="noopener" class="wb-link" title="Открыть на WB" @click.stop>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>
                      </div>
                      <div class="product-nmid">{{ p.nm_id > 0 ? p.nm_id : 'ручной' }}</div>
                    </td>
                    <td>
                      <div>{{ fmtMoney(p.revenue) }} &#8381;</div>
                      <div class="kpi-delta-sm" :class="deltaClass(p.revenue, p.revenue_prev)">{{ delta(p.revenue, p.revenue_prev) }}</div>
                    </td>
                    <td>
                      <div>{{ p.orders_count }}</div>
                      <div class="kpi-delta-sm" :class="deltaClass(p.orders_count, p.orders_prev)">{{ delta(p.orders_count, p.orders_prev) }}</div>
                    </td>
                    <td :class="p.stock_qty > 0 && p.stock_qty < 10 ? 'stock-low' : ''">{{ p.stock_qty }}</td>
                    <td>{{ p.price ? p.price + ' ₽' : '—' }}</td>
                    <td>{{ p.final_price ? p.final_price + ' ₽' : '—' }}</td>
                    <td :class="p.margin !== null && p.margin < 20 ? 'margin-low' : ''">{{ p.margin !== null ? p.margin + '%' : '—' }}</td>
                  </tr>
                  <tr v-if="expandedNmId === p.nm_id" class="product-expand-row">
                    <td :colspan="8">
                      <div class="product-expand">
                        <div class="expand-fields">
                          <div class="expand-field">
                            <span class="expand-label">Бренд</span>
                            <span>{{ getProduct(p.nm_id)?.brand || '—' }}</span>
                          </div>
                          <div class="expand-field">
                            <span class="expand-label">Артикул</span>
                            <span>{{ getProduct(p.nm_id)?.article || '—' }}</span>
                          </div>
                          <div class="expand-field">
                            <span class="expand-label">Себестоимость</span>
                            <template v-if="editingNmId === p.nm_id">
                              <input type="number" v-model.number="editForm.cost_price" class="cost-input"
                                @keydown.enter="saveEdit(p.nm_id)" @keydown.escape="cancelEdit" @click.stop />
                            </template>
                            <span v-else :class="{ 'cost-zero': !p.cost_price }">{{ p.cost_price ? p.cost_price + ' ₽' : '—' }}</span>
                          </div>
                          <div v-if="editingNmId === p.nm_id" class="expand-field">
                            <span class="expand-label">Название</span>
                            <input type="text" v-model="editForm.title" class="cost-input"
                              @keydown.enter="saveEdit(p.nm_id)" @keydown.escape="cancelEdit" @click.stop />
                          </div>
                        </div>
                        <div class="expand-actions" @click.stop>
                          <template v-if="editingNmId === p.nm_id">
                            <button class="btn btn-primary btn-sm" @click="saveEdit(p.nm_id)">Сохранить</button>
                            <button class="btn btn-secondary btn-sm" @click="cancelEdit">Отмена</button>
                          </template>
                          <template v-else>
                            <button class="btn btn-secondary btn-sm" @click="startEdit(getProduct(p.nm_id)!)">Редактировать</button>
                            <button class="btn btn-secondary btn-sm btn-danger-text" @click="removeProduct(getProduct(p.nm_id)!)">Удалить</button>
                          </template>
                        </div>

                        <!-- Reviews for this product -->
                        <div v-if="p.nm_id > 0" class="product-reviews" @click.stop>
                          <div class="product-reviews-header">
                            <span class="expand-label">Отзывы</span>
                            <span v-if="productReviews.length" class="reviews-count">{{ productReviews.length }}</span>
                          </div>
                          <div v-if="productReviewsLoading" class="reviews-loading">Загрузка отзывов...</div>
                          <div v-else-if="productReviews.length === 0" class="reviews-empty">Отзывов пока нет</div>
                          <div v-else class="reviews-list">
                            <div v-for="rv in productReviews" :key="rv.review_id" class="review-card" :class="{ 'review-negative': rv.sentiment === 'negative', 'review-new': rv.is_new }">
                              <div class="review-top">
                                <span class="review-rating" :class="rv.rating <= 2 ? 'rating-low' : rv.rating >= 4 ? 'rating-high' : ''">{{ ratingStars(rv.rating) }}</span>
                                <span v-if="rv.author" class="review-author">{{ rv.author }}</span>
                                <span class="review-date">{{ formatReviewDate(rv.review_date || rv.created_at) }}</span>
                                <span v-if="rv.sentiment" class="review-sentiment" :class="'sentiment-' + rv.sentiment">{{ sentimentLabel(rv.sentiment) }}</span>
                                <span v-if="rv.is_new" class="review-new-badge">new</span>
                              </div>
                              <div class="review-text">{{ rv.text }}</div>
                              <div v-if="rv.suggested_response" class="review-response">
                                <span class="expand-label">Рекомендация:</span> {{ rv.suggested_response }}
                              </div>
                              <button v-if="!rv.sentiment" class="btn btn-secondary btn-sm review-analyze-btn"
                                :disabled="analyzingReviewId === rv.review_id"
                                @click="analyzeReview(rv)">
                                {{ analyzingReviewId === rv.review_id ? 'Анализ...' : 'Анализировать' }}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="prodTotalPages > 1" class="prod-pagination">
                <button class="btn btn-secondary btn-sm" :disabled="prodPage <= 1" @click="prodPage--">&larr;</button>
                <span class="page-info">{{ prodPage }} / {{ prodTotalPages }}</span>
                <button class="btn btn-secondary btn-sm" :disabled="prodPage >= prodTotalPages" @click="prodPage++">&rarr;</button>
              </div>
            </div>
          </div>

          <!-- Alerts -->
          <div class="section">
            <div class="section-header">
              <h2 class="section-title">Уведомления</h2>
              <button v-if="unreadAlerts.length" class="btn btn-secondary btn-sm" @click="markAllRead">Прочитать все</button>
            </div>
            <div v-if="alerts.length === 0" class="empty">Уведомлений пока нет</div>
            <div v-else class="alerts-list">
              <div v-for="a in alerts" :key="a.id" class="alert-card" :class="{ 'alert-unread': !a.is_read, ['alert-' + a.severity]: true }">
                <div class="alert-header">
                  <span class="alert-severity">{{ a.severity === 'critical' ? '!!' : a.severity === 'warning' ? '!' : 'i' }}</span>
                  <strong>{{ a.title }}</strong>
                  <span class="alert-date">{{ formatDate(a.created_at) }}</span>
                </div>
                <div class="alert-desc">{{ a.description }}</div>
                <button v-if="!a.is_read" class="btn btn-secondary btn-sm" @click="markRead(a.id)">Прочитано</button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ==================== TAB: Отзывы ==================== -->
      <div v-if="tab === 'reviews'" class="tab-content">
        <div class="section">
          <div class="section-header">
            <h2 class="section-title">Отзывы</h2>
            <button class="btn btn-primary btn-sm" @click="runCollectReviews" :disabled="collectingReviews">
              {{ collectingReviews ? 'Сбор...' : 'Обновить отзывы' }}
            </button>
          </div>

          <div class="filters-bar" style="margin-bottom: 1rem;">
            <select v-model.number="reviewFilter.nm_id">
              <option :value="0">Все товары</option>
              <option v-for="[nmId, title] in reviewProducts" :key="nmId" :value="nmId">{{ title }}</option>
            </select>
            <select v-model="reviewFilter.sentiment">
              <option value="">Все настроения</option>
              <option value="positive">Позитивные</option>
              <option value="neutral">Нейтральные</option>
              <option value="negative">Негативные</option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="resetReviewFilters">Сбросить</button>
          </div>

          <div v-if="allReviewsLoading" class="empty">Загрузка...</div>
          <div v-else-if="allReviews.length === 0" class="empty">Отзывов пока нет. Нажмите «Обновить отзывы» для сбора.</div>
          <div v-else class="reviews-list reviews-list-full">
            <div v-for="rv in allReviews" :key="rv.review_id" class="review-card"
              :class="{ 'review-negative': rv.sentiment === 'negative', 'review-new': rv.is_new }">
              <div class="review-top">
                <span class="review-rating" :class="rv.rating <= 2 ? 'rating-low' : rv.rating >= 4 ? 'rating-high' : ''">{{ ratingStars(rv.rating) }}</span>
                <span v-if="rv.author" class="review-author">{{ rv.author }}</span>
                <span class="review-date">{{ formatReviewDate(rv.review_date || rv.created_at) }}</span>
                <span v-if="rv.sentiment" class="review-sentiment" :class="'sentiment-' + rv.sentiment">{{ sentimentLabel(rv.sentiment) }}</span>
                <span v-if="rv.is_new" class="review-new-badge">new</span>
                <a :href="`https://www.wildberries.ru/catalog/${rv.nm_id}/detail.aspx`" target="_blank" rel="noopener" class="review-product-link">{{ products.find(p => p.nm_id === rv.nm_id)?.title || rv.nm_id }}</a>
              </div>
              <div class="review-text">{{ rv.text }}</div>
              <div v-if="rv.suggested_response" class="review-response">
                <span class="expand-label">Рекомендация:</span> {{ rv.suggested_response }}
              </div>
              <button v-if="!rv.sentiment" class="btn btn-secondary btn-sm review-analyze-btn"
                :disabled="analyzingReviewId === rv.review_id"
                @click="analyzeReview(rv)">
                {{ analyzingReviewId === rv.review_id ? 'Анализ...' : 'Анализировать' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== TAB: Отчёты ==================== -->
      <div v-if="tab === 'reports'" class="tab-content">
        <!-- Actions -->
        <div class="section">
          <div class="section-header">
            <h2 class="section-title">Сформировать отчёт</h2>
          </div>
          <div class="report-actions">
            <button class="btn btn-primary btn-sm" @click="requestReport('daily')" :disabled="generating">
              {{ generating ? 'Формирование...' : 'Дневной отчёт' }}
            </button>
            <button class="btn btn-secondary btn-sm" @click="requestReport('weekly')" :disabled="generating">
              {{ generating ? 'Формирование...' : 'Недельный отчёт' }}
            </button>
          </div>
        </div>

        <!-- Schedule -->
        <div class="section">
          <h2 class="section-title">Расписание отчётов</h2>
          <div class="report-toggles">
            <label class="toggle-label">
              <input type="checkbox" :checked="config.daily_report_enabled === 1" @change="config.daily_report_enabled = ($event.target as HTMLInputElement).checked ? 1 : 0" />
              <span>Ежедневные отчёты</span>
            </label>
            <label class="toggle-label">
              <input type="checkbox" :checked="config.weekly_report_enabled === 1" @change="config.weekly_report_enabled = ($event.target as HTMLInputElement).checked ? 1 : 0" />
              <span>Еженедельные отчёты</span>
            </label>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Дневной отчёт (UTC)</label>
              <div class="schedule-time">
                <select v-model.number="config.schedule_report_hour" :disabled="!config.daily_report_enabled">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}</option>
                </select>
                <span class="schedule-colon">:</span>
                <select v-model.number="config.schedule_report_minute" :disabled="!config.daily_report_enabled">
                  <option v-for="m in 60" :key="m - 1" :value="m - 1">{{ String(m - 1).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>Недельный отчёт (UTC)</label>
              <div class="schedule-time">
                <select v-model.number="config.schedule_report_weekly_hour" :disabled="!config.weekly_report_enabled">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}</option>
                </select>
                <span class="schedule-colon">:</span>
                <select v-model.number="config.schedule_report_weekly_minute" :disabled="!config.weekly_report_enabled">
                  <option v-for="m in 60" :key="m - 1" :value="m - 1">{{ String(m - 1).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label>День недельного</label>
              <select v-model.number="config.report_weekly_day" :disabled="!config.weekly_report_enabled">
                <option v-for="d in 7" :key="d" :value="d">{{ weekDays[d] }}</option>
              </select>
            </div>
            <div class="field" style="align-self: flex-end">
              <button class="btn btn-secondary btn-sm" @click="saveConfig" :disabled="configSaving">
                {{ configSaving ? 'Сохранение...' : 'Сохранить' }}
              </button>
            </div>
          </div>
        </div>

        <!-- History -->
        <div class="section">
          <div class="section-header">
            <h2 class="section-title">История отчётов</h2>
          </div>
          <div v-if="reportsLoading" class="empty">Загрузка...</div>
          <div v-else-if="reports.length === 0" class="empty">Отчётов пока нет. Нажмите «Дневной отчёт» или дождитесь автоматической генерации.</div>
          <div v-else class="reports-list">
            <div v-for="r in reports" :key="r.id" class="report-card" :class="{ 'report-expanded': expandedReportId === r.id }" @click="toggleReport(r.id)">
              <div class="report-header">
                <span class="report-type-badge" :class="'report-type-' + r.type">{{ r.type === 'daily' ? 'Дневной' : 'Недельный' }}</span>
                <span class="report-period">{{ r.date_from }}{{ r.date_to && r.date_to !== r.date_from ? ' — ' + r.date_to : '' }}</span>
                <span class="report-status" :class="'status-' + r.status">{{ r.status === 'done' ? 'Готов' : r.status === 'generating' ? 'Формируется...' : 'Ошибка' }}</span>
                <span class="report-date">{{ formatReportDate(r.created_at) }}</span>
              </div>
              <div v-if="r.summary && expandedReportId !== r.id" class="report-summary" v-html="r.summary"></div>
              <div v-if="expandedReportId === r.id" class="report-content" v-html="expandedReportContent" @click.stop></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== TAB: Настройки ==================== -->
      <div v-if="tab === 'settings'" class="tab-content">
        <div class="settings-section">
          <h2 class="section-title">Wildberries API</h2>
          <div class="field">
            <label>API ключ WB Seller API</label>
            <p v-if="config.wb_api_key_masked" class="field-hint" style="margin-bottom: .35rem">
              Текущий ключ: <code>{{ config.wb_api_key_masked }}</code>
            </p>
            <div class="field-row-inline">
              <input type="password" v-model="config.wb_api_key" :placeholder="config.wb_api_key_set ? 'Введите новый ключ для замены' : 'Введите API ключ'" />
              <button class="btn btn-secondary btn-sm" @click="testApiKey" :disabled="testingKey">
                {{ testingKey ? 'Проверка...' : 'Проверить' }}
              </button>
            </div>
            <p v-if="testResult" :class="testResult.valid ? 'field-success' : 'field-error'">
              {{ testResult.valid ? 'Ключ валиден' : 'Ошибка: ' + testResult.error }}
            </p>
            <p class="field-hint">Получите ключ в личном кабинете WB с правами на статистику, рекламу, отзывы и цены.</p>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="section-title">Telegram уведомления</h2>
          <div class="field-row">
            <div class="field">
              <label>Bot Token</label>
              <p v-if="config.tg_bot_token_masked" class="field-hint" style="margin-bottom: .35rem">
                Текущий токен: <code>{{ config.tg_bot_token_masked }}</code>
              </p>
              <input type="password" v-model="config.tg_bot_token" :placeholder="config.tg_bot_token_set ? 'Введите новый токен для замены' : 'Токен бота'" />
            </div>
            <div class="field">
              <label>Chat ID</label>
              <input type="text" v-model="config.tg_chat_id" placeholder="123456789" />
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="section-title">Пороговые значения</h2>
          <div class="field-row">
            <div class="field">
              <label>ДРР порог (%)</label>
              <input type="number" v-model.number="config.drr_threshold" step="0.5" />
              <p class="field-hint">Уведомление при превышении</p>
            </div>
            <div class="field">
              <label>Мин. маржа (%)</label>
              <input type="number" v-model.number="config.margin_threshold" step="0.5" />
              <p class="field-hint">Порог рентабельности</p>
            </div>
            <div class="field">
              <label>Падение конверсии (%)</label>
              <input type="number" v-model.number="config.conversion_drop_pct" step="1" />
              <p class="field-hint">Относительно среднего за 7 дней</p>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="section-title">Расписание обновлений (UTC)</h2>
          <p class="field-hint" style="margin-bottom: .75rem">Укажите время запуска каждой задачи. Время не должно совпадать у разных задач.</p>
          <p v-if="scheduleDuplicateError" class="field-error" style="margin-bottom: .75rem">{{ scheduleDuplicateError }}</p>
          <div class="schedule-grid">
            <div v-for="task in scheduleTasks" :key="task.hourKey" class="schedule-row">
              <label class="schedule-toggle">
                <input type="checkbox" :checked="(config as any)[task.enabledKey] === 1"
                  @change="(config as any)[task.enabledKey] = ($event.target as HTMLInputElement).checked ? 1 : 0" />
              </label>
              <span class="schedule-label" :class="{ 'schedule-disabled': !(config as any)[task.enabledKey] }">{{ task.label }}</span>
              <div class="schedule-time">
                <select v-model.number="(config as any)[task.hourKey]" :disabled="!(config as any)[task.enabledKey]">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}</option>
                </select>
                <span class="schedule-colon">:</span>
                <select v-model.number="(config as any)[task.minuteKey]" :disabled="!(config as any)[task.enabledKey]">
                  <option v-for="m in 60" :key="m - 1" :value="m - 1">{{ String(m - 1).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="section-title">AI (OpenRouter)</h2>
          <div class="field">
            <label>OpenRouter API Key</label>
            <p v-if="config.openrouter_api_key_masked" class="field-hint" style="margin-bottom: .35rem">
              Текущий ключ: <code>{{ config.openrouter_api_key_masked }}</code>
            </p>
            <input type="password" v-model="config.openrouter_api_key" :placeholder="config.openrouter_api_key_set ? 'Введите новый ключ для замены' : 'sk-or-v1-...'" />
          </div>
        </div>

        <button class="btn btn-primary" @click="saveConfig" :disabled="configSaving">
          {{ configSaving ? 'Сохранение...' : 'Сохранить настройки' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb-page {
  min-height: 100vh;
  background: var(--bg-body);
  padding: 2rem 1rem;
}
.wb-container {
  max-width: 1100px;
  margin: 0 auto;
}
.wb-header { margin-bottom: 1.5rem; }
.page-title { font-size: 1.6rem; color: var(--text-primary); font-weight: 700; }

/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 1.5rem; }
.tab {
  padding: .6rem 1.2rem; background: none; border: none; cursor: pointer;
  color: var(--text-secondary); font-size: .95rem; border-bottom: 2px solid transparent;
  margin-bottom: -2px; transition: all .15s; display: flex; align-items: center; gap: .4rem;
}
.tab:hover { color: var(--text-primary); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.tab-badge { background: var(--bg-input); color: var(--text-secondary); font-size: .75rem; padding: .1rem .45rem; border-radius: 10px; }
.tab-badge-accent { background: var(--accent); color: var(--accent-text, #fff); }

/* Toast */
.toast { position: fixed; top: 1.2rem; right: 1.2rem; padding: .7rem 1.2rem; border-radius: 8px; font-size: .9rem; z-index: 100; cursor: pointer; }
.toast-success { background: var(--success, #22c55e); color: #fff; }
.toast-error { background: var(--danger, #ef4444); color: #fff; }
.toast-enter-active, .toast-leave-active { transition: opacity .3s, transform .3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-10px); }

/* Sections */
.section { margin-bottom: 1.5rem; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; flex-wrap: wrap; gap: .5rem; }
.section-title { font-size: 1.1rem; color: var(--text-primary); font-weight: 600; margin: 0; }
.empty { text-align: center; color: var(--text-muted); padding: 2rem; }

/* Reports */
.report-toggles { display: flex; gap: 1.5rem; margin-bottom: .75rem; }
.toggle-label { display: flex; align-items: center; gap: .5rem; cursor: pointer; font-size: .85rem; color: var(--text-body); font-weight: 500; }
.toggle-label input[type="checkbox"] { width: auto; accent-color: var(--accent); }
.report-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
.reports-list { display: flex; flex-direction: column; gap: .5rem; }
.report-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .75rem 1rem; cursor: pointer; transition: border-color .15s;
}
.report-card:hover { border-color: var(--text-muted); }
.report-expanded { border-color: var(--accent); }
.report-header { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; font-size: .88rem; }
.report-type-badge {
  padding: .15rem .5rem; border-radius: 4px; font-size: .75rem; font-weight: 600; text-transform: uppercase;
}
.report-type-daily { background: #6366f120; color: #6366f1; }
.report-type-weekly { background: #22c55e20; color: #22c55e; }
.report-period { font-weight: 600; color: var(--text-primary); }
.report-status { font-size: .78rem; }
.status-done { color: var(--success, #22c55e); }
.status-generating { color: #eab308; }
.status-error { color: var(--danger, #ef4444); }
.report-date { margin-left: auto; font-size: .75rem; color: var(--text-muted); }
.report-summary { font-size: .85rem; color: var(--text-secondary); margin-top: .4rem; }
.report-content {
  margin-top: .6rem; padding-top: .6rem; border-top: 1px solid var(--border);
  font-size: .85rem; color: var(--text-body); line-height: 1.5; cursor: text;
}
.report-content b { font-weight: 600; }
.report-content code { background: var(--bg-input); padding: .1rem .3rem; border-radius: 3px; font-size: .82rem; }

/* Settings */
.settings-section { margin-bottom: 1.5rem; }
.settings-section .section-title { margin-bottom: .75rem; }
.field { margin-bottom: .75rem; }
.field label { display: block; font-size: .85rem; color: var(--text-secondary); margin-bottom: .3rem; }
.field input, .field select, .field textarea {
  width: 100%; padding: .5rem .7rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .88rem;
}
.field textarea { resize: vertical; }
.field-hint { font-size: .78rem; color: var(--text-muted); margin-top: .25rem; }
.field-success { font-size: .82rem; color: var(--success, #22c55e); margin-top: .25rem; }
.field-error { font-size: .82rem; color: var(--danger, #ef4444); margin-top: .25rem; }
.field-row { display: flex; gap: 1rem; flex-wrap: wrap; }
.field-row > .field { flex: 1; min-width: 180px; }
.field-row-inline { display: flex; gap: .5rem; align-items: center; }
.field-row-inline input { flex: 1; }

/* API Key */
.api-key-row { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; }
.api-key-value { font-size: .85rem; padding: .4rem .6rem; background: var(--bg-input); border-radius: 6px; border: 1px solid var(--border); word-break: break-all; }

/* Date range bar */
.date-range-bar {
  display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .6rem 1rem;
}
.date-presets { display: flex; gap: .35rem; }
.date-inputs { display: flex; align-items: center; gap: .4rem; }
.date-inputs input[type="date"] {
  padding: .35rem .5rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .85rem;
}
.date-sep { color: var(--text-muted); font-size: .85rem; }
.date-compare-hint { font-size: .78rem; color: var(--text-muted); }

/* Chart */
.chart-metrics { display: flex; gap: .35rem; flex-wrap: wrap; margin-bottom: .75rem; }
.chart-metric-btn {
  padding: .3rem .7rem; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;
  background: var(--bg-surface); color: var(--text-secondary); font-size: .82rem; transition: all .15s;
}
.chart-metric-btn:hover { border-color: var(--text-muted); }
.chart-metric-btn.active { font-weight: 600; }
.chart-wrap {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .75rem; height: 260px;
}

/* KPI Grid */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: .75rem; margin-bottom: .5rem; }
.kpi-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .75rem 1rem; display: flex; flex-direction: column; gap: .2rem;
}
.kpi-label { font-size: .78rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; }
.kpi-value { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); }
.kpi-delta { font-size: .8rem; color: var(--text-muted); }
.kpi-delta-sm { font-size: .72rem; }
.delta-up { color: var(--success, #22c55e); }
.delta-down { color: var(--danger, #ef4444); }
.stock-low { color: var(--danger, #ef4444); font-weight: 600; }
.margin-low { color: #eab308; font-weight: 600; }

/* Alerts */
.alerts-list { display: flex; flex-direction: column; gap: .5rem; }
.alert-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .75rem 1rem; display: flex; flex-direction: column; gap: .4rem;
}
.alert-unread { border-left: 3px solid var(--accent); }
.alert-critical { border-left-color: var(--danger, #ef4444); }
.alert-warning { border-left-color: #eab308; }
.alert-info { border-left-color: var(--accent); }
.alert-header { display: flex; align-items: center; gap: .5rem; font-size: .9rem; }
.alert-severity { font-weight: 700; font-size: .8rem; min-width: 20px; text-align: center; }
.alert-critical .alert-severity { color: var(--danger, #ef4444); }
.alert-warning .alert-severity { color: #eab308; }
.alert-info .alert-severity { color: var(--accent); }
.alert-date { margin-left: auto; font-size: .75rem; color: var(--text-muted); }
.alert-desc { font-size: .85rem; color: var(--text-secondary); }

/* Products table */
.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
.sortable:hover { color: var(--text-primary); }
.prod-per-page { display: flex; align-items: center; gap: .4rem; }
.per-page-label { font-size: .82rem; color: var(--text-secondary); }
.prod-per-page select {
  padding: .25rem .4rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .82rem;
}
.prod-pagination { display: flex; align-items: center; justify-content: center; gap: .75rem; margin-top: .75rem; }
.prod-pagination .page-info { font-size: .85rem; color: var(--text-secondary); }
.products-table-wrap { overflow-x: auto; }
.products-table {
  width: 100%; border-collapse: collapse; font-size: .88rem;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
}
.products-table th, .products-table td {
  padding: .6rem .75rem; text-align: left; border-bottom: 1px solid var(--border);
}
.products-table th { font-weight: 600; color: var(--text-secondary); font-size: .8rem; background: var(--bg-input); }
.product-img { width: 40px; height: 40px; border-radius: 4px; object-fit: cover; }
.product-article-row { display: flex; align-items: center; gap: .35rem; }
.product-article-row span { font-weight: 600; color: var(--text-primary); }
.wb-link { color: var(--text-muted); display: flex; transition: color .15s; }
.wb-link:hover { color: var(--accent); }
.product-article { font-weight: 600; color: var(--text-primary); }
.product-nmid { font-size: .75rem; color: var(--text-muted); }
.cost-input { width: 120px; padding: .3rem .5rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-input); color: var(--text-body); font-size: .85rem; }
.cost-zero { color: var(--text-muted); }
.section-count { font-size: .8rem; color: var(--text-muted); font-weight: 400; margin-left: .3rem; }

/* Expandable product rows */
.product-row { cursor: pointer; transition: background .15s; }
.product-row:hover { background: var(--bg-input); }
.product-row-expanded { background: var(--bg-input); }
.product-expand-row td { padding: 0 !important; border-bottom: 1px solid var(--border); }
.product-expand {
  padding: .75rem 1rem; background: var(--bg-body);
  display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; flex-wrap: wrap;
}
.expand-fields { display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; }
.expand-field { display: flex; align-items: center; gap: .4rem; font-size: .85rem; }
.expand-label { color: var(--text-muted); font-size: .78rem; }
.expand-actions { display: flex; gap: .4rem; align-items: center; }
.btn-danger-text { color: var(--danger, #ef4444); }
.btn-danger-text:hover { background: var(--danger, #ef4444); color: #fff; }

/* Bulk import */
.bulk-import {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 1rem; margin-bottom: 1rem;
}

/* Toolbar */
.toolbar-right { display: flex; align-items: center; gap: .5rem; }

/* Buttons */
.btn { padding: .5rem 1rem; border: none; border-radius: 6px; cursor: pointer; font-size: .88rem; transition: opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: var(--accent-text, #fff); }
.btn-secondary { background: var(--bg-input); color: var(--text-body); border: 1px solid var(--border); }
.btn-sm { padding: .35rem .7rem; font-size: .82rem; }
.btn-icon { background: none; border: none; cursor: pointer; font-size: .9rem; color: var(--text-muted); padding: .2rem; }
.btn-icon:hover { color: var(--text-primary); }
.btn-icon-danger:hover { color: #e74c3c; }
.actions-cell { display: flex; gap: .3rem; align-items: center; }

/* Product reviews in expanded row */
.product-reviews { width: 100%; margin-top: .75rem; padding-top: .75rem; border-top: 1px solid var(--border); }
.product-reviews-header { display: flex; align-items: center; gap: .4rem; margin-bottom: .5rem; }
.reviews-count { font-size: .75rem; color: var(--text-muted); background: var(--bg-input); padding: .1rem .4rem; border-radius: 10px; }
.reviews-loading, .reviews-empty { font-size: .82rem; color: var(--text-muted); padding: .3rem 0; }
.reviews-list { display: flex; flex-direction: column; gap: .5rem; max-height: 400px; overflow-y: auto; }
.review-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
  padding: .5rem .75rem; font-size: .84rem;
}
.review-negative { border-left: 3px solid var(--danger, #ef4444); }
.review-new { border-left: 3px solid var(--accent); }
.review-top { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-bottom: .3rem; }
.review-rating { font-size: .82rem; letter-spacing: 1px; }
.rating-high { color: #22c55e; }
.rating-low { color: var(--danger, #ef4444); }
.review-author { font-weight: 600; color: var(--text-primary); font-size: .8rem; }
.review-date { font-size: .75rem; color: var(--text-muted); }
.review-sentiment { font-size: .72rem; padding: .1rem .4rem; border-radius: 4px; font-weight: 600; }
.sentiment-positive { background: #22c55e20; color: #22c55e; }
.sentiment-negative { background: #ef444420; color: #ef4444; }
.sentiment-neutral { background: #6366f120; color: #6366f1; }
.review-new-badge { font-size: .68rem; padding: .1rem .35rem; border-radius: 4px; background: var(--accent); color: #fff; font-weight: 600; text-transform: uppercase; }
.review-text { color: var(--text-body); line-height: 1.45; margin-bottom: .3rem; }
.review-response { font-size: .8rem; color: var(--text-secondary); background: var(--bg-input); padding: .4rem .6rem; border-radius: 4px; margin-top: .3rem; line-height: 1.4; }
.review-analyze-btn { margin-top: .3rem; }
.reviews-list-full { max-height: none; }
.review-product-badge { font-size: .72rem; background: var(--bg-input); color: var(--text-secondary); padding: .1rem .4rem; border-radius: 4px; margin-left: auto; }
.review-product-link {
  font-size: .72rem; background: var(--bg-input); color: var(--accent, #6366f1); padding: .1rem .4rem;
  border-radius: 4px; margin-left: auto; text-decoration: none;
}
.review-product-link:hover { text-decoration: underline; }

/* Filters bar (reviews tab) */
.filters-bar {
  display: flex; gap: .5rem; flex-wrap: wrap; align-items: center;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .6rem .75rem;
}
.filters-bar select {
  padding: .35rem .5rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .82rem; min-width: 120px;
}

/* Schedule grid */
.schedule-grid { display: flex; flex-direction: column; gap: .5rem; }
.schedule-row {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .6rem 1rem;
}
.schedule-toggle { display: flex; align-items: center; }
.schedule-toggle input[type="checkbox"] { cursor: pointer; accent-color: var(--accent, #6366f1); }
.schedule-label { font-size: .88rem; color: var(--text-primary); font-weight: 500; flex: 1; }
.schedule-disabled { opacity: .45; }
.schedule-time { display: flex; align-items: center; gap: .3rem; }
.schedule-time select {
  width: 60px; padding: .35rem .4rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .88rem; text-align: center;
}
.schedule-colon { font-weight: 700; color: var(--text-secondary); font-size: 1rem; }
</style>
