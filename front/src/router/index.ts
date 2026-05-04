import { createRouter, createWebHistory } from 'vue-router'
import LandingView from '@/views/LandingView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingView },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
    { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { auth: true } },
    { path: '/wb-analytics', name: 'wb-analytics', component: () => import('@/views/WbAnalyticsView.vue'), meta: { auth: true, product: 'wb-analytics' } },
    { path: '/404', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
    {
      path: '/admin',
      component: () => import('@/views/AdminLayout.vue'),
      meta: { admin: true },
      redirect: '/admin/users',
      children: [
        { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue') },
        { path: 'users/:id', name: 'user-detail', component: () => import('@/views/UserDetailView.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/AdminSettingsView.vue') },
        { path: 'logs', name: 'admin-logs', component: () => import('@/views/ServiceLogsView.vue') },
      ],
    },
  ],
})

const showLanding = import.meta.env.VITE_SHOW_LANDING !== 'false'

const PRODUCT_ROUTES: Record<string, string> = { 'wb-analytics': '/wb-analytics' }

export function getDefaultRoute(): string {
  const auth = useAuthStore()
  if (auth.isAdmin) return '/admin'
  if (auth.user) {
    try {
      const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
      if (ids.includes('wb-analytics')) return '/wb-analytics'
    } catch {}
  }
  if (showLanding) return '/'
  return '/profile'
}

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.name === 'landing' && !showLanding) return '/login'
  if (to.meta.auth && !auth.isAuth) return '/login'
  if (to.meta.admin && !auth.isAdmin) return '/login'
  if (to.meta.product && auth.isAuth && auth.user) {
    try {
      const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
      if (!ids.includes(to.meta.product as string)) return '/404'
    } catch {}
  }
  if (to.meta.guest && auth.isAuth) return getDefaultRoute()
})

export default router
