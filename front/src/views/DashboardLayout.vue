<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { RouterView, RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import {
  LayoutDashboard,
  MessageSquareText,
  FileBarChart,
  Settings,
  Users,
  ScrollText,
  Bell,
  Search,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ShieldCheck,
  Package,
} from 'lucide-vue-next'

const auth = useAuthStore()
const theme = useThemeStore()
const route = useRoute()
const router = useRouter()

const collapsed = ref(false)
const searchQuery = ref('')

const currentTab = computed(() => {
  if (route.path.startsWith('/admin')) return null
  return (route.query.tab as string) || 'dashboard'
})

const isAdminRoute = computed(() => route.path.startsWith('/admin'))

function isActiveLink(path: string, tab?: string): boolean {
  if (tab) {
    return route.path === '/wb-analytics' && currentTab.value === tab
  }
  return route.path.startsWith(path)
}

function goTab(tabName: string) {
  router.push({ path: '/wb-analytics', query: tabName === 'dashboard' ? {} : { tab: tabName } })
}

function toggleTheme() {
  theme.toggle()
}

function logout() {
  auth.logout()
  router.push('/login')
}

const initials = computed(() => {
  const name = auth.user?.name || ''
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U'
})

watch(() => route.path, () => {
  if (window.innerWidth < 1024) collapsed.value = true
}, { immediate: false })
</script>

<template>
  <div
    id="frox-layout"
    class="font-sans min-h-screen"
    :class="collapsed ? 'frox-collapsed' : 'frox-expanded'"
  >
    <!-- Sidebar -->
    <aside class="frox-sidebar">
      <!-- Toggle button -->
      <button
        class="frox-sidebar-toggle"
        @click="collapsed = !collapsed"
      >
        <ChevronLeft v-if="!collapsed" :size="14" />
        <ChevronRight v-if="collapsed" :size="14" />
      </button>

      <!-- Logo -->
      <div class="frox-logo">
        <div class="frox-logo-icon">
          <Package :size="22" stroke-width="2.5" />
        </div>
        <div v-if="!collapsed" class="frox-logo-text">
          <span class="font-bold text-[15px] text-gray-1100 dark:text-gray-dark-1100 leading-tight">WB Аналитика</span>
          <span class="text-[11px] text-gray-400 dark:text-gray-dark-400">Seller Dashboard</span>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="frox-nav">
        <!-- Analytics -->
        <div v-if="!collapsed" class="frox-nav-category">Аналитика</div>

        <button
          class="frox-nav-item"
          :class="{ active: isActiveLink('/wb-analytics', 'dashboard') }"
          @click="goTab('dashboard')"
        >
          <LayoutDashboard :size="18" />
          <span v-if="!collapsed" class="frox-nav-label">Дашборд</span>
        </button>

        <button
          class="frox-nav-item"
          :class="{ active: isActiveLink('/wb-analytics', 'reviews') }"
          @click="goTab('reviews')"
        >
          <MessageSquareText :size="18" />
          <span v-if="!collapsed" class="frox-nav-label">Отзывы</span>
        </button>

        <button
          class="frox-nav-item"
          :class="{ active: isActiveLink('/wb-analytics', 'reports') }"
          @click="goTab('reports')"
        >
          <FileBarChart :size="18" />
          <span v-if="!collapsed" class="frox-nav-label">Отчёты</span>
        </button>

        <button
          class="frox-nav-item"
          :class="{ active: isActiveLink('/wb-analytics', 'settings') }"
          @click="goTab('settings')"
        >
          <Settings :size="18" />
          <span v-if="!collapsed" class="frox-nav-label">Настройки WB</span>
        </button>

        <!-- Admin -->
        <template v-if="auth.isAdmin">
          <div v-if="!collapsed" class="frox-nav-category" style="margin-top: 12px;">Управление</div>
          <div v-else class="frox-nav-divider"></div>

          <RouterLink
            to="/admin/users"
            class="frox-nav-item"
            :class="{ active: isActiveLink('/admin/users') }"
          >
            <Users :size="18" />
            <span v-if="!collapsed" class="frox-nav-label">Пользователи</span>
          </RouterLink>

          <RouterLink
            to="/admin/logs"
            class="frox-nav-item"
            :class="{ active: isActiveLink('/admin/logs') }"
          >
            <ScrollText :size="18" />
            <span v-if="!collapsed" class="frox-nav-label">Логи</span>
          </RouterLink>

          <RouterLink
            to="/admin/settings"
            class="frox-nav-item"
            :class="{ active: isActiveLink('/admin/settings') }"
          >
            <ShieldCheck :size="18" />
            <span v-if="!collapsed" class="frox-nav-label">Алерты</span>
          </RouterLink>
        </template>
      </nav>

      <!-- Bottom controls -->
      <div class="frox-sidebar-bottom">
        <div class="frox-theme-toggle">
          <button class="frox-theme-btn" :class="{ active: theme.current === 'dark' }" @click="toggleTheme" :title="theme.current === 'dark' ? 'Светлая тема' : 'Тёмная тема'">
            <Moon v-if="theme.current !== 'dark'" :size="16" />
            <Sun v-if="theme.current === 'dark'" :size="16" />
          </button>
          <span v-if="!collapsed" class="text-desc text-gray-500 dark:text-gray-dark-500">
            {{ theme.current === 'dark' ? 'Тёмная' : 'Светлая' }}
          </span>
        </div>
      </div>
    </aside>

    <!-- Header -->
    <header class="frox-header">
      <div class="frox-header-left">
        <div class="frox-search">
          <Search :size="16" class="text-gray-300 dark:text-gray-dark-300" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Поиск..."
            class="frox-search-input"
          />
        </div>
      </div>

      <div class="frox-header-right">
        <!-- Notifications placeholder -->
        <button class="frox-header-icon">
          <div class="relative">
            <Bell :size="20" />
          </div>
        </button>

        <!-- User -->
        <div class="frox-user-menu">
          <div class="frox-avatar">{{ initials }}</div>
          <div v-if="!collapsed || true" class="frox-user-info">
            <span class="text-normal font-semibold text-gray-1100 dark:text-gray-dark-1100">{{ auth.user?.name }}</span>
            <span class="text-desc text-gray-400 dark:text-gray-dark-400">{{ auth.user?.role }}</span>
          </div>
          <button class="frox-logout-btn" @click="logout" title="Выход">
            <LogOut :size="16" />
          </button>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="frox-main scrollbar-hide">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
/* Grid layout */
#frox-layout {
  display: grid;
  grid-rows: auto 1fr;
  background: var(--gray-100);
  scrollbar-width: none;
}
#frox-layout::-webkit-scrollbar { display: none; }

