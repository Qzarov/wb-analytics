<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type User, type Plan } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { ArrowLeft, Save, Trash2, Check, AlertCircle, Plus, Minus } from 'lucide-vue-next'

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
  <div class="wb-analytics">
    <!-- Back link -->
    <RouterLink to="/admin/users" class="frox-back">
      <ArrowLeft :size="14" />
      Назад к списку
    </RouterLink>

    <div v-if="loading" class="frox-empty">Загрузка...</div>
    <div v-else-if="error && !user" class="frox-alert frox-alert-error">{{ error }}</div>
    <template v-else-if="user">
      <!-- Header -->
      <div class="flex items-center justify-between mb-1">
        <h2 class="font-bold text-[28px] leading-[35px] text-gray-1100 dark:text-gray-dark-1100">{{ user.name }}</h2>
      </div>
      <div class="flex items-center text-xs text-gray-500 dark:text-gray-dark-500 gap-x-[11px] mb-7">
        <span>ID: {{ user.id }}</span>
        <span class="text-gray-300">&middot;</span>
        <span>{{ user.email }}</span>
        <span class="text-gray-300">&middot;</span>
        <span>Регистрация: {{ formatDate(user.created_at) }}</span>
      </div>

      <div class="frox-grid">
        <!-- Left column: Basic info -->
        <div class="frox-card">
          <h3 class="frox-card-title">Основное</h3>
          <form @submit.prevent="save" class="frox-form">
            <div class="frox-field">
              <label class="frox-label">Имя</label>
              <input v-model="editName" type="text" class="frox-input" />
            </div>
            <div class="frox-field">
              <label class="frox-label">Роль</label>
              <select v-model="editRole" class="frox-input" :disabled="!auth.isSuperAdmin">
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option v-if="auth.isSuperAdmin" value="superadmin">superadmin</option>
              </select>
              <span v-if="!auth.isSuperAdmin" class="frox-hint">Только суперадмин может менять роли</span>
            </div>
            <div class="frox-field">
              <label class="frox-label">Кредиты (прямое значение)</label>
              <input v-model.number="editCredits" type="number" min="0" class="frox-input" />
            </div>
            <div class="frox-field">
              <label class="frox-toggle-label">
                <span class="frox-toggle-track" :class="{ active: editAdvancedSettings }">
                  <input type="checkbox" v-model="editAdvancedSettings" class="frox-toggle-input" />
                  <span class="frox-toggle-thumb"></span>
                </span>
                Продвинутые настройки
              </label>
              <span class="frox-hint">Открывает доступ к расширенным параметрам генерации</span>
            </div>
            <div class="frox-field">
              <label class="frox-label">Доступные продукты</label>
              <div class="frox-checkboxes">
                <label v-for="p in ALL_PRODUCTS" :key="p.id" class="frox-check-item">
                  <input type="checkbox" v-model="editProducts[p.id]" class="frox-checkbox" />
                  {{ p.label }}
                </label>
              </div>
            </div>

            <Transition name="toast">
              <div v-if="error" class="frox-alert frox-alert-error">{{ error }}</div>
            </Transition>
            <Transition name="toast">
              <div v-if="success" class="frox-alert frox-alert-success">
                <Check :size="14" /> {{ success }}
              </div>
            </Transition>

            <div class="flex gap-3 mt-2">
              <button type="submit" class="frox-btn frox-btn-brand" :disabled="saving">
                <Save :size="14" />
                {{ saving ? 'Сохранение...' : 'Сохранить' }}
              </button>
              <button v-if="user.role !== 'superadmin'" type="button" class="frox-btn frox-btn-danger" @click="remove">
                <Trash2 :size="14" />
                Удалить
              </button>
            </div>
          </form>
        </div>

        <!-- Right column: Plan + Credits -->
        <div class="frox-right-col">
          <!-- Plan -->
          <div class="frox-card">
            <h3 class="frox-card-title">Тариф</h3>
            <div v-if="currentPlan" class="frox-plan-block">
              <div class="flex items-center justify-between mb-2">
                <span class="frox-badge frox-badge-violet">{{ currentPlan.name }}</span>
                <span class="frox-plan-expires" :class="{ expired: planExpired }">
                  {{ planExpired ? 'Истёк' : 'до' }} {{ formatDate(user.plan_expires_at) }}
                </span>
              </div>
              <p class="frox-plan-detail">{{ currentPlan.credits.toLocaleString() }} кредитов &middot; {{ currentPlan.duration_days }} дн. &middot; {{ currentPlan.price === 0 ? 'Бесплатно' : `${currentPlan.price} ₽` }}</p>
              <button class="frox-link-danger" @click="removeUserPlan">Снять тариф</button>
            </div>
            <div v-else class="frox-empty-sm">Тариф не назначен</div>
            <div class="frox-assign-row">
              <select v-model="selectedPlanId" class="frox-input">
                <option value="" disabled>Назначить тариф...</option>
                <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.name }} ({{ p.credits }} кр., {{ p.duration_days }} дн.)</option>
              </select>
              <button class="frox-btn frox-btn-brand frox-btn-sm" :disabled="!selectedPlanId" @click="assignSelectedPlan">Назначить</button>
            </div>
          </div>

          <!-- Credits -->
          <div class="frox-card">
            <h3 class="frox-card-title">Кредиты: {{ user.credits.toLocaleString() }}</h3>
            <div class="frox-assign-row">
              <input v-model.number="creditsToAdd" type="number" placeholder="Количество" class="frox-input" />
              <button class="frox-btn frox-btn-brand frox-btn-sm" :disabled="!creditsToAdd" @click="doAddCredits">
                <Plus v-if="creditsToAdd >= 0" :size="14" />
                <Minus v-else :size="14" />
                {{ creditsToAdd >= 0 ? 'Начислить' : 'Списать' }}
              </button>
            </div>
            <span class="frox-hint">Введите отрицательное число для списания</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Grid */
