<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type User, type Plan } from '@/api'

const user = ref<User | null>(null)
const plan = ref<Plan | null>(null)
const loading = ref(true)
const error = ref('')

const currentPw = ref('')
const newPw = ref('')
const confirmPw = ref('')
const pwSaving = ref(false)
const pwError = ref('')
const pwSuccess = ref('')

onMounted(async () => {
  try {
    const [me, plans] = await Promise.all([api.getMe(), api.getPlans()])
    user.value = me
    plan.value = me.plan_id ? plans.find(p => p.id === me.plan_id) ?? null : null
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
})

async function changePassword() {
  pwError.value = ''; pwSuccess.value = ''
  if (!currentPw.value || !newPw.value) { pwError.value = 'Заполните оба поля'; return }
  if (newPw.value.length < 6) { pwError.value = 'Минимум 6 символов'; return }
  if (newPw.value !== confirmPw.value) { pwError.value = 'Пароли не совпадают'; return }
  pwSaving.value = true
  try {
    await api.changePassword(currentPw.value, newPw.value)
    currentPw.value = ''; newPw.value = ''; confirmPw.value = ''
    pwSuccess.value = 'Пароль изменён'
    setTimeout(() => (pwSuccess.value = ''), 3000)
  } catch (e: any) { pwError.value = e.message }
  finally { pwSaving.value = false }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function planExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}
</script>

<template>
  <div class="profile-page">
    <div class="profile-card">
      <h1 class="page-title">Мой профиль</h1>
      <div v-if="loading" class="loading">Загрузка...</div>
      <div v-else-if="error" class="form-error">{{ error }}</div>
      <template v-else-if="user">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Имя</span>
            <span class="info-value">{{ user.name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Email</span>
            <span class="info-value">{{ user.email }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Роль</span>
            <span class="info-value"><span class="badge" :class="`badge-${user.role}`">{{ user.role }}</span></span>
          </div>
          <div class="info-item">
            <span class="info-label">Кредиты</span>
            <span class="info-value">{{ user.credits.toLocaleString() }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Тариф</span>
            <span class="info-value">
              <template v-if="plan">
                <span class="plan-badge">{{ plan.name }}</span>
                <span class="plan-expires" :class="{ expired: planExpired(user.plan_expires_at) }">
                  {{ planExpired(user.plan_expires_at) ? 'истёк' : 'до' }} {{ formatDate(user.plan_expires_at) }}
                </span>
              </template>
              <span v-else class="text-muted">Не назначен</span>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Регистрация</span>
            <span class="info-value">{{ formatDate(user.created_at) }}</span>
          </div>
        </div>

        <div class="section-block">
          <h2 class="section-label">Сменить пароль</h2>
          <form @submit.prevent="changePassword" class="pw-form">
            <div class="field">
              <label>Текущий пароль</label>
              <input v-model="currentPw" type="password" autocomplete="current-password" />
            </div>
            <div class="field">
              <label>Новый пароль</label>
              <input v-model="newPw" type="password" autocomplete="new-password" />
            </div>
            <div class="field">
              <label>Подтвердите новый пароль</label>
              <input v-model="confirmPw" type="password" autocomplete="new-password" />
            </div>
            <div v-if="pwError" class="form-error">{{ pwError }}</div>
            <div v-if="pwSuccess" class="form-success">{{ pwSuccess }}</div>
            <button type="submit" class="btn btn-primary" :disabled="pwSaving">{{ pwSaving ? 'Сохранение...' : 'Сменить пароль' }}</button>
          </form>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.profile-page { display: flex; justify-content: center; padding: 2rem 1rem; }
.profile-card { width: 100%; max-width: 600px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 2rem; }
.page-title { color: var(--text-primary); font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; }
.loading { color: var(--text-secondary); text-align: center; padding: 2rem; }

.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.5rem; }
.info-item { display: flex; flex-direction: column; gap: 0.25rem; }
.info-label { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
.info-value { color: var(--text-primary); font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem; }

.badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.badge-admin { background: var(--admin-accent-soft); color: var(--admin-accent); }
.badge-user { background: var(--accent-soft); color: var(--accent-text); }
.badge-superadmin { background: var(--superadmin-soft); color: var(--superadmin-text); }

.plan-badge { background: var(--accent-soft); color: var(--accent-text); font-size: 0.85rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 6px; }
.plan-expires { font-size: 0.8rem; color: var(--success); }
.plan-expires.expired { color: var(--danger); }
.text-muted { color: var(--text-muted); }

.section-block { border-top: 1px solid var(--border); padding-top: 1.25rem; margin-top: 1.25rem; }
.section-label { color: var(--text-secondary); font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }

.pw-form { display: flex; flex-direction: column; gap: 1rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; }
.field input { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 8px; padding: 0.75rem 1rem; color: var(--text-body); font-size: 0.95rem; outline: none; }
.field input:focus { border-color: var(--accent); }
.form-error { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.form-success { background: var(--success-soft); border: 1px solid var(--success-border); color: var(--success); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
</style>