.frox-expanded {
  grid-template-columns: 257px 1fr;
  grid-template-rows: auto 1fr;
}
.frox-collapsed {
  grid-template-columns: 78px 1fr;
  grid-template-rows: auto 1fr;
}

/* Sidebar */
.frox-sidebar {
  grid-row: 1 / -1;
  background: var(--neutral-bg);
  border-right: 1px solid var(--neutral-accent);
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  transition: all 0.3s ease;
}
.dark .frox-sidebar {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
}
.frox-sidebar::-webkit-scrollbar { display: none; }

/* Sidebar toggle */
.frox-sidebar-toggle {
  position: absolute;
  right: 0;
  top: 32px;
  transform: translateX(50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--neutral-bg);
  border: 1px solid var(--neutral-accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 10;
  transition: all 0.3s;
  color: var(--gray-500);
}
.dark .frox-sidebar-toggle {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
  color: var(--dark-gray-500);
}
.frox-sidebar-toggle:hover { opacity: 0.75; }

/* Logo */
.frox-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
  padding: 0 5px;
}
.frox-logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-brands);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.frox-logo-text {
  display: flex;
  flex-direction: column;
}
.frox-collapsed .frox-logo { justify-content: center; padding: 0; }

/* Navigation */
.frox-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.frox-nav-category {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gray-400);
  padding: 12px 12px 6px;
}
.dark .frox-nav-category { color: var(--dark-gray-400); }

