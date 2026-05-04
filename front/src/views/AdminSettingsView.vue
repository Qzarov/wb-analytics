<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'

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
  <div class="settings-page">
    <div class="settings-container">
      <h1 class="page-title">Настройки алертов</h1>
      <p class="page-desc">Глобальный канал уведомлений об ошибках и перезапусках сервисов. Алерты приходят в Telegram.</p>

      <div v-if="loading" class="loading">Загрузка...</div>
      <div v-else-if="error" class="form-error">{{ error }}</div>

      <form v-else class="settings-form" @submit.prevent="save">
        <div class="form-group">
          <label class="form-label">Telegram Bot Token</label>
          <input
            v-model="form.alert_bot_token"
            type="text"
            class="form-input"
            placeholder="123456:ABC-DEF..."
            autocomplete="off"
          />
          <span class="form-hint">Токен бота, который будет отправлять алерты</span>
        </div>

        <div class="form-group">
          <label class="form-label">Telegram Chat ID</label>
          <input
            v-model="form.alert_chat_id"
            type="text"
            class="form-input"
            placeholder="-1001234567890"
            autocomplete="off"
          />
          <span class="form-hint">ID чата или канала для алертов</span>
        </div>

        <div class="form-group">
          <label class="form-label toggle-label">
            <input
              type="checkbox"
              :checked="form.alert_enabled === '1'"
              @change="form.alert_enabled = ($event.target as HTMLInputElement).checked ? '1' : '0'"
            />
            <span class="toggle-text">Алерты включены</span>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Сохранение...' : 'Сохранить' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="testing" @click="testAlert">
            {{ testing ? 'Отправка...' : 'Тестовый алерт' }}
          </button>
        </div>
      </form>

      <div class="info-block">
        <h3 class="info-title">Что приходит в алерты</h3>
        <ul class="info-list">
          <li>Необработанные ошибки на сервере (продукт, среда, текст ошибки)</li>
          <li>Uncaught exceptions и unhandled rejections</li>
          <li>Перезапуск сервиса</li>
        </ul>
      </div>

      <Teleport to="body">
        <Transition name="toast">
          <div v-if="toast" class="toast" :class="'toast-' + toast.type">{{ toast.text }}</div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.settings-page { padding: 2rem 1rem; display: flex; justify-content: center; }
.settings-container { width: 100%; max-width: 600px; }
.page-title { color: var(--text-primary); font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
.page-desc { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 2rem; line-height: 1.5; }
.loading { color: var(--text-secondary); text-align: center; padding: 2rem; }
.form-error { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }

.settings-form { display: flex; flex-direction: column; gap: 1.25rem; }
.form-group { display: flex; flex-direction: column; gap: 0.35rem; }
.form-label { color: var(--text-primary); font-size: 0.85rem; font-weight: 600; }
.form-input {
  background: var(--bg-input);
  border: 1px solid var(--border);
  color: var(--text-body);
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}
.form-input:focus { outline: none; border-color: var(--accent); }
.form-hint { color: var(--text-muted); font-size: 0.78rem; }

.toggle-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.toggle-text { font-weight: 500; }

.form-actions { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
.btn { padding: 0.6rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.2s; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.btn-secondary { background: var(--bg-surface); color: var(--text-body); border: 1px solid var(--border); }
.btn-secondary:hover:not(:disabled) { background: var(--bg-hover); }

.info-block { margin-top: 2.5rem; padding: 1.25rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; }
.info-title { color: var(--text-primary); font-size: 0.9rem; font-weight: 600; margin-bottom: 0.75rem; }
.info-list { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8; padding-left: 1.25rem; margin: 0; }

.toast { position: fixed; bottom: 2rem; right: 2rem; padding: 0.75rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.toast-success { background: var(--success-bg, #16a34a); color: #fff; }
.toast-error { background: var(--danger, #ef4444); color: #fff; }
.toast-enter-active, .toast-leave-active { transition: all 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(10px); }
</style>
