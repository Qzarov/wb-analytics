<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type User, type Plan } from '@/api'
import { Users, ChevronRight } from 'lucide-vue-next'

const users = ref<User[]>([])
const plans = ref<Plan[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const [u, p] = await Promise.all([api.getUsers(), api.getPlans()])
    users.value = u
    plans.value = p
  } catch (e: any) { error.value = e.message }
  finally { loading.value = false }
})

function planName(planId: number | null) {
  if (!planId) return '—'
  return plans.value.find(p => p.id === planId)?.name ?? '—'
}

function roleBadge(role: string) {
  if (role === 'superadmin') return 'frox-badge-violet'
  if (role === 'admin') return 'frox-badge-blue'
  return 'frox-badge-gray'
}
</script>

<template>
  <div class="wb-analytics">
    <div class="flex items-center justify-between mb-1">
      <h2 class="font-bold text-[28px] leading-[35px] text-gray-1100 dark:text-gray-dark-1100">Пользователи</h2>
    </div>
    <div class="flex items-center text-xs text-gray-500 dark:text-gray-dark-500 gap-x-[11px] mb-7">
      <span>Управление</span>
      <span class="text-gray-300">/</span>
      <span style="color: var(--color-brands)">Пользователи</span>
    </div>

    <div v-if="loading" class="frox-empty">Загрузка...</div>
    <div v-else-if="error" class="frox-alert frox-alert-error">{{ error }}</div>
    <div v-else class="frox-card" style="padding: 0; overflow: hidden;">
      <table class="frox-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя</th>
            <th>Email</th>
            <th>Роль</th>
            <th>Тариф</th>
            <th>Кредиты</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td class="frox-table-id">{{ u.id }}</td>
            <td class="frox-table-name">{{ u.name }}</td>
            <td class="frox-table-email">{{ u.email }}</td>
            <td><span class="frox-badge" :class="roleBadge(u.role)">{{ u.role }}</span></td>
            <td>{{ planName(u.plan_id) }}</td>
            <td class="frox-table-num">{{ u.credits.toLocaleString() }}</td>
            <td>
              <RouterLink :to="`/admin/users/${u.id}`" class="frox-btn frox-btn-outline frox-btn-sm">
                Подробнее <ChevronRight :size="13" />
              </RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.frox-card {
  background: var(--neutral-bg);
  border: 1px solid var(--neutral-accent);
  border-radius: 14px;
}
.dark .frox-card {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
}

.frox-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.frox-table th {
  text-align: left;
  padding: 12px 16px;
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
  padding: 12px 16px;
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
.frox-table tbody tr:last-child td {
  border-bottom: none;
}

.frox-table-id { font-weight: 600; color: var(--gray-400); font-size: 13px; }
.dark .frox-table-id { color: var(--dark-gray-400); }
.frox-table-name { font-weight: 600; color: var(--gray-1100); }
.dark .frox-table-name { color: var(--dark-gray-1100); }
.frox-table-email { color: var(--gray-500); font-size: 13px; }
.dark .frox-table-email { color: var(--dark-gray-500); }
.frox-table-num { font-weight: 600; font-variant-numeric: tabular-nums; }

/* Badge */
.frox-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.frox-badge-violet { background: var(--bg-10); color: var(--violet-accent); }
.frox-badge-blue { background: var(--bg-9); color: var(--blue-accent); }
.frox-badge-gray { background: var(--gray-200); color: var(--gray-600); }
.dark .frox-badge-gray { background: var(--dark-gray-200); color: var(--dark-gray-600); }

/* Button */
.frox-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
  font-family: inherit;
  white-space: nowrap;
}
.frox-btn-sm { padding: 6px 12px; font-size: 13px; }
.frox-btn-outline {
  background: transparent;
  border: 1px solid var(--neutral-accent);
  color: var(--gray-600);
}
.dark .frox-btn-outline {
  border-color: var(--dark-neutral-border);
  color: var(--dark-gray-600);
}
.frox-btn-outline:hover {
  border-color: var(--color-brands);
  color: var(--color-brands);
}

/* Alert */
.frox-alert-error {
  background: var(--bg-3);
  color: var(--red-accent);
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
}

/* Empty */
.frox-empty {
  text-align: center;
  color: var(--gray-400);
  padding: 32px;
  font-size: 14px;
}
.dark .frox-empty { color: var(--dark-gray-400); }
</style>
