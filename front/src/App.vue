<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

const auth = useAuthStore()
const theme = useThemeStore()
const router = useRouter()
const route = useRoute()

const showLanding = import.meta.env.VITE_SHOW_LANDING !== 'false'

const hasAnalytics = computed(() => {
  if (!auth.user) return false
  try {
    const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
    return ids.includes('wb-analytics')
  } catch { return false }
})

const isDashboardRoute = computed(() =>
  route.path.startsWith('/wb-analytics') || route.path.startsWith('/admin')
)

function logout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <div class="app">
    <!-- Dashboard routes use their own layout (DashboardLayout) -->
    <template v-if="isDashboardRoute">
      <RouterView />
    </template>

    <!-- Public routes use the simple header/footer layout -->
    <template v-else>
      <header class="header">
        <nav class="nav">
          <RouterLink to="/" class="logo">WB Аналитика</RouterLink>
          <div class="nav-links">
            <RouterLink v-if="showLanding" to="/">Главная</RouterLink>

            <template v-if="!auth.isAuth">
              <RouterLink to="/register">Регистрация</RouterLink>
              <RouterLink to="/login">Вход</RouterLink>
            </template>

            <RouterLink v-if="auth.isAuth && hasAnalytics" to="/wb-analytics">Аналитика</RouterLink>

            <template v-if="auth.isAdmin">
              <span class="nav-divider"></span>
              <RouterLink to="/admin" class="admin-link">Админка</RouterLink>
            </template>

            <span class="nav-divider"></span>

            <button class="theme-toggle" @click="theme.toggle()" :title="theme.current === 'dark' ? 'Светлая тема' : 'Тёмная тема'">
              {{ theme.current === 'dark' ? '☀️' : '🌙' }}
            </button>

            <template v-if="auth.isAuth">
              <RouterLink to="/profile" class="nav-user">{{ auth.user?.name }}</RouterLink>
              <button class="nav-logout" @click="logout">Выход</button>
            </template>
          </div>
        </nav>
      </header>
      <main class="main">
        <RouterView />
      </main>
      <footer class="footer">
        <p>&copy; 2026 WB Аналитика</p>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.header {
  background: var(--bg-header);
  padding: 0 2rem;
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: 1px solid var(--border);
}
.nav {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}
.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-header);
  text-decoration: none;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.nav-links a {
  color: var(--text-header);
  opacity: 0.75;
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}
.nav-links a:hover,
.nav-links a.router-link-exact-active {
  opacity: 1;
}
.nav-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  align-self: center;
}
.admin-link {
  color: var(--text-muted) !important;
  font-size: 0.85rem !important;
}
.admin-link:hover,
.admin-link.router-link-exact-active {
  color: var(--admin-accent) !important;
}
.nav-user {
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-decoration: none;
}
.nav-user:hover {
  color: var(--accent);
}
.nav-logout {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 0.3rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  transition: all 0.2s;
}
.nav-logout:hover {
  border-color: var(--danger);
  color: var(--danger);
}
.theme-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  transition: all 0.2s;
}
.theme-toggle:hover {
  border-color: var(--accent);
}
.main {
  min-height: calc(100vh - 64px - 60px);
}
.footer {
  background: var(--bg-surface);
  color: var(--text-muted);
  text-align: center;
  padding: 1rem;
  font-size: 0.85rem;
  border-top: 1px solid var(--border);
}
</style>
