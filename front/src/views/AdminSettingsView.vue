<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import { Save, Send, Bell, Check, AlertCircle, Info } from 'lucide-vue-next'

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const error = ref('')
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const form = ref({
  alert_bot_token: '',
  alert_chat_id: '',
  alert_enabled: '0',
})

function showToast(text: string, type: 'success' | 'error' = 'success') {
  toast.value = { text, type }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3000)
}

onMounted(async () => {
  try {
    const data = await api.getAdminSettings()
    form.value.alert_bot_token = data.alert_bot_token || ''
    form.value.alert_chat_id = data.alert_chat_id || ''
    form.value.alert_enabled = data.alert_enabled || '0'
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
})

async function save() {
  saving.value = true
  try {
    await api.saveAdminSettings(form.value)
    showToast('Настройки сохранены')
  } catch (e: any) { showToast(e.message, 'error') }
  finally { saving.value = false }
}

async function testAlert() {
  testing.value = true
  try {
    await api.testAlert()
    showToast('Тестовый алерт отправлен')
  } catch (e: any) { showToast(e.message, 'error') }
  finally { testing.value = false }
}
</script>

<template>
  <div class="wb-analytics">
    <!-- Header -->
    <div class="flex items-center justify-between mb-1">
      <h2 class="font-bold text-[28px] leading-[35px] text-gray-1100 dark:text-gray-dark-1100">Настройки алертов</h2>
    </div>
    <div class="flex items-center text-xs text-gray-500 dark:text-gray-dark-500 gap-x-[11px] mb-7">
      <span>Управление</span>
      <span class="text-gray-300">/</span>
      <span style="color: var(--color-brands)">Алерты</span>
    </div>

    <div class="frox-grid">
      <!-- Left: Form -->
      <div class="frox-card">
        <div class="frox-card-header">
          <Bell :size="18" class="frox-card-icon" />
          <div>
            <h3 class="frox-card-title">Telegram-алерты</h3>
            <p class="frox-card-desc">Глобальный канал уведомлений об ошибках и перезапусках сервисов</p>
          </div>
        </div>

        <div v-if="loading" class="frox-empty">Загрузка...</div>
        <div v-else-if="error" class="frox-alert frox-alert-error">{{ error }}</div>

        <form v-else class="frox-form" @submit.prevent="save">
          <div class="frox-field">
            <label class="frox-label">Telegram Bot Token</label>
            <input
              v-model="form.alert_bot_token"
              type="text"
              class="frox-input"
              placeholder="123456:ABC-DEF..."
              autocomplete="off"
            />
            <span class="frox-hint">Токен бота, который будет отправлять алерты</span>
          </div>

          <div class="frox-field">
            <label class="frox-label">Telegram Chat ID</label>
            <input
              v-model="form.alert_chat_id"
              type="text"
              class="frox-input"
              placeholder="-1001234567890"
              autocomplete="off"
            />
            <span class="frox-hint">ID чата или канала для алертов</span>
          </div>

          <div class="frox-field">
            <label class="frox-toggle-label">
              <span class="frox-toggle-track" :class="{ active: form.alert_enabled === '1' }">
                <input
                  type="checkbox"
                  class="frox-toggle-input"
                  :checked="form.alert_enabled === '1'"
                  @change="form.alert_enabled = ($event.target as HTMLInputElement).checked ? '1' : '0'"
                />
                <span class="frox-toggle-thumb"></span>
              </span>
              Алерты включены
            </label>
          </div>

          <div class="flex gap-3 mt-2">
            <button type="submit" class="frox-btn frox-btn-brand" :disabled="saving">
              <Save :size="14" />
              {{ saving ? 'Сохранение...' : 'Сохранить' }}
            </button>
            <button type="button" class="frox-btn frox-btn-outline" :disabled="testing" @click="testAlert">
              <Send :size="14" />
              {{ testing ? 'Отправка...' : 'Тестовый алерт' }}
            </button>
          </div>
        </form>
      </div>

      <!-- Right: Info -->
      <div class="frox-card frox-info-card">
        <div class="frox-card-header">
          <Info :size="18" class="frox-card-icon" />
          <h3 class="frox-card-title" style="margin-bottom: 0;">Что приходит в алерты</h3>
        </div>
        <ul class="frox-info-list">
          <li>Необработанные ошибки на сервере (продукт, среда, текст ошибки)</li>
          <li>Uncaught exceptions и unhandled rejections</li>
          <li>Перезапуск сервиса</li>
        </ul>
        <div class="frox-info-note">
          <AlertCircle :size="14" />
          <span>Алерты отправляются только при включённой настройке и заполненных полях бота</span>
        </div>
      </div>
    </div>

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
/* Grid */
.frox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .frox-grid { grid-template-columns: 1fr; }
}

/* Card */
.frox-card {
  background: var(--neutral-bg);
  border: 1px solid var(--neutral-accent);
  border-radius: 14px;
  padding: 24px;
}
.dark .frox-card {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
}
.frox-card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--neutral-accent);
}
.dark .frox-card-header { border-color: var(--dark-neutral-border); }
.frox-card-icon { color: var(--color-brands); flex-shrink: 0; margin-top: 2px; }
.frox-card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--gray-1100);
  margin-bottom: 4px;
}
.dark .frox-card-title { color: var(--dark-gray-1100); }
.frox-card-desc {
  font-size: 13px;
  color: var(--gray-500);
  margin: 0;
}
.dark .frox-card-desc { color: var(--dark-gray-500); }

/* Form */
.frox-form { display: flex; flex-direction: column; gap: 18px; }
.frox-field { display: flex; flex-direction: column; gap: 6px; }
.frox-label { font-size: 13px; color: var(--gray-500); font-weight: 600; }
.dark .frox-label { color: var(--dark-gray-500); }
.frox-input {
  background: var(--gray-100);
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  padding: 10px 14px;
  color: var(--gray-1100);
  font-size: 14px;
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
.frox-hint { color: var(--gray-400); font-size: 12px; }
.dark .frox-hint { color: var(--dark-gray-400); }

/* Toggle */
.frox-toggle-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--gray-1100);
  cursor: pointer;
  user-select: none;
  font-weight: 500;
}
.dark .frox-toggle-label { color: var(--dark-gray-1100); }
.frox-toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
.frox-toggle-track {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--gray-300);
  transition: background 0.2s;
  flex-shrink: 0;
}
.dark .frox-toggle-track { background: var(--dark-gray-300); }
.frox-toggle-track.active { background: var(--color-brands); }
.frox-toggle-thumb {
  position: absolute;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}
.frox-toggle-track.active .frox-toggle-thumb { transform: translateX(18px); }

/* Buttons */
.frox-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
  font-family: inherit;
  padding: 10px 18px;
  font-size: 14px;
}
.frox-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.frox-btn-brand { background: var(--color-brands); color: #fff; }
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

/* Info card */
.frox-info-list {
  color: var(--gray-600);
  font-size: 14px;
  line-height: 2;
  padding-left: 20px;
  margin: 0 0 20px 0;
}
.dark .frox-info-list { color: var(--dark-gray-600); }
.frox-info-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: var(--bg-10);
  border-radius: 10px;
  font-size: 13px;
  color: var(--violet-accent);
}

/* Alert */
.frox-alert {
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
.frox-alert-error { background: var(--bg-3); color: var(--red-accent); }

/* Empty */
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
</style>
