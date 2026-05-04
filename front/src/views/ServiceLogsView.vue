<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { api, type ServiceLogRow } from '@/api'

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
  <div class="logs-page">
    <div class="logs-container">
      <div class="logs-header">
        <h1 class="page-title">Логи сервисов</h1>
        <div class="header-actions">
          <div class="retention-control">
            <label>Автоудаление:</label>
            <select v-model.number="retention" @change="saveRetention" :disabled="retentionSaving">
              <option :value="1">1 день</option>
              <option :value="7">7 дней</option>
              <option :value="30">30 дней</option>
            </select>
          </div>
          <button class="btn btn-secondary btn-sm" @click="openExport" :disabled="!selectedIds.size">
            Экспорт ({{ selectedIds.size }})
          </button>
          <button class="btn btn-secondary btn-sm" @click="runCleanup" :disabled="cleaningUp">
            {{ cleaningUp ? 'Очистка...' : 'Очистить сейчас' }}
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <select v-model="filters.service" @change="applyFilters">
          <option value="">Все сервисы</option>
          <option v-for="s in services" :key="s" :value="s">{{ serviceLabel(s) }}</option>
        </select>
        <input type="number" v-model="filters.user_id" placeholder="User ID" @change="applyFilters" />
        <select v-model="filters.task" @change="applyFilters">
          <option value="">Все задачи</option>
          <option v-for="t in tasks" :key="t" :value="t">{{ t }}</option>
        </select>
        <select v-model="filters.source" @change="applyFilters">
          <option value="">Все источники</option>
          <option value="cron">Cron</option>
          <option value="manual">Ручной</option>
          <option value="http">HTTP</option>
        </select>
        <select v-model="filters.status" @change="applyFilters">
          <option value="">Все статусы</option>
          <option value="success">Успех</option>
          <option value="partial">Частично</option>
          <option value="error">Ошибка</option>
        </select>
        <input type="date" v-model="filters.from" @change="applyFilters" />
        <input type="date" v-model="filters.to" @change="applyFilters" />
        <button class="btn btn-secondary btn-sm" @click="resetFilters">Сбросить</button>
      </div>

      <!-- Table -->
      <div class="logs-table-wrap">
        <table class="logs-table">
          <thead>
            <tr>
              <th class="col-check"><input type="checkbox" @change="toggleSelectAll" :checked="logs.length > 0 && selectedIds.size === logs.length" /></th>
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
              <td colspan="9" class="empty">Загрузка...</td>
            </tr>
            <tr v-else-if="logs.length === 0">
              <td colspan="9" class="empty">Логов нет</td>
            </tr>
            <tr v-for="log in logs" :key="log.id" :class="{ 'row-error': log.status === 'error', 'row-partial': log.status === 'partial', 'row-selected': selectedIds.has(log.id) }">
              <td class="col-check"><input type="checkbox" :checked="selectedIds.has(log.id)" @change="toggleSelect(log.id)" /></td>
              <td class="col-date">{{ fmtDate(log.created_at) }}</td>
              <td><span class="badge badge-service">{{ serviceLabel(log.service) }}</span></td>
              <td class="col-user">{{ log.user_id }}</td>
              <td><code class="task-name">{{ log.task }}</code></td>
              <td><span class="badge" :class="'badge-' + log.source">{{ log.source }}</span></td>
              <td>
                <span class="badge" :class="'badge-' + log.status">
                  {{ log.status === 'success' ? 'OK' : log.status === 'partial' ? 'Частично' : 'Ошибка' }}
                </span>
              </td>
              <td class="col-duration">{{ fmtDuration(log.duration_ms) }}</td>
              <td class="col-message" :title="log.message">{{ log.message || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="total > perPage" class="pagination">
        <button class="btn btn-secondary btn-sm" :disabled="page <= 1" @click="prevPage">&larr;</button>
        <span class="page-info">{{ page }} / {{ totalPages() }} ({{ total }})</span>
        <button class="btn btn-secondary btn-sm" :disabled="page * perPage >= total" @click="nextPage">&rarr;</button>
      </div>

      <Teleport to="body">
        <Transition name="fade">
          <div v-if="showExportModal" class="modal-overlay" @click.self="showExportModal = false">
            <div class="modal-box">
              <div class="modal-header">
                <h3 class="modal-title">Экспорт записей ({{ selectedIds.size }})</h3>
                <button class="modal-close" @click="showExportModal = false">&times;</button>
              </div>
              <pre class="export-json">{{ exportJson() }}</pre>
              <div class="modal-footer">
                <button class="btn btn-primary btn-sm" @click="copyExport">
                  {{ exportCopied ? 'Скопировано' : 'Копировать' }}
                </button>
                <button class="btn btn-secondary btn-sm" @click="showExportModal = false">Закрыть</button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <Teleport to="body">
        <Transition name="toast">
          <div v-if="toast" class="toast" :class="'toast-' + toast.type">{{ toast.text }}</div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.logs-page { padding: 1.5rem 1rem; }
.logs-container { max-width: 1200px; margin: 0 auto; }
.logs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: .75rem; }
.page-title { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; }
.header-actions { display: flex; align-items: center; gap: .75rem; }
.retention-control { display: flex; align-items: center; gap: .4rem; font-size: .85rem; color: var(--text-secondary); }
.retention-control select {
  padding: .3rem .5rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .85rem;
}

/* Filters */
.filters-bar {
  display: flex; gap: .5rem; flex-wrap: wrap; align-items: center;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
  padding: .6rem .75rem; margin-bottom: 1rem;
}
.filters-bar select, .filters-bar input {
  padding: .35rem .5rem; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-input); color: var(--text-body); font-size: .82rem;
}
.filters-bar input[type="number"] { width: 90px; }
.filters-bar input[type="date"] { width: 140px; }
.filters-bar select { min-width: 120px; }

