<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type WbConfig, type WbProduct, type WbAlert } from '@/api'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js'
import {
  TrendingUp, TrendingDown, ShoppingCart, RotateCcw, Boxes,
  Star, BellRing, RefreshCw, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight, Pencil, Trash2, Plus, Upload,
  ExternalLink, Sparkles, Calendar, Clock, Download, Filter,
  X, Check, AlertTriangle, Info, AlertCircle, Eye, EyeOff,
} from 'lucide-vue-next'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const route = useRoute()
const router = useRouter()

type Tab = 'dashboard' | 'reviews' | 'reports' | 'settings'
const tab = ref<Tab>((route.query.tab as Tab) || 'dashboard')

watch(() => route.query.tab, (newTab) => {
  const t = (newTab as Tab) || 'dashboard'
  if (t !== tab.value) {
    tab.value = t
    if (t === 'reviews') loadAllReviews()
    if (t === 'reports') loadReports()
    if (t === 'dashboard') { loadAlerts(); loadDashboard() }
  }
})
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
  <div class="wb-analytics">
    <!-- Page header -->
    <div class="flex items-center justify-between mb-1">
      <h2 class="font-bold text-[28px] leading-[35px] text-gray-1100 dark:text-gray-dark-1100 capitalize">
        {{ tab === 'dashboard' ? 'Дашборд' : tab === 'reviews' ? 'Отзывы' : tab === 'reports' ? 'Отчёты' : 'Настройки' }}
      </h2>
    </div>

    <!-- Breadcrumb -->
    <div class="flex items-center text-xs text-gray-500 dark:text-gray-dark-500 gap-x-[11px] mb-7">
      <span class="capitalize">WB Аналитика</span>
      <span class="text-gray-300">/</span>
      <span class="capitalize" style="color: var(--color-brands)">
        {{ tab === 'dashboard' ? 'Дашборд' : tab === 'reviews' ? 'Отзывы' : tab === 'reports' ? 'Отчёты' : 'Настройки' }}
      </span>
    </div>

      <!-- Toast -->
      <Transition name="toast">
        <div v-if="toast" class="frox-toast" :class="'frox-toast-' + toast.type" @click="toast = null">
          <Check v-if="toast.type === 'success'" :size="16" />
          <AlertCircle v-else :size="16" />
          {{ toast.text }}
        </div>
      </Transition>

      <!-- ==================== TAB: Дашборд ==================== -->
      <div v-if="tab === 'dashboard'">
        <div v-if="loading || dashboardLoading" class="frox-empty">Загрузка...</div>
        <template v-else>
          <!-- Date range bar -->
          <div class="frox-card frox-toolbar">
            <div class="flex items-center gap-2 flex-wrap">
              <button v-for="preset in [{d:1,l:'Вчера'},{d:7,l:'7 дней'},{d:14,l:'14 дней'},{d:30,l:'30 дней'}]" :key="preset.d"
                class="frox-btn frox-btn-outline frox-btn-sm" @click="setPreset(preset.d)">
                {{ preset.l }}
              </button>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <div class="flex items-center gap-2">
                <Calendar :size="14" class="text-gray-400" />
                <input type="date" v-model="dateFrom" @change="onDateChange" :max="dateTo" class="frox-date-input" />
                <span class="text-gray-400 text-desc">&mdash;</span>
                <input type="date" v-model="dateTo" @change="onDateChange" :min="dateFrom" :max="defaultDate" class="frox-date-input" />
              </div>
              <button class="frox-btn frox-btn-brand frox-btn-sm" @click="runCollect" :disabled="collecting || collectCooldown > 0">
                <RefreshCw :size="14" :class="{ 'animate-spin': collecting }" />
                {{ collecting ? 'Сбор...' : collectCooldown > 0 ? `${collectCooldown}с` : 'Собрать' }}
              </button>
              <button class="frox-btn frox-btn-outline frox-btn-sm" @click="syncProducts" :disabled="syncing">
                <Download :size="14" />
                {{ syncing ? 'Синхронизация...' : 'Синхронизировать' }}
              </button>
            </div>
          </div>

          <!-- Summary KPI cards -->
          <div class="mb-6">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100">
                Сводка за {{ dashboard?.date_from === dashboard?.date_to ? dashboard?.date_from : dashboard?.date_from + ' — ' + dashboard?.date_to }}
              </h3>
              <span v-if="dashboard" class="text-desc text-gray-400 dark:text-gray-dark-400">
                сравнение с {{ dashboard.date_prev_from === dashboard.date_prev_to ? dashboard.date_prev_from : dashboard.date_prev_from + ' — ' + dashboard.date_prev_to }}
              </span>
            </div>

            <div v-if="!dashboard || !dashboard.products.length" class="frox-empty">
              Данные появятся после первого сбора. Нажмите «Собрать» или дождитесь cron (07:00).
            </div>

            <div v-else class="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <!-- Revenue -->
              <div class="frox-stat-card">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-desc text-gray-500 dark:text-gray-dark-500">Выручка</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="frox-stat-icon" style="background: var(--bg-10)"><TrendingUp :size="16" style="color: var(--violet-accent)" /></div>
                    <p class="text-btn-label font-bold text-gray-1100 dark:text-gray-dark-1100">{{ fmtMoney(dashboard.totals.revenue) }} &#8381;</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <ArrowUpRight v-if="dashboard.totals.revenue >= dashboard.totals.revenue_prev" :size="14" class="text-green" />
                    <ArrowDownRight v-else :size="14" class="text-red" />
                    <span class="text-subtitle font-medium" :class="dashboard.totals.revenue >= dashboard.totals.revenue_prev ? 'kpi-up' : 'kpi-down'">
                      {{ delta(dashboard.totals.revenue, dashboard.totals.revenue_prev) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Orders -->
              <div class="frox-stat-card">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-desc text-gray-500 dark:text-gray-dark-500">Заказы</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="frox-stat-icon" style="background: var(--bg-5)"><ShoppingCart :size="16" style="color: var(--green-accent)" /></div>
                    <p class="text-btn-label font-bold text-gray-1100 dark:text-gray-dark-1100">{{ dashboard.totals.orders }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <ArrowUpRight v-if="dashboard.totals.orders >= dashboard.totals.orders_prev" :size="14" class="text-green" />
                    <ArrowDownRight v-else :size="14" class="text-red" />
                    <span class="text-subtitle font-medium" :class="dashboard.totals.orders >= dashboard.totals.orders_prev ? 'kpi-up' : 'kpi-down'">
                      {{ delta(dashboard.totals.orders, dashboard.totals.orders_prev) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Returns -->
              <div class="frox-stat-card">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-desc text-gray-500 dark:text-gray-dark-500">Возвраты</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="frox-stat-icon" style="background: var(--bg-3)"><RotateCcw :size="16" style="color: var(--red-accent)" /></div>
                    <p class="text-btn-label font-bold text-gray-1100 dark:text-gray-dark-1100">{{ dashboard.totals.returns }}</p>
                  </div>
                  <span class="text-desc text-gray-400">
                    {{ dashboard.totals.sales ? ((dashboard.totals.returns / dashboard.totals.sales) * 100).toFixed(1) + '%' : '—' }}
                  </span>
                </div>
              </div>

              <!-- Stock -->
              <div class="frox-stat-card">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-desc text-gray-500 dark:text-gray-dark-500">Остатки</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="frox-stat-icon" style="background: var(--bg-9)"><Boxes :size="16" style="color: var(--blue-accent)" /></div>
                    <p class="text-btn-label font-bold text-gray-1100 dark:text-gray-dark-1100">{{ dashboard.stock.total_qty }}</p>
                  </div>
                  <span class="text-desc" :class="dashboard.stock.low_stock_count > 0 ? 'kpi-down' : 'text-gray-400'">
                    {{ dashboard.stock.low_stock_count > 0 ? dashboard.stock.low_stock_count + ' мало' : 'OK' }}
                  </span>
                </div>
              </div>

              <!-- Rating -->
              <div class="frox-stat-card">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-desc text-gray-500 dark:text-gray-dark-500">Рейтинг</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="frox-stat-icon" style="background: var(--bg-2)"><Star :size="16" style="color: var(--orange-accent)" /></div>
                    <p class="text-btn-label font-bold text-gray-1100 dark:text-gray-dark-1100">{{ dashboard.reviews.avg_rating }}</p>
                  </div>
                  <span class="text-desc" :class="dashboard.reviews.new_negatives > 0 ? 'kpi-down' : 'text-gray-400'">
                    {{ dashboard.reviews.new_negatives > 0 ? dashboard.reviews.new_negatives + ' негат.' : 'OK' }}
                  </span>
                </div>
              </div>

              <!-- Alerts -->
              <div class="frox-stat-card">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-desc text-gray-500 dark:text-gray-dark-500">Алерты</p>
                </div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="frox-stat-icon" style="background: var(--bg-4)"><BellRing :size="16" style="color: var(--fuchsia-accent)" /></div>
                    <p class="text-btn-label font-bold text-gray-1100 dark:text-gray-dark-1100">{{ dashboard.alerts.unread }}</p>
                  </div>
                  <span class="text-desc" :class="dashboard.alerts.unread > 0 ? 'kpi-down' : 'text-gray-400'">
                    {{ dashboard.alerts.unread > 0 ? 'непрочитанных' : 'все OK' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Chart -->
          <div v-if="dashboard && dashboard.daily && dashboard.daily.length > 1" class="frox-card mb-6 p-5">
            <div class="flex items-center gap-2 flex-wrap mb-4">
              <button v-for="m in chartMetrics" :key="m.key"
                class="frox-chip"
                :class="{ 'frox-chip-active': chartMetric === m.key }"
                :style="chartMetric === m.key ? { background: m.color, borderColor: m.color, color: '#fff' } : {}"
                @click="chartMetric = m.key">
                {{ m.label }}
              </button>
            </div>
            <div style="height: 280px;">
              <Line :data="chartData" :options="chartOptions" />
            </div>
          </div>

          <!-- Products table -->
          <div class="frox-card mb-6">
            <div class="flex items-center justify-between p-5 pb-0">
              <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100">
                Товары <span class="text-desc text-gray-400 font-normal ml-1">{{ dashboard?.products.length || 0 }}</span>
              </h3>
              <div class="flex items-center gap-3">
                <span class="text-desc text-gray-500">На странице:</span>
                <select v-model.number="prodPerPage" class="frox-select-sm">
                  <option :value="10">10</option>
                  <option :value="30">30</option>
                  <option :value="50">50</option>
                </select>
              </div>
            </div>

            <div v-if="!dashboard || !dashboard.products.length" class="frox-empty">
              Данные появятся после первого сбора или синхронизации.
            </div>
            <div v-else class="overflow-x-auto scrollbar-hide">
              <table class="frox-table">
                <thead>
                  <tr>
                    <th style="width: 48px;"></th>
                    <th class="frox-th-sort" @click="setProdSort('title')">Товар{{ sortIndicator('title') }}</th>
                    <th class="frox-th-sort" @click="setProdSort('revenue')">Выручка{{ sortIndicator('revenue') }}</th>
                    <th class="frox-th-sort" @click="setProdSort('orders_count')">Заказы{{ sortIndicator('orders_count') }}</th>
                    <th class="frox-th-sort" @click="setProdSort('stock_qty')">Остаток{{ sortIndicator('stock_qty') }}</th>
                    <th class="frox-th-sort" @click="setProdSort('price')">Цена{{ sortIndicator('price') }}</th>
                    <th class="frox-th-sort" @click="setProdSort('final_price')">Со скидкой{{ sortIndicator('final_price') }}</th>
                    <th class="frox-th-sort" @click="setProdSort('margin')">Маржа{{ sortIndicator('margin') }}</th>
                  </tr>
                </thead>
                <tbody v-for="p in paginatedProducts" :key="p.nm_id">
                  <tr class="frox-row" :class="{ 'frox-row-active': expandedNmId === p.nm_id }" @click="toggleExpand(p.nm_id)">
                    <td><img v-if="p.image_url" :src="p.image_url" class="w-10 h-10 rounded-lg object-cover" /></td>
                    <td>
                      <div class="flex items-center gap-1.5">
                        <span class="font-semibold text-gray-1100 dark:text-gray-dark-1100">{{ p.title || '—' }}</span>
                        <a v-if="p.nm_id > 0" :href="`https://www.wildberries.ru/catalog/${p.nm_id}/detail.aspx`" target="_blank" rel="noopener" class="text-gray-300 hover:text-color-brands transition-colors" @click.stop>
                          <ExternalLink :size="13" />
                        </a>
                      </div>
                      <div class="text-mini-desc text-gray-400">{{ p.nm_id > 0 ? p.nm_id : 'ручной' }}</div>
                    </td>
                    <td>
                      <div class="font-medium">{{ fmtMoney(p.revenue) }} &#8381;</div>
                      <div class="text-mini-desc" :class="deltaClass(p.revenue, p.revenue_prev) === 'delta-up' ? 'kpi-up' : deltaClass(p.revenue, p.revenue_prev) === 'delta-down' ? 'kpi-down' : 'text-gray-400'">{{ delta(p.revenue, p.revenue_prev) }}</div>
                    </td>
                    <td>
                      <div>{{ p.orders_count }}</div>
                      <div class="text-mini-desc" :class="deltaClass(p.orders_count, p.orders_prev) === 'delta-up' ? 'kpi-up' : deltaClass(p.orders_count, p.orders_prev) === 'delta-down' ? 'kpi-down' : 'text-gray-400'">{{ delta(p.orders_count, p.orders_prev) }}</div>
                    </td>
                    <td :class="p.stock_qty > 0 && p.stock_qty < 10 ? 'kpi-down font-semibold' : ''">{{ p.stock_qty }}</td>
                    <td>{{ p.price ? p.price + ' ₽' : '—' }}</td>
                    <td>{{ p.final_price ? p.final_price + ' ₽' : '—' }}</td>
                    <td :class="p.margin !== null && p.margin < 20 ? 'kpi-warn font-semibold' : ''">{{ p.margin !== null ? p.margin + '%' : '—' }}</td>
                  </tr>
                  <tr v-if="expandedNmId === p.nm_id">
                    <td :colspan="8" class="!p-0">
                      <div class="frox-expand-panel">
                        <div class="flex items-center gap-6 flex-wrap">
                          <div class="frox-expand-field">
                            <span class="frox-expand-label">Бренд</span>
                            <span>{{ getProduct(p.nm_id)?.brand || '—' }}</span>
                          </div>
                          <div class="frox-expand-field">
                            <span class="frox-expand-label">Артикул</span>
                            <span>{{ getProduct(p.nm_id)?.article || '—' }}</span>
                          </div>
                          <div class="frox-expand-field">
                            <span class="frox-expand-label">Себестоимость</span>
                            <template v-if="editingNmId === p.nm_id">
                              <input type="number" v-model.number="editForm.cost_price" class="frox-input-inline"
                                @keydown.enter="saveEdit(p.nm_id)" @keydown.escape="cancelEdit" @click.stop />
                            </template>
                            <span v-else :class="{ 'text-gray-300': !p.cost_price }">{{ p.cost_price ? p.cost_price + ' ₽' : '—' }}</span>
                          </div>
                          <div v-if="editingNmId === p.nm_id" class="frox-expand-field">
                            <span class="frox-expand-label">Название</span>
                            <input type="text" v-model="editForm.title" class="frox-input-inline"
                              @keydown.enter="saveEdit(p.nm_id)" @keydown.escape="cancelEdit" @click.stop />
                          </div>
                        </div>
                        <div class="flex gap-2 items-center" @click.stop>
                          <template v-if="editingNmId === p.nm_id">
                            <button class="frox-btn frox-btn-brand frox-btn-sm" @click="saveEdit(p.nm_id)"><Check :size="14" /> Сохранить</button>
                            <button class="frox-btn frox-btn-outline frox-btn-sm" @click="cancelEdit"><X :size="14" /> Отмена</button>
                          </template>
                          <template v-else>
                            <button class="frox-btn frox-btn-outline frox-btn-sm" @click="startEdit(getProduct(p.nm_id)!)"><Pencil :size="13" /> Редактировать</button>
                            <button class="frox-btn frox-btn-outline frox-btn-sm frox-btn-danger" @click="removeProduct(getProduct(p.nm_id)!)"><Trash2 :size="13" /> Удалить</button>
                          </template>
                        </div>

                        <!-- Reviews for this product -->
                        <div v-if="p.nm_id > 0" class="w-full mt-4 pt-4 border-t border-neutral-accent dark:border-dark-neutral-border" @click.stop>
                          <div class="flex items-center gap-2 mb-3">
                            <span class="text-desc text-gray-400 font-semibold uppercase tracking-wider">Отзывы</span>
                            <span v-if="productReviews.length" class="frox-badge-count">{{ productReviews.length }}</span>
                          </div>
                          <div v-if="productReviewsLoading" class="text-desc text-gray-400">Загрузка отзывов...</div>
                          <div v-else-if="productReviews.length === 0" class="text-desc text-gray-400">Отзывов пока нет</div>
                          <div v-else class="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                            <div v-for="rv in productReviews" :key="rv.review_id" class="frox-review-card" :class="{ 'frox-review-negative': rv.sentiment === 'negative', 'frox-review-new': rv.is_new }">
                              <div class="flex items-center gap-2 flex-wrap mb-1">
                                <span class="text-desc tracking-wider" :class="rv.rating <= 2 ? 'kpi-down' : rv.rating >= 4 ? 'kpi-up' : ''">{{ ratingStars(rv.rating) }}</span>
                                <span v-if="rv.author" class="font-semibold text-desc text-gray-1100 dark:text-gray-dark-1100">{{ rv.author }}</span>
                                <span class="text-mini-desc text-gray-400">{{ formatReviewDate(rv.review_date || rv.created_at) }}</span>
                                <span v-if="rv.sentiment" class="frox-sentiment" :class="'frox-sentiment-' + rv.sentiment">{{ sentimentLabel(rv.sentiment) }}</span>
                                <span v-if="rv.is_new" class="frox-badge-new">new</span>
                              </div>
                              <div class="text-normal text-gray-1100 dark:text-gray-dark-1100 leading-relaxed">{{ rv.text }}</div>
                              <div v-if="rv.suggested_response" class="mt-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-dark-100 text-desc text-gray-600 dark:text-gray-dark-600">
                                <span class="font-semibold">Рекомендация:</span> {{ rv.suggested_response }}
                              </div>
                              <button v-if="!rv.sentiment" class="frox-btn frox-btn-outline frox-btn-sm mt-2"
                                :disabled="analyzingReviewId === rv.review_id"
                                @click="analyzeReview(rv)">
                                <Sparkles :size="13" />
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
              <div v-if="prodTotalPages > 1" class="flex items-center justify-center gap-3 p-4">
                <button class="frox-btn frox-btn-outline frox-btn-sm" :disabled="prodPage <= 1" @click="prodPage--">
                  <ChevronLeft :size="14" />
                </button>
                <span class="text-normal text-gray-500">{{ prodPage }} / {{ prodTotalPages }}</span>
                <button class="frox-btn frox-btn-outline frox-btn-sm" :disabled="prodPage >= prodTotalPages" @click="prodPage++">
                  <ChevronRight :size="14" />
                </button>
              </div>
            </div>
          </div>

          <!-- Alerts -->
          <div class="frox-card mb-6 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100">Уведомления</h3>
              <button v-if="unreadAlerts.length" class="frox-btn frox-btn-outline frox-btn-sm" @click="markAllRead">
                <Check :size="14" /> Прочитать все
              </button>
            </div>
            <div v-if="alerts.length === 0" class="frox-empty">Уведомлений пока нет</div>
            <div v-else class="flex flex-col gap-3">
              <div v-for="a in alerts" :key="a.id" class="frox-alert" :class="{ 'frox-alert-unread': !a.is_read, ['frox-alert-' + a.severity]: true }">
                <div class="flex items-center gap-2">
                  <AlertCircle v-if="a.severity === 'critical'" :size="16" class="text-red flex-shrink-0" />
                  <AlertTriangle v-else-if="a.severity === 'warning'" :size="16" style="color: var(--yellow-accent)" class="flex-shrink-0" />
                  <Info v-else :size="16" style="color: var(--color-brands)" class="flex-shrink-0" />
                  <strong class="text-normal text-gray-1100 dark:text-gray-dark-1100">{{ a.title }}</strong>
                  <span class="text-mini-desc text-gray-400 ml-auto whitespace-nowrap">{{ formatDate(a.created_at) }}</span>
                </div>
                <p class="text-desc text-gray-500 dark:text-gray-dark-500 mt-1">{{ a.description }}</p>
                <button v-if="!a.is_read" class="frox-btn frox-btn-outline frox-btn-sm mt-2" @click="markRead(a.id)">Прочитано</button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ==================== TAB: Отзывы ==================== -->
      <div v-if="tab === 'reviews'">
        <div class="frox-card p-5 mb-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100">Все отзывы</h3>
            <button class="frox-btn frox-btn-brand frox-btn-sm" @click="runCollectReviews" :disabled="collectingReviews">
              <RefreshCw :size="14" :class="{ 'animate-spin': collectingReviews }" />
              {{ collectingReviews ? 'Сбор...' : 'Обновить отзывы' }}
            </button>
          </div>

          <div class="frox-card frox-toolbar mb-4">
            <div class="flex items-center gap-3 flex-wrap">
              <Filter :size="14" class="text-gray-400" />
              <select v-model.number="reviewFilter.nm_id" class="frox-select-sm">
                <option :value="0">Все товары</option>
                <option v-for="[nmId, title] in reviewProducts" :key="nmId" :value="nmId">{{ title }}</option>
              </select>
              <select v-model="reviewFilter.sentiment" class="frox-select-sm">
                <option value="">Все настроения</option>
                <option value="positive">Позитивные</option>
                <option value="neutral">Нейтральные</option>
                <option value="negative">Негативные</option>
              </select>
              <button class="frox-btn frox-btn-outline frox-btn-sm" @click="resetReviewFilters">
                <X :size="13" /> Сбросить
              </button>
            </div>
          </div>

          <div v-if="allReviewsLoading" class="frox-empty">Загрузка...</div>
          <div v-else-if="allReviews.length === 0" class="frox-empty">Отзывов пока нет. Нажмите «Обновить отзывы» для сбора.</div>
          <div v-else class="flex flex-col gap-3">
            <div v-for="rv in allReviews" :key="rv.review_id" class="frox-review-card"
              :class="{ 'frox-review-negative': rv.sentiment === 'negative', 'frox-review-new': rv.is_new }">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <span class="text-desc tracking-wider" :class="rv.rating <= 2 ? 'kpi-down' : rv.rating >= 4 ? 'kpi-up' : ''">{{ ratingStars(rv.rating) }}</span>
                <span v-if="rv.author" class="font-semibold text-desc text-gray-1100 dark:text-gray-dark-1100">{{ rv.author }}</span>
                <span class="text-mini-desc text-gray-400">{{ formatReviewDate(rv.review_date || rv.created_at) }}</span>
                <span v-if="rv.sentiment" class="frox-sentiment" :class="'frox-sentiment-' + rv.sentiment">{{ sentimentLabel(rv.sentiment) }}</span>
                <span v-if="rv.is_new" class="frox-badge-new">new</span>
                <a :href="`https://www.wildberries.ru/catalog/${rv.nm_id}/detail.aspx`" target="_blank" rel="noopener"
                  class="ml-auto text-mini-desc px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-dark-100 hover:underline" style="color: var(--color-brands)">
                  {{ products.find(p => p.nm_id === rv.nm_id)?.title || rv.nm_id }}
                </a>
              </div>
              <div class="text-normal text-gray-1100 dark:text-gray-dark-1100 leading-relaxed">{{ rv.text }}</div>
              <div v-if="rv.suggested_response" class="mt-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-dark-100 text-desc text-gray-600 dark:text-gray-dark-600">
                <span class="font-semibold">Рекомендация:</span> {{ rv.suggested_response }}
              </div>
              <button v-if="!rv.sentiment" class="frox-btn frox-btn-outline frox-btn-sm mt-2"
                :disabled="analyzingReviewId === rv.review_id"
                @click="analyzeReview(rv)">
                <Sparkles :size="13" />
                {{ analyzingReviewId === rv.review_id ? 'Анализ...' : 'Анализировать' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== TAB: Отчёты ==================== -->
      <div v-if="tab === 'reports'">
        <!-- Actions -->
        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">Сформировать отчёт</h3>
          <div class="flex gap-3">
            <button class="frox-btn frox-btn-brand frox-btn-sm" @click="requestReport('daily')" :disabled="generating">
              <FileBarChart :size="14" />
              {{ generating ? 'Формирование...' : 'Дневной отчёт' }}
            </button>
            <button class="frox-btn frox-btn-outline frox-btn-sm" @click="requestReport('weekly')" :disabled="generating">
              <FileBarChart :size="14" />
              {{ generating ? 'Формирование...' : 'Недельный отчёт' }}
            </button>
          </div>
        </div>

        <!-- Schedule -->
        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">Расписание отчётов</h3>
          <div class="flex gap-6 mb-4">
            <label class="frox-toggle-label">
              <input type="checkbox" :checked="config.daily_report_enabled === 1" @change="config.daily_report_enabled = ($event.target as HTMLInputElement).checked ? 1 : 0" class="frox-checkbox" />
              <span>Ежедневные</span>
            </label>
            <label class="frox-toggle-label">
              <input type="checkbox" :checked="config.weekly_report_enabled === 1" @change="config.weekly_report_enabled = ($event.target as HTMLInputElement).checked ? 1 : 0" class="frox-checkbox" />
              <span>Еженедельные</span>
            </label>
          </div>
          <div class="flex gap-4 flex-wrap items-end">
            <div class="frox-field">
              <label class="frox-field-label">Дневной (UTC)</label>
              <div class="flex items-center gap-1">
                <select v-model.number="config.schedule_report_hour" :disabled="!config.daily_report_enabled" class="frox-select-sm">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}</option>
                </select>
                <span class="font-bold text-gray-500">:</span>
                <select v-model.number="config.schedule_report_minute" :disabled="!config.daily_report_enabled" class="frox-select-sm">
                  <option v-for="m in 60" :key="m - 1" :value="m - 1">{{ String(m - 1).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
            <div class="frox-field">
              <label class="frox-field-label">Недельный (UTC)</label>
              <div class="flex items-center gap-1">
                <select v-model.number="config.schedule_report_weekly_hour" :disabled="!config.weekly_report_enabled" class="frox-select-sm">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}</option>
                </select>
                <span class="font-bold text-gray-500">:</span>
                <select v-model.number="config.schedule_report_weekly_minute" :disabled="!config.weekly_report_enabled" class="frox-select-sm">
                  <option v-for="m in 60" :key="m - 1" :value="m - 1">{{ String(m - 1).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
            <div class="frox-field">
              <label class="frox-field-label">День недельного</label>
              <select v-model.number="config.report_weekly_day" :disabled="!config.weekly_report_enabled" class="frox-select-sm">
                <option v-for="d in 7" :key="d" :value="d">{{ weekDays[d] }}</option>
              </select>
            </div>
            <button class="frox-btn frox-btn-outline frox-btn-sm" @click="saveConfig" :disabled="configSaving">
              <Check :size="14" />
              {{ configSaving ? 'Сохранение...' : 'Сохранить' }}
            </button>
          </div>
        </div>

        <!-- History -->
        <div class="frox-card p-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">История отчётов</h3>
          <div v-if="reportsLoading" class="frox-empty">Загрузка...</div>
          <div v-else-if="reports.length === 0" class="frox-empty">Отчётов пока нет.</div>
          <div v-else class="flex flex-col gap-3">
            <div v-for="r in reports" :key="r.id"
              class="frox-report-card" :class="{ 'frox-report-expanded': expandedReportId === r.id }"
              @click="toggleReport(r.id)">
              <div class="flex items-center gap-3 flex-wrap">
                <span class="frox-report-badge" :class="'frox-report-' + r.type">{{ r.type === 'daily' ? 'Дневной' : 'Недельный' }}</span>
                <span class="font-semibold text-normal text-gray-1100 dark:text-gray-dark-1100">{{ r.date_from }}{{ r.date_to && r.date_to !== r.date_from ? ' — ' + r.date_to : '' }}</span>
                <span class="frox-status" :class="'frox-status-' + r.status">{{ r.status === 'done' ? 'Готов' : r.status === 'generating' ? 'Формируется...' : 'Ошибка' }}</span>
                <span class="text-mini-desc text-gray-400 ml-auto">{{ formatReportDate(r.created_at) }}</span>
              </div>
              <div v-if="r.summary && expandedReportId !== r.id" class="text-desc text-gray-500 mt-2" v-html="r.summary"></div>
              <div v-if="expandedReportId === r.id" class="mt-3 pt-3 border-t text-desc text-gray-1100 dark:text-gray-dark-1100 leading-relaxed cursor-text" style="border-color: var(--neutral-accent)" v-html="expandedReportContent" @click.stop></div>
            </div>
          </div>
        </div>
      </div>

      <!-- ==================== TAB: Настройки ==================== -->
      <div v-if="tab === 'settings'">
        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">Wildberries API</h3>
          <div class="frox-field mb-3">
            <label class="frox-field-label">API ключ WB Seller API</label>
            <p v-if="config.wb_api_key_masked" class="text-mini-desc text-gray-400 mb-1">
              Текущий: <code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-dark-100 text-mini-desc">{{ config.wb_api_key_masked }}</code>
            </p>
            <div class="flex gap-2 items-center">
              <input type="password" v-model="config.wb_api_key" :placeholder="config.wb_api_key_set ? 'Новый ключ для замены' : 'Введите API ключ'" class="frox-input flex-1" />
              <button class="frox-btn frox-btn-outline frox-btn-sm" @click="testApiKey" :disabled="testingKey">
                <Check :size="14" />
                {{ testingKey ? 'Проверка...' : 'Проверить' }}
              </button>
            </div>
            <p v-if="testResult" class="text-desc mt-1" :class="testResult.valid ? 'kpi-up' : 'kpi-down'">
              {{ testResult.valid ? 'Ключ валиден' : 'Ошибка: ' + testResult.error }}
            </p>
            <p class="text-mini-desc text-gray-400 mt-1">Получите ключ в ЛК WB с правами на статистику, рекламу, отзывы и цены.</p>
          </div>
        </div>

        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">Telegram уведомления</h3>
          <div class="flex gap-4 flex-wrap">
            <div class="frox-field flex-1 min-w-[200px]">
              <label class="frox-field-label">Bot Token</label>
              <p v-if="config.tg_bot_token_masked" class="text-mini-desc text-gray-400 mb-1">
                Текущий: <code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-dark-100 text-mini-desc">{{ config.tg_bot_token_masked }}</code>
              </p>
              <input type="password" v-model="config.tg_bot_token" :placeholder="config.tg_bot_token_set ? 'Новый токен для замены' : 'Токен бота'" class="frox-input" />
            </div>
            <div class="frox-field flex-1 min-w-[200px]">
              <label class="frox-field-label">Chat ID</label>
              <input type="text" v-model="config.tg_chat_id" placeholder="123456789" class="frox-input" />
            </div>
          </div>
        </div>

        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">Пороговые значения</h3>
          <div class="flex gap-4 flex-wrap">
            <div class="frox-field flex-1 min-w-[160px]">
              <label class="frox-field-label">ДРР порог (%)</label>
              <input type="number" v-model.number="config.drr_threshold" step="0.5" class="frox-input" />
              <p class="text-mini-desc text-gray-400 mt-1">Уведомление при превышении</p>
            </div>
            <div class="frox-field flex-1 min-w-[160px]">
              <label class="frox-field-label">Мин. маржа (%)</label>
              <input type="number" v-model.number="config.margin_threshold" step="0.5" class="frox-input" />
              <p class="text-mini-desc text-gray-400 mt-1">Порог рентабельности</p>
            </div>
            <div class="frox-field flex-1 min-w-[160px]">
              <label class="frox-field-label">Падение конверсии (%)</label>
              <input type="number" v-model.number="config.conversion_drop_pct" step="1" class="frox-input" />
              <p class="text-mini-desc text-gray-400 mt-1">Отн. среднего за 7 дней</p>
            </div>
          </div>
        </div>

        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-2">Расписание обновлений (UTC)</h3>
          <p class="text-desc text-gray-400 mb-4">Время не должно совпадать у разных задач.</p>
          <p v-if="scheduleDuplicateError" class="text-desc kpi-down mb-3">{{ scheduleDuplicateError }}</p>
          <div class="flex flex-col gap-2">
            <div v-for="task in scheduleTasks" :key="task.hourKey" class="frox-schedule-row">
              <label class="frox-toggle-label">
                <input type="checkbox" :checked="(config as any)[task.enabledKey] === 1"
                  @change="(config as any)[task.enabledKey] = ($event.target as HTMLInputElement).checked ? 1 : 0" class="frox-checkbox" />
              </label>
              <span class="text-normal font-medium text-gray-1100 dark:text-gray-dark-1100 flex-1" :class="{ 'opacity-40': !(config as any)[task.enabledKey] }">{{ task.label }}</span>
              <div class="flex items-center gap-1">
                <select v-model.number="(config as any)[task.hourKey]" :disabled="!(config as any)[task.enabledKey]" class="frox-select-sm w-[60px]">
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ String(h - 1).padStart(2, '0') }}</option>
                </select>
                <span class="font-bold text-gray-500">:</span>
                <select v-model.number="(config as any)[task.minuteKey]" :disabled="!(config as any)[task.enabledKey]" class="frox-select-sm w-[60px]">
                  <option v-for="m in 60" :key="m - 1" :value="m - 1">{{ String(m - 1).padStart(2, '0') }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="frox-card p-5 mb-5">
          <h3 class="text-header-7 font-semibold text-gray-1100 dark:text-gray-dark-1100 mb-4">AI (OpenRouter)</h3>
          <div class="frox-field">
            <label class="frox-field-label">OpenRouter API Key</label>
            <p v-if="config.openrouter_api_key_masked" class="text-mini-desc text-gray-400 mb-1">
              Текущий: <code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-dark-100 text-mini-desc">{{ config.openrouter_api_key_masked }}</code>
            </p>
            <input type="password" v-model="config.openrouter_api_key" :placeholder="config.openrouter_api_key_set ? 'Новый ключ для замены' : 'sk-or-v1-...'" class="frox-input" />
          </div>
        </div>

        <button class="frox-btn frox-btn-brand" @click="saveConfig" :disabled="configSaving">
          <Check :size="16" />
          {{ configSaving ? 'Сохранение...' : 'Сохранить настройки' }}
        </button>
      </div>
  </div>
</template>

<style scoped>
.wb-analytics { font-family: 'Noto Sans', sans-serif; }

/* Frox Card */
.frox-card {
  border-radius: 16px;
  border: 1px solid var(--neutral-accent);
  background: var(--neutral-bg);
}
.dark .frox-card {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
}

/* Frox Stat Card */
.frox-stat-card {
  border-radius: 16px;
  border: 1px solid var(--neutral-accent);
  background: var(--neutral-bg);
  padding: 16px 19px;
}
.dark .frox-stat-card {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
}
.frox-stat-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

/* KPI colors */
.kpi-up { color: var(--green-accent); }
.kpi-down { color: var(--red-accent); }
.kpi-warn { color: var(--yellow-accent); }

/* Toolbar card */
.frox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}

/* Buttons */
.frox-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}
.frox-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.frox-btn-sm { padding: 7px 14px; font-size: 13px; }
.frox-btn-brand {
  background: var(--color-brands);
  color: #fff;
  border: 2px solid var(--color-brands);
}
.frox-btn-brand:hover:not(:disabled) { opacity: 0.9; }
.frox-btn-outline {
  background: transparent;
  color: var(--gray-500);
  border: 1px solid var(--neutral-accent);
}
.dark .frox-btn-outline {
  color: var(--dark-gray-500);
  border-color: var(--dark-neutral-border);
}
.frox-btn-outline:hover:not(:disabled) {
  background: var(--gray-100);
  color: var(--gray-800);
}
.dark .frox-btn-outline:hover:not(:disabled) {
  background: var(--dark-gray-200);
  color: var(--dark-gray-900);
}
.frox-btn-danger {
  color: var(--red-accent);
  border-color: var(--red-accent);
}
.frox-btn-danger:hover:not(:disabled) {
  background: var(--red-accent);
  color: #fff;
}

/* Chip (chart metrics) */
.frox-chip {
  padding: 6px 14px;
  border: 1px solid var(--neutral-accent);
  border-radius: 8px;
  cursor: pointer;
  background: var(--neutral-bg);
  color: var(--gray-500);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  font-family: inherit;
}
.dark .frox-chip { border-color: var(--dark-neutral-border); background: var(--dark-neutral-bg); color: var(--dark-gray-500); }
.frox-chip:hover { border-color: var(--gray-400); }
.frox-chip-active { font-weight: 600; }

/* Date input */
.frox-date-input {
  padding: 6px 10px;
  border: 1px solid var(--neutral-accent);
  border-radius: 8px;
  background: var(--neutral-bg);
  color: var(--gray-1100);
  font-size: 13px;
  font-family: inherit;
}
.dark .frox-date-input {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
  color: var(--dark-gray-1100);
}

/* Select small */
.frox-select-sm {
  padding: 6px 10px;
  border: 1px solid var(--neutral-accent);
  border-radius: 8px;
  background: var(--neutral-bg);
  color: var(--gray-1100);
  font-size: 13px;
  font-family: inherit;
}
.dark .frox-select-sm {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
  color: var(--dark-gray-1100);
}

/* Table */
.frox-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.frox-table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--gray-500);
  font-size: 12px;
  border-bottom: 1px solid var(--neutral-accent);
  background: var(--neutral-bg);
}
.dark .frox-table th {
  color: var(--dark-gray-500);
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
}
.frox-th-sort {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.frox-th-sort:hover { color: var(--gray-1100); }
.dark .frox-th-sort:hover { color: var(--dark-gray-1100); }

.frox-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--neutral-accent);
  color: var(--gray-1100);
}
.dark .frox-table td {
  border-color: var(--dark-neutral-border);
  color: var(--dark-gray-1100);
}
.frox-row { cursor: pointer; transition: background 0.15s; }
.frox-row:hover { background: var(--gray-100); }
.dark .frox-row:hover { background: var(--dark-gray-100); }
.frox-row-active { background: var(--gray-100); }
.dark .frox-row-active { background: var(--dark-gray-100); }

/* Expand panel */
.frox-expand-panel {
  padding: 16px 20px;
  background: var(--gray-100);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--neutral-accent);
}
.dark .frox-expand-panel {
  background: var(--dark-gray-100);
  border-color: var(--dark-neutral-border);
}
.frox-expand-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--gray-1100);
}
.dark .frox-expand-field { color: var(--dark-gray-1100); }
.frox-expand-label {
  font-size: 12px;
  color: var(--gray-400);
  font-weight: 500;
}
.dark .frox-expand-label { color: var(--dark-gray-400); }

/* Inline input */
.frox-input-inline {
  width: 120px;
  padding: 5px 10px;
  border: 1px solid var(--neutral-accent);
  border-radius: 6px;
  background: var(--neutral-bg);
  color: var(--gray-1100);
  font-size: 13px;
  font-family: inherit;
}
.dark .frox-input-inline {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
  color: var(--dark-gray-1100);
}

/* Full input */
.frox-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  background: var(--gray-100);
  color: var(--gray-1100);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.dark .frox-input {
  border-color: var(--dark-neutral-border);
  background: var(--dark-gray-100);
  color: var(--dark-gray-1100);
}
.frox-input:focus { border-color: var(--color-brands); }
.frox-input::placeholder { color: var(--gray-300); font-weight: 500; }
.dark .frox-input::placeholder { color: var(--dark-gray-300); }

/* Field */
.frox-field { margin-bottom: 8px; }
.frox-field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--gray-500);
  margin-bottom: 6px;
}
.dark .frox-field-label { color: var(--dark-gray-500); }

