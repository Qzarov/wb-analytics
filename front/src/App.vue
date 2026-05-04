<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, THEMES } from '@/stores/theme'

const auth = useAuthStore()
const theme = useThemeStore()
const router = useRouter()

const showLanding = import.meta.env.VITE_SHOW_LANDING !== 'false'

const hasAnalytics = computed(() => {
  if (!auth.user) return false
  try {
    const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
    return ids.includes('wb-analytics')
  } catch { return false }
})

function logout() {
  auth.logout()
  router.push('/')
}
</script>

<template>
  <div class="app">
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

          <div class="theme-switcher">
            <button
              v-for="t in THEMES"
              :key="t.id"
              class="theme-btn"
              :class="{ active: theme.current === t.id, [t.id]: true }"
              :title="t.label"
              @click="theme.set(t.id)"
            ></button>
          </div>

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

/* Theme switcher */
.theme-switcher {
  display: flex;
  gap: 6px;
  align-items: center;
}
.theme-btn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}
.theme-btn.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
  transform: scale(1.15);
}
.theme-btn.dark-purple {
  background: #7c3aed;
}
.theme-btn.dark-blue {
  background: #3b82f6;
}
.theme-btn.light-green {
  background: #16a34a;
}
.theme-btn.light-gray {
  background: #a3a3a3;
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
