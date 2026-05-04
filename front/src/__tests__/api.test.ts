import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
})

// Import after mocks are set
const { api } = await import('@/api')

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(store).forEach(k => delete store[k])
})

function mockResponse(data: any, ok = true, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    json: () => Promise.resolve(data),
  })
}

describe('api module', () => {
  describe('auth', () => {
    it('login sends correct request', async () => {
      const response = { token: 'jwt123', user: { id: 1, name: 'Test', email: 'a@b.com', role: 'user', credits: 10, plan_id: null, plan_expires_at: null, advanced_settings: 0, visible_products: '[]' } }
      mockResponse(response)

      const result = await api.login('a@b.com', '123456')
      expect(result).toEqual(response)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'a@b.com', password: '123456' }),
        }),
      )
    })

    it('register sends correct request', async () => {
      const response = { token: 'jwt456', user: { id: 2, name: 'New', email: 'b@c.com', role: 'user', credits: 0, plan_id: null, plan_expires_at: null, advanced_settings: 0, visible_products: '[]' } }
      mockResponse(response)

      const result = await api.register('New', 'b@c.com', 'pass123')
      expect(result).toEqual(response)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New', email: 'b@c.com', password: 'pass123' }),
        }),
      )
    })

    it('getMe calls /auth/me', async () => {
      mockResponse({ id: 1, name: 'Test', email: 'a@b.com', role: 'user', credits: 10, plan_id: null, plan_expires_at: null, advanced_settings: 0, visible_products: '[]' })
      await api.getMe()
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', expect.any(Object))
    })

    it('changePassword sends PUT', async () => {
      mockResponse({ ok: true })
      await api.changePassword('old', 'new')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/password',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ current_password: 'old', new_password: 'new' }) }),
      )
    })
  })

  describe('auth headers', () => {
    it('includes Bearer token when set in localStorage', async () => {
      store['token'] = 'my-jwt-token'
      mockResponse({ id: 1 })

      await api.getMe()
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers['Authorization']).toBe('Bearer my-jwt-token')
    })

    it('omits Authorization when no token', async () => {
      mockResponse({ id: 1 })
      await api.getMe()
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers['Authorization']).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockResponse({ error: 'Invalid credentials' }, false, 401)
      await expect(api.login('a@b.com', 'wrong')).rejects.toThrow('Invalid credentials')
    })

    it('throws HTTP status when no error field', async () => {
      mockResponse({}, false, 500)
      await expect(api.getMe()).rejects.toThrow('HTTP 500')
    })
  })

  describe('users', () => {
    it('getUsers calls /users', async () => {
      mockResponse([])
      await api.getUsers()
      expect(mockFetch).toHaveBeenCalledWith('/api/users', expect.any(Object))
    })

    it('getUser calls /users/:id', async () => {
      mockResponse({ id: 5 })
      await api.getUser(5)
      expect(mockFetch).toHaveBeenCalledWith('/api/users/5', expect.any(Object))
    })

    it('updateUser sends PUT', async () => {
      mockResponse({ id: 5, name: 'Updated' })
      await api.updateUser(5, { name: 'Updated', credits: 100 })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/5',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Updated', credits: 100 }) }),
      )
    })

    it('deleteUser sends DELETE', async () => {
      mockResponse({ deleted: true })
      await api.deleteUser(5)
      expect(mockFetch).toHaveBeenCalledWith('/api/users/5', expect.objectContaining({ method: 'DELETE' }))
    })

    it('assignPlan sends POST', async () => {
      mockResponse({ id: 1, plan_id: 2 })
      await api.assignPlan(1, 2)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1/plan',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan_id: 2 }) }),
      )
    })

    it('removePlan sends DELETE', async () => {
      mockResponse({ id: 1, plan_id: null })
      await api.removePlan(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/users/1/plan', expect.objectContaining({ method: 'DELETE' }))
    })

    it('addCredits sends POST', async () => {
      mockResponse({ id: 1, credits: 150 })
      await api.addCredits(1, 50)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1/credits',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 50 }) }),
      )
    })
  })

  describe('payments', () => {
    it('getPayments calls /payments/info', async () => {
      mockResponse({ providers: [], plans: [] })
      await api.getPayments()
      expect(mockFetch).toHaveBeenCalledWith('/api/payments/info', expect.any(Object))
    })

    it('getPlans calls /payments/plans', async () => {
      mockResponse([])
      await api.getPlans()
      expect(mockFetch).toHaveBeenCalledWith('/api/payments/plans', expect.any(Object))
    })

    it('createPlan sends POST', async () => {
      mockResponse({ id: 1 })
      await api.createPlan({ name: 'Basic', description: '', credits: 100, price: 10, duration_days: 30, sort_order: 1 })
      expect(mockFetch).toHaveBeenCalledWith('/api/payments/plans', expect.objectContaining({ method: 'POST' }))
    })

    it('updatePlan sends PUT', async () => {
      mockResponse({ id: 1 })
      await api.updatePlan(1, { price: 20 })
      expect(mockFetch).toHaveBeenCalledWith('/api/payments/plans/1', expect.objectContaining({ method: 'PUT' }))
    })

    it('deletePlan sends DELETE', async () => {
      mockResponse({ deleted: true })
      await api.deletePlan(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/payments/plans/1', expect.objectContaining({ method: 'DELETE' }))
    })

    it('checkout sends POST', async () => {
      mockResponse({ payment_url: 'https://pay.example.com', invoice_id: 'inv1' })
      await api.checkout(1)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/payments/checkout',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ plan_id: 1 }) }),
      )
    })
  })

})