/* Badge count */
.frox-badge-count {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--gray-100);
  color: var(--gray-500);
  font-weight: 600;
}
.dark .frox-badge-count { background: var(--dark-gray-200); color: var(--dark-gray-500); }

.frox-badge-new {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-brands);
  color: #fff;
  font-weight: 700;
  text-transform: uppercase;
}

/* Review card */
.frox-review-card {
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  padding: 12px 16px;
  background: var(--neutral-bg);
}
.dark .frox-review-card {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
}
.frox-review-negative { border-left: 3px solid var(--red-accent); }
.frox-review-new { border-left: 3px solid var(--color-brands); }

/* Sentiment badge */
.frox-sentiment {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.frox-sentiment-positive { background: rgba(80, 209, 178, 0.15); color: var(--green-accent); }
.frox-sentiment-negative { background: rgba(226, 55, 56, 0.15); color: var(--red-accent); }
.frox-sentiment-neutral { background: rgba(115, 100, 219, 0.15); color: var(--color-brands); }

/* Alerts */
.frox-alert {
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  padding: 12px 16px;
  background: var(--neutral-bg);
}
.dark .frox-alert {
  border-color: var(--dark-neutral-border);
  background: var(--dark-neutral-bg);
}
.frox-alert-unread { border-left: 3px solid var(--color-brands); }
.frox-alert-critical.frox-alert-unread { border-left-color: var(--red-accent); }
.frox-alert-warning.frox-alert-unread { border-left-color: var(--yellow-accent); }

/* Report card */
.frox-report-card {
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  padding: 14px 18px;
  cursor: pointer;
  transition: border-color 0.15s;
  background: var(--neutral-bg);
}
.dark .frox-report-card { border-color: var(--dark-neutral-border); background: var(--dark-neutral-bg); }
.frox-report-card:hover { border-color: var(--gray-400); }
.frox-report-expanded { border-color: var(--color-brands); }

.frox-report-badge {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
.frox-report-daily { background: rgba(115, 100, 219, 0.12); color: var(--color-brands); }
.frox-report-weekly { background: rgba(80, 209, 178, 0.12); color: var(--green-accent); }

.frox-status { font-size: 12px; font-weight: 600; }
.frox-status-done { color: var(--green-accent); }
.frox-status-generating { color: var(--yellow-accent); }
.frox-status-error { color: var(--red-accent); }

/* Schedule row */
.frox-schedule-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  background: var(--neutral-bg);
}
.dark .frox-schedule-row { border-color: var(--dark-neutral-border); background: var(--dark-neutral-bg); }

/* Toggle label */
.frox-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-1100);
}
.dark .frox-toggle-label { color: var(--dark-gray-1100); }
.frox-checkbox { accent-color: var(--color-brands); cursor: pointer; }

/* Empty state */
.frox-empty {
  text-align: center;
  color: var(--gray-400);
  padding: 32px;
  font-size: 14px;
}
.dark .frox-empty { color: var(--dark-gray-400); }

/* Toast */
.frox-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
}
.frox-toast-success { background: var(--green-accent); color: #fff; }
.frox-toast-error { background: var(--red-accent); color: #fff; }
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-10px); }

/* Spin animation */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.animate-spin { animation: spin 1s linear infinite; }
</style>