.frox-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 900px) {
  .frox-grid { grid-template-columns: 1fr; }
}
.frox-right-col { display: flex; flex-direction: column; gap: 20px; }

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
.frox-card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--gray-1100);
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--neutral-accent);
}
.dark .frox-card-title {
  color: var(--dark-gray-1100);
  border-color: var(--dark-neutral-border);
}

/* Back link */
.frox-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-brands);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  margin-bottom: 20px;
  transition: opacity 0.15s;
}
.frox-back:hover { opacity: 0.75; }

/* Form */
.frox-form { display: flex; flex-direction: column; gap: 18px; }
.frox-field { display: flex; flex-direction: column; gap: 6px; }
.frox-label { font-size: 13px; color: var(--gray-500); font-weight: 500; }
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

/* Checkboxes */
.frox-checkboxes { display: flex; flex-direction: column; gap: 8px; }
.frox-check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--gray-800);
  font-size: 14px;
  cursor: pointer;
}
.dark .frox-check-item { color: var(--dark-gray-800); }
.frox-checkbox { width: 16px; height: 16px; accent-color: var(--color-brands); cursor: pointer; }

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
.frox-btn-sm { padding: 8px 14px; font-size: 13px; }
.frox-btn-brand { background: var(--color-brands); color: #fff; }
.frox-btn-brand:hover:not(:disabled) { opacity: 0.9; }
.frox-btn-danger { background: var(--bg-3); color: var(--red-accent); }
.frox-btn-danger:hover:not(:disabled) { opacity: 0.85; }

/* Badge */
.frox-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.frox-badge-violet { background: var(--bg-10); color: var(--violet-accent); }

/* Plan block */
.frox-plan-block {
  background: var(--gray-100);
  border: 1px solid var(--neutral-accent);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}
.dark .frox-plan-block {
  background: var(--dark-gray-100);
  border-color: var(--dark-neutral-border);
}
.frox-plan-expires {
  color: var(--green-accent);
  font-size: 13px;
  font-weight: 500;
}
.frox-plan-expires.expired { color: var(--red-accent); }
.frox-plan-detail { color: var(--gray-500); font-size: 13px; margin-bottom: 8px; }
.dark .frox-plan-detail { color: var(--dark-gray-500); }
.frox-link-danger {
  background: none;
  border: none;
  color: var(--red-accent);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.frox-link-danger:hover { opacity: 0.75; }

.frox-assign-row { display: flex; gap: 8px; margin-bottom: 8px; }
.frox-assign-row .frox-input { flex: 1; }

.frox-empty-sm {
  color: var(--gray-400);
  font-size: 14px;
  margin-bottom: 16px;
}
.dark .frox-empty-sm { color: var(--dark-gray-400); }

/* Alerts */
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
.frox-alert-success { background: var(--bg-5); color: var(--green-accent); }

/* Empty */
.frox-empty {
  text-align: center;
  color: var(--gray-400);
  padding: 32px;
  font-size: 14px;
}
.dark .frox-empty { color: var(--dark-gray-400); }

/* Transitions */
.toast-enter-active, .toast-leave-active { transition: all 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
