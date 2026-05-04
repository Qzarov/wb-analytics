<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type User, type Plan } from '@/api'

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
  if (role === 'superadmin') return 'badge-superadmin'
  if (role === 'admin') return 'badge-admin'
  return 'badge-user'
}
</script>

<template>
  <div class="users-page">
    <div class="users-container">
      <h1 class="page-title">Пользователи</h1>
      <div v-if="loading" class="loading">Загрузка...</div>
      <div v-else-if="error" class="form-error">{{ error }}</div>
      <div v-else>
        <table class="users-table">
          <thead>
            <tr><th>ID</th><th>Имя</th><th>Email</th><th>Роль</th><th>Тариф</th><th>Кредиты</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.id }}</td>
              <td>{{ u.name }}</td>
              <td>{{ u.email }}</td>
              <td><span class="badge" :class="roleBadge(u.role)">{{ u.role }}</span></td>
              <td>{{ planName(u.plan_id) }}</td>
              <td>{{ u.credits.toLocaleString() }}</td>
              <td><RouterLink :to="`/admin/users/${u.id}`" class="btn btn-secondary btn-sm">Подробнее</RouterLink></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-page { padding: 2rem 1rem; display: flex; justify-content: center; }
.users-container { width: 100%; max-width: 960px; }
.page-title { color: var(--text-primary); font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; }
.loading { color: var(--text-secondary); text-align: center; padding: 2rem; }
.form-error { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.users-table { width: 100%; border-collapse: collapse; background: var(--bg-surface); border-radius: 12px; overflow: hidden; }
.users-table th { text-align: left; padding: 0.75rem 1rem; color: var(--text-muted); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
.users-table td { padding: 0.75rem 1rem; color: var(--text-body); font-size: 0.9rem; border-bottom: 1px solid var(--border); }
.users-table tr:hover td { background: var(--bg-hover); }
.badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.badge-admin { background: var(--admin-accent-soft); color: var(--admin-accent); }
.badge-user { background: var(--accent-soft); color: var(--accent-text); }
.badge-superadmin { background: var(--superadmin-soft); color: var(--superadmin-text); }
.btn-sm { padding: 0.35rem 0.75rem; font-size: 0.8rem; }
</style>