.frox-nav-divider {
  height: 1px;
  background: var(--neutral-accent);
  margin: 8px 0;
}
.dark .frox-nav-divider { background: var(--dark-neutral-border); }

.frox-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--gray-500);
  font-size: 14px;
  font-weight: 500;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  text-decoration: none;
  transition: all 0.15s;
}
.dark .frox-nav-item { color: var(--dark-gray-500); }
.frox-nav-item:hover {
  background: var(--gray-100);
  color: var(--gray-800);
}
.dark .frox-nav-item:hover {
  background: var(--dark-gray-200);
  color: var(--dark-gray-900);
}
.frox-nav-item.active {
  background: var(--color-brands);
  color: #fff;
}
.frox-nav-item.active:hover {
  background: var(--color-brands);
  color: #fff;
  opacity: 0.9;
}
.frox-nav-label { white-space: nowrap; }
.frox-collapsed .frox-nav-item {
  justify-content: center;
  padding: 12px;
}

/* Bottom controls */
.frox-sidebar-bottom {
  margin-top: auto;
  padding-top: 16px;
}
.frox-theme-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--gray-100);
}
.dark .frox-theme-toggle { background: var(--dark-gray-200); }
.frox-collapsed .frox-theme-toggle { justify-content: center; padding: 10px; }

.frox-theme-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--neutral-bg);
  border: 1px solid var(--neutral-accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--gray-500);
  transition: all 0.2s;
  flex-shrink: 0;
}
.dark .frox-theme-btn {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
  color: var(--dark-gray-500);
}
.frox-theme-btn:hover { border-color: var(--color-brands); color: var(--color-brands); }

/* Header */
.frox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--neutral-bg);
  padding: 16px 28px;
  border-bottom: 1px solid var(--neutral-accent);
  gap: 16px;
}
.dark .frox-header {
  background: var(--dark-neutral-bg);
  border-color: var(--dark-neutral-border);
}

.frox-header-left { display: flex; align-items: center; gap: 16px; flex: 1; }
.frox-header-right { display: flex; align-items: center; gap: 24px; }

/* Search */
.frox-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--gray-100);
  border-radius: 10px;
  padding: 10px 16px;
  width: 100%;
  max-width: 360px;
}
.dark .frox-search { background: var(--dark-gray-100); }
.frox-search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--gray-1100);
  width: 100%;
  font-family: inherit;
}
.dark .frox-search-input { color: var(--dark-gray-1100); }
.frox-search-input::placeholder { color: var(--gray-300); font-weight: 500; }
.dark .frox-search-input::placeholder { color: var(--dark-gray-300); }

/* Header icon */
.frox-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--gray-100);
  border: none;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--gray-500);
  transition: all 0.15s;
}
.dark .frox-header-icon { background: var(--dark-gray-200); color: var(--dark-gray-500); }
.frox-header-icon:hover { color: var(--color-brands); }

/* User menu */
.frox-user-menu {
  display: flex;
  align-items: center;
  gap: 10px;
}
.frox-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-brands);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}
.frox-user-info {
  display: flex;
  flex-direction: column;
}
.frox-logout-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: none;
  border: 1px solid var(--neutral-accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--gray-400);
  transition: all 0.15s;
  margin-left: 4px;
}
.dark .frox-logout-btn { border-color: var(--dark-neutral-border); color: var(--dark-gray-400); }
.frox-logout-btn:hover { border-color: var(--red-accent); color: var(--red-accent); }

/* Main content */
.frox-main {
  overflow-x: auto;
  overflow-y: auto;
  padding: 28px 24px;
  background: var(--gray-100);
  min-height: 0;
}
.dark .frox-main { background: #000; }
</style>
