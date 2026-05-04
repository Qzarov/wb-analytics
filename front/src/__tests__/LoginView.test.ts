import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { defineComponent, h } from 'vue'

// Mock api
vi.mock('@/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  },
}))

// Mock router module's getDefaultRoute
vi.mock('@/router', () => ({
  getDefaultRoute: () => '/profile',
}))

import { api } from '@/api'
import LoginView from '@/views/LoginView.vue'

const Stub = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/login', component: LoginView },
      { path: '/profile', component: Stub },
      { path: '/register', component: Stub },
    ],
  })
}

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

describe('LoginView', () => {
  function mountLogin() {
    const router = makeRouter()
    router.push('/login')
    return mount(LoginView, {
      global: {
        plugins: [createPinia(), router],
      },
    })
  }

  it('renders login form', () => {
    const wrapper = mountLogin()
    expect(wrapper.find('h1').text()).toBe('Вход')
    expect(wrapper.find('input#email').exists()).toBe(true)
    expect(wrapper.find('input#password').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('submit button disabled when fields empty', () => {
    const wrapper = mountLogin()
    const btn = wrapper.find('button[type="submit"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('submit button enabled with valid input', async () => {
    const wrapper = mountLogin()
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('123456')
    const btn = wrapper.find('button[type="submit"]')
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('shows error on failed login', async () => {
    vi.mocked(api.login).mockRejectedValue(new Error('Invalid credentials'))
    const wrapper = mountLogin()
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('wrong')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.find('.form-error').text()).toBe('Invalid credentials')
  })

  it('calls api.login on submit', async () => {
    vi.mocked(api.login).mockResolvedValue({
      token: 'jwt',
      user: { id: 1, name: 'T', email: 'test@test.com', role: 'user', credits: 0, plan_id: null, plan_expires_at: null, advanced_settings: 0, visible_products: '[]' },
    })
    const wrapper = mountLogin()
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('123456')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(api.login).toHaveBeenCalledWith('test@test.com', '123456')
  })

  it('toggles password visibility', async () => {
    const wrapper = mountLogin()
    const pwInput = wrapper.find('input#password')
    expect(pwInput.attributes('type')).toBe('password')
    await wrapper.find('.toggle-pw').trigger('click')
    expect(wrapper.find('input#password').attributes('type')).toBe('text')
  })

  it('has link to register page', () => {
    const wrapper = mountLogin()
    const link = wrapper.find('.auth-link a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/register')
  })
})
