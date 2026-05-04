import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock api module
vi.mock('@/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  },
}))

import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'

const mockUser = {
  id: 1, name: 'Test', email: 'a@b.com', role: 'user',
  credits: 10, plan_id: null, plan_expires_at: null,
  advanced_settings: 0, visible_products: '["articles"]',
}
const mockAdmin = { ...mockUser, id: 2, role: 'admin' }
const mockSuperAdmin = { ...mockUser, id: 3, role: 'superadmin' }

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
})

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useAuthStore', () => {
  describe('initial state', () => {
    it('starts unauthenticated', () => {
      const auth = useAuthStore()
      expect(auth.isAuth).toBe(false)
      expect(auth.isAdmin).toBe(false)
      expect(auth.isSuperAdmin).toBe(false)
      expect(auth.user).toBeNull()
      expect(auth.token).toBe('')
    })

    it('restores from localStorage', () => {
      store['token'] = 'saved-token'
      store['user'] = JSON.stringify(mockUser)
      setActivePinia(createPinia())
      const auth = useAuthStore()
      expect(auth.isAuth).toBe(true)
      expect(auth.user?.email).toBe('a@b.com')
    })
  })

  describe('login', () => {
    it('calls api.login and stores result', async () => {
      vi.mocked(api.login).mockResolvedValue({ token: 'jwt1', user: mockUser })
      const auth = useAuthStore()
      await auth.login('a@b.com', '123456')
      expect(api.login).toHaveBeenCalledWith('a@b.com', '123456')
      expect(auth.isAuth).toBe(true)
      expect(auth.token).toBe('jwt1')
      expect(auth.user?.name).toBe('Test')
      expect(store['token']).toBe('jwt1')
    })

    it('propagates login errors', async () => {
      vi.mocked(api.login).mockRejectedValue(new Error('Invalid credentials'))
      const auth = useAuthStore()
      await expect(auth.login('a@b.com', 'bad')).rejects.toThrow('Invalid credentials')
      expect(auth.isAuth).toBe(false)
    })
  })

  describe('register', () => {
    it('calls api.register and stores result', async () => {
      vi.mocked(api.register).mockResolvedValue({ token: 'jwt2', user: mockUser })
      const auth = useAuthStore()
      await auth.register('Test', 'a@b.com', '123456')
      expect(api.register).toHaveBeenCalledWith('Test', 'a@b.com', '123456')
      expect(auth.isAuth).toBe(true)
    })
  })

  describe('logout', () => {
    it('clears auth state and localStorage', async () => {
      vi.mocked(api.login).mockResolvedValue({ token: 'jwt1', user: mockUser })
      const auth = useAuthStore()
      await auth.login('a@b.com', '123456')
      expect(auth.isAuth).toBe(true)

      auth.logout()
      expect(auth.isAuth).toBe(false)
      expect(auth.user).toBeNull()
      expect(auth.token).toBe('')
      expect(store['token']).toBeUndefined()
      expect(store['user']).toBeUndefined()
    })
  })

  describe('role checks', () => {
    it('isAdmin true for admin', async () => {
      vi.mocked(api.login).mockResolvedValue({ token: 'jwt', user: mockAdmin })
      const auth = useAuthStore()
      await auth.login('a@b.com', '123456')
      expect(auth.isAdmin).toBe(true)
      expect(auth.isSuperAdmin).toBe(false)
    })

    it('isAdmin and isSuperAdmin true for superadmin', async () => {
      vi.mocked(api.login).mockResolvedValue({ token: 'jwt', user: mockSuperAdmin })
      const auth = useAuthStore()
      await auth.login('a@b.com', '123456')
      expect(auth.isAdmin).toBe(true)
      expect(auth.isSuperAdmin).toBe(true)
    })

    it('isAdmin false for regular user', async () => {
      vi.mocked(api.login).mockResolvedValue({ token: 'jwt', user: mockUser })
      const auth = useAuthStore()
      await auth.login('a@b.com', '123456')
      expect(auth.isAdmin).toBe(false)
      expect(auth.isSuperAdmin).toBe(false)
    })
  })

  describe('updateCredits', () => {
    it('updates credits in state and localStorage', async () => {
      vi.mocked(api.login).mockResolvedValue({ token: 'jwt1', user: mockUser })
      const auth = useAuthStore()
      await auth.login('a@b.com', '123456')

      auth.updateCredits(999)
      expect(auth.user?.credits).toBe(999)
      expect(JSON.parse(store['user']).credits).toBe(999)
    })

    it('does nothing when not logged in', () => {
      const auth = useAuthStore()
      auth.updateCredits(100)
      expect(auth.user).toBeNull()
    })
  })
})
