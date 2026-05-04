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

  describe('articles', () => {
    it('getArticles without filter', async () => {
      mockResponse([])
      await api.getArticles()
      expect(mockFetch).toHaveBeenCalledWith('/api/articles', expect.any(Object))
    })

    it('getArticles with mode filter', async () => {
      mockResponse([])
      await api.getArticles('auto')
      expect(mockFetch).toHaveBeenCalledWith('/api/articles?mode=auto', expect.any(Object))
    })

    it('createArticle sends POST', async () => {
      mockResponse({ article: {}, credits: 5 })
      await api.createArticle({ keyword: 'test', type: 'article', comment: '', word_count: 1000 })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/articles',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('keywords', () => {
    it('getKeywordRequests calls /keywords', async () => {
      mockResponse([])
      await api.getKeywordRequests()
      expect(mockFetch).toHaveBeenCalledWith('/api/keywords', expect.any(Object))
    })

    it('createKeywordRequest sends POST', async () => {
      mockResponse({ keywordRequest: {} })
      await api.createKeywordRequest({ topic: 't', niche: 'n', user_prompt: 'p', region: 'r', language: 'ru' })
      expect(mockFetch).toHaveBeenCalledWith('/api/keywords', expect.objectContaining({ method: 'POST' }))
    })

    it('toggleKeywordUsed sends PATCH', async () => {
      mockResponse({})
      await api.toggleKeywordUsed(1, 'test keyword')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/keywords/1/used',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ keyword: 'test keyword' }) }),
      )
    })

    it('deleteKeyword sends DELETE with body', async () => {
      mockResponse({})
      await api.deleteKeyword(1, 'kw')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/keywords/1',
        expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ keyword: 'kw' }) }),
      )
    })
  })

  describe('links', () => {
    it('getLinks filters by kind', async () => {
      mockResponse([])
      await api.getLinks('interlink')
      expect(mockFetch).toHaveBeenCalledWith('/api/links?kind=interlink', expect.any(Object))
    })

    it('createLink sends POST', async () => {
      mockResponse({ id: 1 })
      await api.createLink({ kind: 'case', type: 't', topic: 'tp', url: 'u' })
      expect(mockFetch).toHaveBeenCalledWith('/api/links', expect.objectContaining({ method: 'POST' }))
    })

    it('updateLink sends PUT', async () => {
      mockResponse({ id: 1 })
      await api.updateLink(1, { topic: 'new' })
      expect(mockFetch).toHaveBeenCalledWith('/api/links/1', expect.objectContaining({ method: 'PUT' }))
    })

    it('deleteLink sends DELETE', async () => {
      mockResponse({ deleted: true })
      await api.deleteLink(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/links/1', expect.objectContaining({ method: 'DELETE' }))
    })
  })

  describe('settings', () => {
    it('getSettings calls /settings', async () => {
      mockResponse({})
      await api.getSettings()
      expect(mockFetch).toHaveBeenCalledWith('/api/settings', expect.any(Object))
    })

    it('saveSettings sends PUT', async () => {
      mockResponse({})
      await api.saveSettings({ language: 'en', niche: 'test' })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({ method: 'PUT' }),
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

  describe('documents', () => {
    it('getDocReferences calls /documents/references', async () => {
      mockResponse([])
      await api.getDocReferences()
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/references', expect.any(Object))
    })

    it('deleteDocReference sends DELETE', async () => {
      mockResponse({ deleted: true })
      await api.deleteDocReference(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/references/1', expect.objectContaining({ method: 'DELETE' }))
    })

    it('getDocAnalyses calls /documents/analyses', async () => {
      mockResponse([])
      await api.getDocAnalyses()
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/analyses', expect.any(Object))
    })

    it('deleteDocAnalysis sends DELETE', async () => {
      mockResponse({ deleted: true })
      await api.deleteDocAnalysis(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/documents/analyses/1', expect.objectContaining({ method: 'DELETE' }))
    })
  })

  describe('reels', () => {
    it('getReelsConfig calls /reels/config', async () => {
      mockResponse({})
      await api.getReelsConfig()
      expect(mockFetch).toHaveBeenCalledWith('/api/reels/config', expect.any(Object))
    })

    it('saveReelsConfig sends PUT', async () => {
      mockResponse({})
      await api.saveReelsConfig({ batch_size: 3, enabled: 1 })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/reels/config',
        expect.objectContaining({ method: 'PUT' }),
      )
    })

    it('getReelsPosts calls /reels/posts', async () => {
      mockResponse([])
      await api.getReelsPosts()
      expect(mockFetch).toHaveBeenCalledWith('/api/reels/posts', expect.any(Object))
    })

    it('deleteReelsPost sends DELETE', async () => {
      mockResponse({ deleted: true })
      await api.deleteReelsPost(1)
      expect(mockFetch).toHaveBeenCalledWith('/api/reels/posts/1', expect.objectContaining({ method: 'DELETE' }))
    })

    it('runReels sends POST', async () => {
      mockResponse({ status: 'started', message: 'ok' })
      await api.runReels()
      expect(mockFetch).toHaveBeenCalledWith('/api/reels/run', expect.objectContaining({ method: 'POST' }))
    })
  })

  describe('chat', () => {
    it('chat sends POST with message', async () => {
      mockResponse({ answer: 'Hello', credits: 9 })
      const res = await api.chat('Hi')
      expect(res).toEqual({ answer: 'Hello', credits: 9 })
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/chat',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'Hi' }) }),
      )
    })
  })
})
