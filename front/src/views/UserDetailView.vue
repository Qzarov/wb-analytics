<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type User, type Plan } from '@/api'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const userId = Number(route.params.id)

const user = ref<User | null>(null)
const plans = ref<Plan[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

const editName = ref('')
const editRole = ref('')
const editCredits = ref(0)
const editAdvancedSettings = ref(false)
const editProducts = ref<Record<string, boolean>>({ 'wb-analytics': true })
const ALL_PRODUCTS = [
  { id: 'wb-analytics', label: 'WB Аналитика' },
]
const selectedPlanId = ref<number | ''>('')
const creditsToAdd = ref(0)

const currentPlan = computed(() => user.value?.plan_id ? plans.value.find(p => p.id === user.value!.plan_id) : null)
const planExpired = computed(() => {
  if (!user.value?.plan_expires_at) return false
  return new Date(user.value.plan_expires_at) < new Date()
})

onMounted(async () => {
  try {
    const [u, p] = await Promise.all([api.getUser(userId), api.getPlans()])
    user.value = u; plans.value = p
    editName.value = u.name; editRole.value = u.role; editCredits.value = u.credits; editAdvancedSettings.value = Boolean(u.advanced_settings)
    try {
      const ids = JSON.parse(u.visible_products || '[]') as string[]
      editProducts.value = Object.fromEntries(ALL_PRODUCTS.map(p => [p.id, ids.includes(p.id)]))
    } catch { editProducts.value = Object.fromEntries(ALL_PRODUCTS.map(p => [p.id, true])) }
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
})

function showSuccess(msg: string) { success.value = msg; setTimeout(() => (success.value = ''), 2000) }

async function save() {
  saving.value = true; error.value = ''; success.value = ''
  try {
    const vp = JSON.stringify(ALL_PRODUCTS.filter(p => editProducts.value[p.id]).map(p => p.id))
    user.value = await api.updateUser(userId, { name: editName.value, role: editRole.value, credits: editCredits.value, advanced_settings: editAdvancedSettings.value ? 1 : 0, visible_products: vp })
    showSuccess('Сохранено')
  } catch (e: any) { error.value = e.message }
  finally { saving.value = false }
}

async function assignSelectedPlan() {
  if (!selectedPlanId.value) return; error.value = ''
  try {
    user.value = await api.assignPlan(userId, Number(selectedPlanId.value))
    editCredits.value = user.value.credits; selectedPlanId.value = ''; showSuccess('Тариф назначен')
  } catch (e: any) { error.value = e.message }
}

async function removeUserPlan() {
  if (!confirm('Снять тариф с пользователя?')) return; error.value = ''
  try {
    user.value = await api.removePlan(userId)
    editCredits.value = user.value.credits; showSuccess('Тариф снят')
  } catch (e: any) { error.value = e.message }
}

async function doAddCredits() {
  if (!creditsToAdd.value) return; error.value = ''
  try {
    user.value = await api.addCredits(userId, creditsToAdd.value)
    editCredits.value = user.value.credits; creditsToAdd.value = 0; showSuccess('Кредиты обновлены')
  } catch (e: any) { error.value = e.message }
}

async function remove() {
  if (!confirm('Удалить пользователя?')) return
  try { await api.deleteUser(userId); router.push('/admin/users') }
  catch (e: any) { error.value = e.message }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'; return new Date(iso).toLocaleDateString('ru-RU')
}
</script>

<template>
  <div class="detail-page">
    <div class="detail-card">
      <RouterLink to="/admin/users" class="back-link">&larr; Назад к списку</RouterLink>
      <div v-if="loading" class="loading">Загрузка...</div>
      <div v-else-if="error && !user" class="form-error">{{ error }}</div>
      <template v-else-if="user">
        <h1 class="detail-title">{{ user.name }}</h1>
        <p class="detail-meta">ID: {{ user.id }} &middot; {{ user.email }} &middot; Регистрация: {{ formatDate(user.created_at) }}</p>

        <!-- Basic info -->
        <div class="section-block">
          <h2 class="section-label">Основное</h2>
          <form @submit.prevent="save" class="detail-form">
            <div class="field"><label>Имя</label><input v-model="editName" type="text" /></div>
            <div class="field">
              <label>Роль</label>
              <select v-model="editRole" :disabled="!auth.isSuperAdmin">
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option v-if="auth.isSuperAdmin" value="superadmin">superadmin</option>
              </select>
              <span v-if="!auth.isSuperAdmin" class="field-hint">Только суперадмин может менять роли</span>
            </div>
            <div class="field"><label>Кредиты (прямое значение)</label><input v-model.number="editCredits" type="number" min="0" /></div>
            <div class="field field-toggle">
              <label class="toggle-label">
                <span class="toggle-track" :class="{ active: editAdvancedSettings }">
                  <input type="checkbox" v-model="editAdvancedSettings" class="toggle-input" />
                  <span class="toggle-thumb"></span>
                </span>
                Продвинутые настройки
              </label>
              <span class="field-hint">Открывает доступ к расширенным параметрам генерации (вебхук и др.)</span>
            </div>
            <div class="field">
              <label>Доступные продукты</label>
              <div class="products-checkboxes">
                <label v-for="p in ALL_PRODUCTS" :key="p.id" class="product-check">
                  <input type="checkbox" v-model="editProducts[p.id]" />
                  {{ p.label }}
                </label>
              </div>
            </div>
            <div v-if="error" class="form-error">{{ error }}</div>
            <div v-if="success" class="form-success">{{ success }}</div>
            <div class="actions">
              <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
              <button v-if="user.role !== 'superadmin'" type="button" class="btn btn-danger" @click="remove">Удалить</button>
            </div>
          </form>
        </div>

        <!-- Plan -->
        <div class="section-block">
          <h2 class="section-label">Тариф</h2>
          <div v-if="currentPlan" class="plan-info">
            <div class="plan-info-row">
              <span class="plan-badge">{{ currentPlan.name }}</span>
              <span class="plan-expires" :class="{ expired: planExpired }">
                {{ planExpired ? 'Истёк' : 'до' }} {{ formatDate(user.plan_expires_at) }}
              </span>
            </div>
            <p class="plan-detail">{{ currentPlan.credits.toLocaleString() }} кредитов &middot; {{ currentPlan.duration_days }} дн. &middot; {{ currentPlan.price === 0 ? 'Бесплатно' : `${currentPlan.price} ₽` }}</p>
            <button class="btn-link-danger" @click="removeUserPlan">Снять тариф</button>
          </div>
          <div v-else class="plan-none">Тариф не назначен</div>
          <div class="assign-row">
            <select v-model="selectedPlanId">
              <option value="" disabled>Назначить тариф...</option>
              <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.name }} ({{ p.credits }} кр., {{ p.duration_days }} дн.)</option>
            </select>
            <button class="btn btn-primary btn-sm" :disabled="!selectedPlanId" @click="assignSelectedPlan">Назначить</button>
          </div>
        </div>

        <!-- Credits -->
        <div class="section-block">
          <h2 class="section-label">Кредиты: {{ user.credits.toLocaleString() }}</h2>
          <div class="credits-row">
            <input v-model.number="creditsToAdd" type="number" placeholder="Количество" />
            <button class="btn btn-primary btn-sm" :disabled="!creditsToAdd" @click="doAddCredits">{{ creditsToAdd >= 0 ? 'Начислить' : 'Списать' }}</button>
          </div>
          <span class="field-hint">Введите отрицательное число для списания</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.detail-page { display: flex; justify-content: center; padding: 2rem 1rem; }
