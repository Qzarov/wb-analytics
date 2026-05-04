import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { defineComponent, h } from 'vue'

// Mock api for auth store
vi.mock('@/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  },
}))

// Mock import.meta.env
vi.stubEnv('VITE_SHOW_LANDING', 'true')

import { useAuthStore } from '@/stores/auth'

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
})

const Stub = defineComponent({ render: () => h('div') })

function makeRouter() {
  // Recreate the router guards manually since we can't easily import the real one
  const auth = useAuthStore()

  const routes: RouteRecordRaw[] = [
    { path: '/', name: 'landing', component: Stub },
    { path: '/login', name: 'login', component: Stub, meta: { guest: true } },
    { path: '/register', name: 'register', component: Stub, meta: { guest: true } },
    { path: '/profile', name: 'profile', component: Stub, meta: { auth: true } },
    { path: '/articles', name: 'articles', component: Stub, meta: { auth: true, product: 'articles' } },
    { path: '/reels', name: 'reels', component: Stub, meta: { auth: true, product: 'reels' } },
    { path: '/404', name: 'not-found', component: Stub },
    {
      path: '/admin',
      component: Stub,
      meta: { admin: true },
      redirect: '/admin/users',
      children: [
        { path: 'users', name: 'users', component: Stub },
      ],
    },
  ]

  const router = createRouter({ history: createWebHistory(), routes })

  router.beforeEach((to) => {
    if (to.meta.auth && !auth.isAuth) return '/login'
    if ((to.meta.admin || to.matched.some(r => r.meta.admin)) && !auth.isAdmin) return '/login'
    if (to.meta.product && auth.isAuth && auth.user) {
      try {
        const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
        if (!ids.includes(to.meta.product as string)) return '/404'
      } catch {}
    }
    if (to.meta.guest && auth.isAuth) return '/'
  })

  return router
}

const mockUser = (overrides: Record<string, any> = {}) => ({
  id: 1, name: 'Test', email: 'a@b.com', role: 'user',
  credits: 10, plan_id: null, plan_expires_at: null,
  advanced_settings: 0, visible_products: '["articles"]',
  ...overrides,
})

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  setActivePinia(createPinia())
})

describe('router guards', () => {
  it('redirects unauthenticated user from /profile to /login', async () => {
    const router = makeRouter()
    await router.push('/profile')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows authenticated user to /profile', async () => {
    const auth = useAuthStore()
    auth.$patch({ token: 'jwt', user: mockUser() })
    const router = makeRouter()
    await router.push('/profile')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('redirects unauthenticated user from /admin to /login', async () => {
    const router = makeRouter()
    await router.push('/admin')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('allows admin to /admin', async () => {
    const auth = useAuthStore()
    auth.$patch({ token: 'jwt', user: mockUser({ role: 'admin' }) })
    const router = makeRouter()
    await router.push('/admin/users')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/admin/users')
  })

  it('redirects to /404 when product not in visible_products', async () => {
    const auth = useAuthStore()
    auth.$patch({ token: 'jwt', user: mockUser({ visible_products: '["articles"]' }) })
    const router = makeRouter()
    await router.push('/reels')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/404')
  })

  it('allows access when product is in visible_products', async () => {
    const auth = useAuthStore()
    auth.$patch({ token: 'jwt', user: mockUser({ visible_products: '["articles","reels"]' }) })
    const router = makeRouter()
    await router.push('/reels')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/reels')
  })

  it('redirects authenticated user from /login (guest route) to /', async () => {
    const auth = useAuthStore()
    auth.$patch({ token: 'jwt', user: mockUser() })
    const router = makeRouter()
    await router.push('/login')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
