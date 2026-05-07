<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { api, type ServiceLogRow } from '@/api'
import {
  ChevronLeft, ChevronRight, RotateCcw, Download, X, Check, AlertCircle, Filter, Copy, Trash2
} from 'lucide-vue-next'

const loading = ref(true)
const logs = ref<ServiceLogRow[]>([])
const total = ref(0)
const page = ref(1)
const perPage = 50

const selectedIds = ref<Set<number>>(new Set())
const showExportModal = ref(false)
const exportCopied = ref(false)

function toggleSelect(id: number) {
  const s = selectedIds.value
  if (s.has(id)) s.delete(id); else s.add(id)
}

function toggleSelectAll() {
  if (selectedIds.value.size === logs.value.length) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(logs.value.map(l => l.id))
  }
}

function openExport() {
  if (!selectedIds.value.size) return
  exportCopied.value = false
  showExportModal.value = true
}

const exportJson = () => {
  const rows = logs.value.filter(l => selectedIds.value.has(l.id))
  return JSON.stringify(rows, null, 2)
}

async function copyExport() {
  try {
    await navigator.clipboard.writeText(exportJson())
    exportCopied.value = true
    setTimeout(() => { exportCopied.value = false }, 2000)
  } catch {}
}

const filters = reactive({
  service: '',
  user_id: '',
  task: '',
  status: '',
  source: '',
  from: '',
  to: '',
})

const services = ref<string[]>([])
const tasks = ref<string[]>([])
const retention = ref(30)
const retentionSaving = ref(false)
const cleaningUp = ref(false)

const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string, type: 'success' | 'error' = 'success') {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

async function loadLogs() {
  loading.value = true
  try {
    const params: Record<string, string | number> = {
      limit: perPage,
      offset: (page.value - 1) * perPage,
    }
    if (filters.service) params.service = filters.service
    if (filters.user_id) params.user_id = Number(filters.user_id)
    if (filters.task) params.task = filters.task
    if (filters.status) params.status = filters.status
    if (filters.source) params.source = filters.source
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    const data = await api.getServiceLogs(params)
    logs.value = data.rows
    total.value = data.total
    selectedIds.value.clear()
  } catch (e: any) { showToast(e.message, 'error') }
  finally { loading.value = false }
}

async function loadFilters() {
  try {
    const data = await api.getServiceLogFilters(filters.service || undefined)
    services.value = data.services
    tasks.value = data.tasks
  } catch {}
}

async function loadRetention() {
  try {
    const data = await api.getLogRetention()
    retention.value = data.days
  } catch {}
}

async function saveRetention() {
  retentionSaving.value = true
  try {
    const data = await api.setLogRetention(retention.value)
    retention.value = data.days
    showToast('Интервал автоудаления сохранён')
  } catch (e: any) { showToast(e.message, 'error') }
  finally { retentionSaving.value = false }
}

async function runCleanup() {
  if (!confirm('Удалить старые логи сейчас?')) return
  cleaningUp.value = true
  try {
    const data = await api.cleanupLogs()
    showToast(`Удалено ${data.deleted} записей старше ${data.days} дней`)
    await loadLogs()
  } catch (e: any) { showToast(e.message, 'error') }
  finally { cleaningUp.value = false }
}

function applyFilters() {
  page.value = 1
  loadLogs()
}

function resetFilters() {
  filters.service = ''
  filters.user_id = ''
  filters.task = ''
  filters.status = ''
  filters.source = ''
  filters.from = ''
  filters.to = ''
  page.value = 1
  loadLogs()
  loadFilters()
}

function prevPage() { if (page.value > 1) { page.value--; loadLogs() } }
function nextPage() { if (page.value * perPage < total.value) { page.value++; loadLogs() } }

const totalPages = () => Math.max(1, Math.ceil(total.value / perPage))

function fmtDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return ms + 'мс'
  return (ms / 1000).toFixed(1) + 'с'
}

const SERVICE_LABELS: Record<string, string> = {
  wb: 'WB Аналитика',
}

function serviceLabel(s: string): string { return SERVICE_LABELS[s] || s }

watch(() => filters.service, () => { loadFilters() })

onMounted(async () => {
  await Promise.all([loadLogs(), loadFilters(), loadRetention()])
})
</script>