/* Table */
.logs-table-wrap { overflow-x: auto; }
.logs-table {
  width: 100%; border-collapse: collapse; font-size: .84rem;
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px;
}
.logs-table th, .logs-table td {
  padding: .5rem .6rem; text-align: left; border-bottom: 1px solid var(--border);
}
.logs-table th { font-weight: 600; color: var(--text-secondary); font-size: .78rem; background: var(--bg-input); }
.row-error { background: rgba(239, 68, 68, 0.04); }
.col-date { white-space: nowrap; font-size: .78rem; color: var(--text-muted); }
.col-user { font-weight: 600; font-size: .82rem; }
.col-duration { white-space: nowrap; font-size: .8rem; color: var(--text-secondary); }
.col-message { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8rem; color: var(--text-secondary); }
.task-name { font-size: .8rem; background: var(--bg-input); padding: .1rem .4rem; border-radius: 4px; }
.empty { text-align: center; color: var(--text-muted); padding: 2rem; }

/* Badges */
.badge {
  display: inline-block; padding: .1rem .45rem; border-radius: 4px;
  font-size: .72rem; font-weight: 600; text-transform: uppercase;
}
.badge-service { background: var(--bg-input); color: var(--text-body); }
.badge-success { background: #22c55e20; color: #22c55e; }
.badge-error { background: #ef444420; color: #ef4444; }
.badge-partial { background: #f59e0b20; color: #d97706; }
.row-partial { background: rgba(245, 158, 11, 0.04); }
.badge-cron { background: #6366f120; color: #6366f1; }
.badge-manual { background: #eab30820; color: #b45309; }

/* Pagination */
.pagination { display: flex; align-items: center; justify-content: center; gap: .75rem; margin-top: 1rem; }
.page-info { font-size: .85rem; color: var(--text-secondary); }

/* Buttons */
.btn { padding: .5rem 1rem; border: none; border-radius: 6px; cursor: pointer; font-size: .85rem; transition: opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary { background: var(--bg-input); color: var(--text-body); border: 1px solid var(--border); }
.btn-sm { padding: .3rem .65rem; font-size: .82rem; }

/* Toast */
.toast { position: fixed; bottom: 2rem; right: 2rem; padding: .75rem 1.25rem; border-radius: 8px; font-size: .9rem; font-weight: 500; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.toast-success { background: var(--success-bg, #16a34a); color: #fff; }
.toast-error { background: var(--danger, #ef4444); color: #fff; }
.toast-enter-active, .toast-leave-active { transition: all .3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(10px); }

/* Checkbox column */
.col-check { width: 36px; text-align: center; }
.col-check input[type="checkbox"] { cursor: pointer; accent-color: var(--accent, #6366f1); }
.row-selected { background: rgba(99, 102, 241, 0.06); }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 9998;
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg-surface, #fff); border-radius: 12px; width: 90%; max-width: 700px;
  max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 8px 30px rgba(0,0,0,.2);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: .75rem 1rem; border-bottom: 1px solid var(--border);
}
.modal-title { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text-primary); }
.modal-close { background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--text-muted); line-height: 1; }
.export-json {
  flex: 1; overflow: auto; margin: 0; padding: 1rem; font-size: .78rem;
  background: var(--bg-input, #f5f5f5); color: var(--text-body); white-space: pre-wrap; word-break: break-all;
}
.modal-footer { display: flex; gap: .5rem; justify-content: flex-end; padding: .75rem 1rem; border-top: 1px solid var(--border); }
.btn-primary { background: var(--accent, #6366f1); color: #fff; border: none; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