.detail-card { width: 100%; max-width: 600px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 2rem; }
.back-link { color: var(--accent); font-size: 0.85rem; display: inline-block; margin-bottom: 1.5rem; }
.detail-title { color: var(--text-primary); font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
.detail-meta { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem; }
.loading { color: var(--text-secondary); text-align: center; padding: 2rem; }

.section-block { border-top: 1px solid var(--border); padding-top: 1.25rem; margin-bottom: 1.5rem; }
.section-label { color: var(--text-secondary); font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem; }

.plan-info { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 10px; padding: 1rem; margin-bottom: 0.75rem; }
.plan-info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.plan-badge { background: var(--accent-soft); color: var(--accent-text); font-size: 0.85rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 6px; }
.plan-expires { color: var(--success); font-size: 0.8rem; font-weight: 500; }
.plan-expires.expired { color: var(--danger); }
.plan-detail { color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 0.75rem; }
.plan-none { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.75rem; }
.btn-link-danger { background: none; border: none; color: var(--danger); font-size: 0.8rem; text-decoration: underline; cursor: pointer; padding: 0; }
.assign-row { display: flex; gap: 0.5rem; }
.assign-row select { flex: 1; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 8px; padding: 0.5rem 0.75rem; color: var(--text-body); font-size: 0.85rem; outline: none; }
.assign-row select:focus { border-color: var(--accent); }

.credits-row { display: flex; gap: 0.5rem; margin-bottom: 0.3rem; }
.credits-row input { flex: 1; background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 8px; padding: 0.5rem 0.75rem; color: var(--text-body); font-size: 0.9rem; outline: none; }
.credits-row input:focus { border-color: var(--accent); }

.detail-form { display: flex; flex-direction: column; gap: 1.25rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; }
.field input, .field select { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 8px; padding: 0.75rem 1rem; color: var(--text-body); font-size: 0.95rem; outline: none; }
.field input:focus, .field select:focus { border-color: var(--accent); }
.form-error { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.form-success { background: var(--success-soft); border: 1px solid var(--success-border); color: var(--success); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.actions { display: flex; gap: 1rem; }
.btn-sm { padding: 0.45rem 0.85rem; font-size: 0.85rem; }
.btn-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-border); padding: 0.75rem 1.5rem; border-radius: 8px; font-size: 1rem; font-weight: 600; }
.btn-danger:hover { opacity: 0.85; }
.field-hint { color: var(--text-muted); font-size: 0.75rem; }

.field-toggle { gap: 0.5rem; }
.toggle-label { display: flex; align-items: center; gap: 0.6rem; font-size: 0.95rem; color: var(--text-body); cursor: pointer; user-select: none; }
.toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }
.toggle-track { position: relative; display: inline-flex; align-items: center; width: 40px; height: 22px; border-radius: 11px; background: var(--border-input); border: 1px solid var(--border); transition: background 0.2s, border-color 0.2s; flex-shrink: 0; }
.toggle-track.active { background: var(--accent); border-color: var(--accent); }
.toggle-thumb { position: absolute; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.toggle-track.active .toggle-thumb { transform: translateX(18px); }

.products-checkboxes { display: flex; flex-direction: column; gap: 0.5rem; }
.product-check { display: flex; align-items: center; gap: 0.5rem; color: var(--text-body); font-size: 0.9rem; cursor: pointer; }
.product-check input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }
</style>