<template>
  <div class="wb-analytics">
    <!-- Header -->
    <div class="flex items-center justify-between mb-1">
      <h2 class="font-bold text-[28px] leading-[35px] text-gray-1100 dark:text-gray-dark-1100">Логи сервисов</h2>
    </div>
    <div class="flex items-center text-xs text-gray-500 dark:text-gray-dark-500 gap-x-[11px] mb-7">
      <span>Управление</span>
      <span class="text-gray-300">/</span>
      <span style="color: var(--color-brands)">Логи</span>
    </div>

    <!-- Toolbar -->
    <div class="frox-card frox-toolbar">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="frox-retention">
          <span class="frox-retention-label">Автоудаление:</span>
          <select v-model.number="retention" @change="saveRetention" :disabled="retentionSaving" class="frox-input frox-input-sm">
            <option :value="1">1 день</option>
            <option :value="7">7 дней</option>
            <option :value="30">30 дней</option>
          </select>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="frox-btn frox-btn-outline frox-btn-sm" @click="openExport" :disabled="!selectedIds.size">
          <Download :size="14" />
          Экспорт ({{ selectedIds.size }})
        </button>
        <button class="frox-btn frox-btn-outline frox-btn-sm frox-btn-danger-outline" @click="runCleanup" :disabled="cleaningUp">
          <Trash2 :size="14" />
          {{ cleaningUp ? 'Очистка...' : 'Очистить' }}
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="frox-card frox-filters">
      <div class="flex items-center gap-2 mr-2">
        <Filter :size="14" class="text-gray-400" />
      </div>
      <select v-model="filters.service" @change="applyFilters" class="frox-input frox-input-sm">
        <option value="">Все сервисы</option>
        <option v-for="s in services" :key="s" :value="s">{{ serviceLabel(s) }}</option>
      </select>
      <input type="number" v-model="filters.user_id" placeholder="User ID" @change="applyFilters" class="frox-input frox-input-sm frox-input-narrow" />
      <select v-model="filters.task" @change="applyFilters" class="frox-input frox-input-sm">
        <option value="">Все задачи</option>
        <option v-for="t in tasks" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="filters.source" @change="applyFilters" class="frox-input frox-input-sm">
        <option value="">Все источники</option>
        <option value="cron">Cron</option>
        <option value="manual">Ручной</option>
        <option value="http">HTTP</option>
      </select>
      <select v-model="filters.status" @change="applyFilters" class="frox-input frox-input-sm">
        <option value="">Все статусы</option>
        <option value="success">Успех</option>
        <option value="partial">Частично</option>
        <option value="error">Ошибка</option>
      </select>
      <input type="date" v-model="filters.from" @change="applyFilters" class="frox-input frox-input-sm frox-input-date" />
      <input type="date" v-model="filters.to" @change="applyFilters" class="frox-input frox-input-sm frox-input-date" />
      <button class="frox-btn frox-btn-outline frox-btn-sm" @click="resetFilters">
        <RotateCcw :size="13" />
        Сброс
      </button>
    </div>

    <!-- Table -->
    <div class="frox-card" style="padding: 0; overflow: hidden;">
      <div class="frox-table-wrap">
        <table class="frox-table">
          <thead>
            <tr>
              <th class="col-check"><input type="checkbox" class="frox-checkbox" @change="toggleSelectAll" :checked="logs.length > 0 && selectedIds.size === logs.length" /></th>
              <th>Время</th>
              <th>Сервис</th>
              <th>User</th>
              <th>Задача</th>
              <th>Источник</th>
              <th>Статус</th>
              <th>Длительность</th>
              <th>Сообщение</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="9" class="frox-empty">Загрузка...</td>
            </tr>
            <tr v-else-if="logs.length === 0">
              <td colspan="9" class="frox-empty">Логов нет</td>
            </tr>
            <tr v-for="log in logs" :key="log.id"
              :class="{ 'row-error': log.status === 'error', 'row-partial': log.status === 'partial', 'row-selected': selectedIds.has(log.id) }">
              <td class="col-check"><input type="checkbox" class="frox-checkbox" :checked="selectedIds.has(log.id)" @change="toggleSelect(log.id)" /></td>
              <td class="col-date">{{ fmtDate(log.created_at) }}</td>
              <td><span class="frox-badge frox-badge-gray">{{ serviceLabel(log.service) }}</span></td>
              <td class="col-user">{{ log.user_id }}</td>
              <td><code class="frox-code">{{ log.task }}</code></td>
              <td><span class="frox-badge" :class="'frox-badge-' + log.source">{{ log.source }}</span></td>
              <td>
                <span class="frox-badge" :class="'frox-badge-' + log.status">
                  {{ log.status === 'success' ? 'OK' : log.status === 'partial' ? 'Частично' : 'Ошибка' }}
                </span>
              </td>
              <td class="col-duration">{{ fmtDuration(log.duration_ms) }}</td>
              <td class="col-message" :title="log.message">{{ log.message || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > perPage" class="frox-pagination">
      <button class="frox-btn frox-btn-outline frox-btn-sm" :disabled="page <= 1" @click="prevPage">
        <ChevronLeft :size="14" />
      </button>
      <span class="frox-page-info">{{ page }} / {{ totalPages() }} ({{ total }})</span>
      <button class="frox-btn frox-btn-outline frox-btn-sm" :disabled="page * perPage >= total" @click="nextPage">
        <ChevronRight :size="14" />
      </button>
    </div>

    <!-- Export Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showExportModal" class="frox-modal-overlay" @click.self="showExportModal = false">
          <div class="frox-modal">
            <div class="frox-modal-header">
              <h3 class="frox-modal-title">Экспорт записей ({{ selectedIds.size }})</h3>
              <button class="frox-modal-close" @click="showExportModal = false"><X :size="18" /></button>
            </div>
            <pre class="frox-export-json">{{ exportJson() }}</pre>
            <div class="frox-modal-footer">
              <button class="frox-btn frox-btn-brand frox-btn-sm" @click="copyExport">
                <Copy :size="14" />
                {{ exportCopied ? 'Скопировано' : 'Копировать' }}
              </button>
              <button class="frox-btn frox-btn-outline frox-btn-sm" @click="showExportModal = false">Закрыть</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast" class="frox-toast" :class="'frox-toast-' + toast.type" @click="toast = null">
          <Check v-if="toast.type === 'success'" :size="16" />
          <AlertCircle v-else :size="16" />
          {{ toast.text }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* Card */
.frox-card {
  background: var(--neutral-bg);
  border: 1px solid var(--neutral-accent);
  border-radius: 14px;
  padding: 20px;
  margin-bottom: 16px;
}
.dark .frox-card {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
}

/* Toolbar */
.frox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

/* Retention */
.frox-retention {
  display: flex;
  align-items: center;
  gap: 8px;
}
.frox-retention-label {
  font-size: 13px;
  color: var(--gray-500);
  font-weight: 500;
  white-space: nowrap;
}
.dark .frox-retention-label { color: var(--dark-gray-500); }

/* Filters */
.frox-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* Input */
.frox-input {
  background: var(--gray-100);
  border: 1px solid var(--neutral-accent);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--gray-1100);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.dark .frox-input {
  background: var(--dark-gray-100);
  border-color: var(--dark-neutral-border);
  color: var(--dark-gray-1100);
}
.frox-input:focus { border-color: var(--color-brands); }
.frox-input-sm { padding: 6px 10px; font-size: 13px; }
.frox-input-narrow { width: 90px; }
.frox-input-date { width: 140px; }

/* Button */
.frox-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
  font-family: inherit;
  white-space: nowrap;
}
.frox-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.frox-btn-sm { padding: 6px 12px; font-size: 13px; }
.frox-btn-brand { background: var(--color-brands); color: #fff; padding: 8px 16px; font-size: 14px; }
.frox-btn-brand:hover:not(:disabled) { opacity: 0.9; }
.frox-btn-outline {
  background: transparent;
  border: 1px solid var(--neutral-accent);
  color: var(--gray-600);
}
.dark .frox-btn-outline {
  border-color: var(--dark-neutral-border);
  color: var(--dark-gray-600);
}
.frox-btn-outline:hover:not(:disabled) {
  border-color: var(--color-brands);
  color: var(--color-brands);
}
.frox-btn-danger-outline:hover:not(:disabled) {
  border-color: var(--red-accent);
  color: var(--red-accent);
}

/* Table */
.frox-table-wrap { overflow-x: auto; }
.frox-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.frox-table th {
  text-align: left;
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gray-400);
  border-bottom: 1px solid var(--neutral-accent);
  background: var(--gray-100);
}
.dark .frox-table th {
  color: var(--dark-gray-400);
  border-color: var(--dark-neutral-border);
  background: var(--dark-gray-100);
}
.frox-table td {
  padding: 10px 14px;
  color: var(--gray-800);
  border-bottom: 1px solid var(--neutral-accent);
}
.dark .frox-table td {
  color: var(--dark-gray-800);
  border-color: var(--dark-neutral-border);
}
.frox-table tbody tr:hover td {
  background: var(--gray-100);
}
.dark .frox-table tbody tr:hover td {
  background: var(--dark-gray-100);
}
.frox-table tbody tr:last-child td { border-bottom: none; }

.col-check { width: 36px; text-align: center; }
.frox-checkbox { cursor: pointer; accent-color: var(--color-brands); }
.col-date { white-space: nowrap; font-size: 12px; color: var(--gray-400); }
.dark .col-date { color: var(--dark-gray-400); }
.col-user { font-weight: 600; font-size: 13px; }
.col-duration { white-space: nowrap; font-size: 13px; color: var(--gray-500); }
.dark .col-duration { color: var(--dark-gray-500); }
.col-message { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--gray-500); }
.dark .col-message { color: var(--dark-gray-500); }

.row-error { background: rgba(239, 68, 68, 0.04); }
.dark .row-error { background: rgba(239, 68, 68, 0.08); }
.row-partial { background: rgba(245, 158, 11, 0.04); }
.dark .row-partial { background: rgba(245, 158, 11, 0.08); }
.row-selected { background: rgba(115, 100, 219, 0.06); }
.dark .row-selected { background: rgba(115, 100, 219, 0.12); }

/* Code */
.frox-code {
  font-size: 12px;
  background: var(--gray-100);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.dark .frox-code { background: var(--dark-gray-200); }

/* Badges */
.frox-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.frox-badge-gray { background: var(--gray-200); color: var(--gray-600); }
.dark .frox-badge-gray { background: var(--dark-gray-200); color: var(--dark-gray-600); }
.frox-badge-success { background: var(--bg-5); color: var(--green-accent); }
.frox-badge-error { background: var(--bg-3); color: var(--red-accent); }
.frox-badge-partial { background: var(--bg-2); color: var(--orange-accent); }
.frox-badge-cron { background: var(--bg-10); color: var(--violet-accent); }
.frox-badge-manual { background: var(--bg-2); color: var(--orange-accent); }
.frox-badge-http { background: var(--bg-9); color: var(--blue-accent); }

/* Pagination */
.frox-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
.frox-page-info {
  font-size: 13px;
  color: var(--gray-500);
  font-weight: 500;
}
.dark .frox-page-info { color: var(--dark-gray-500); }

/* Empty */
.frox-empty {
  text-align: center;
  color: var(--gray-400);
  padding: 32px;
  font-size: 14px;
}
.dark .frox-empty { color: var(--dark-gray-400); }

/* Modal */
.frox-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.frox-modal {
  background: var(--neutral-bg);
  border: 1px solid var(--neutral-accent);
  border-radius: 16px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}
.dark .frox-modal {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
}
.frox-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--neutral-accent);
}
.dark .frox-modal-header { border-color: var(--dark-neutral-border); }
.frox-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--gray-1100);
  margin: 0;
}
.dark .frox-modal-title { color: var(--dark-gray-1100); }
.frox-modal-close {
  background: none;
  border: none;
  color: var(--gray-400);
  cursor: pointer;
  padding: 4px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  transition: all 0.15s;
}
.frox-modal-close:hover { color: var(--gray-800); background: var(--gray-100); }
.dark .frox-modal-close { color: var(--dark-gray-400); }
.dark .frox-modal-close:hover { color: var(--dark-gray-800); background: var(--dark-gray-200); }
.frox-export-json {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 16px 20px;
  font-size: 12px;
  background: var(--gray-100);
  color: var(--gray-800);
  white-space: pre-wrap;
  word-break: break-all;
  font-family: monospace;
}
.dark .frox-export-json {
  background: var(--dark-gray-100);
  color: var(--dark-gray-800);
}
.frox-modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--neutral-accent);
}
.dark .frox-modal-footer { border-color: var(--dark-neutral-border); }

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

/* Fade */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
