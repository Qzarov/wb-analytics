import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { defineComponent, h } from 'vue'

vi.mock('@/api', () => ({
  api: {
    login: vi.fn(),
    register: vi.fn(),
  },
}))

vi.mock('@/router', () => ({
  getDefaultRoute: () => '/profile',
}))

import { api } from '@/api'
import RegisterView from '@/views/RegisterView.vue'

const Stub = defineComponent({ render: () => h('div') })

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: Stub },
      { path: '/register', component: RegisterView },
      { path: '/profile', component: Stub },
      { path: '/login', component: Stub },
    ],
  })
}

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

describe('RegisterView', () => {
  function mountRegister() {
    const router = makeRouter()
    router.push('/register')
    return mount(RegisterView, {
      global: { plugins: [createPinia(), router] },
    })
  }

  it('renders registration form', () => {
    const wrapper = mountRegister()
    expect(wrapper.find('h1').text()).toBe('Создать аккаунт')
    expect(wrapper.find('input#name').exists()).toBe(true)
    expect(wrapper.find('input#email').exists()).toBe(true)
    expect(wrapper.find('input#password').exists()).toBe(true)
    expect(wrapper.find('input#confirm').exists()).toBe(true)
  })

  it('submit disabled when form incomplete', () => {
    const wrapper = mountRegister()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('shows password mismatch error', async () => {
    const wrapper = mountRegister()
    await wrapper.find('input#password').setValue('123456')
    await wrapper.find('input#confirm').setValue('654321')
    expect(wrapper.find('.field-error').text()).toBe('Пароли не совпадают')
  })

  it('submit enabled with valid form', async () => {
    const wrapper = mountRegister()
    await wrapper.find('input#name').setValue('Test User')
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('123456')
    await wrapper.find('input#confirm').setValue('123456')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('calls api.register on submit', async () => {
    vi.mocked(api.register).mockResolvedValue({
      token: 'jwt',
      user: { id: 1, name: 'Test User', email: 'test@test.com', role: 'user', credits: 0, plan_id: null, plan_expires_at: null, advanced_settings: 0, visible_products: '[]' },
    })
    const wrapper = mountRegister()
    await wrapper.find('input#name').setValue('Test User')
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('123456')
    await wrapper.find('input#confirm').setValue('123456')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(api.register).toHaveBeenCalledWith('Test User', 'test@test.com', '123456')
  })

  it('shows error on failed register', async () => {
    vi.mocked(api.register).mockRejectedValue(new Error('Email already taken'))
    const wrapper = mountRegister()
    await wrapper.find('input#name').setValue('Test User')
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('123456')
    await wrapper.find('input#confirm').setValue('123456')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(wrapper.find('.form-error').text()).toBe('Email already taken')
  })

  it('submit disabled with short password', async () => {
    const wrapper = mountRegister()
    await wrapper.find('input#name').setValue('Test User')
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('12345')
    await wrapper.find('input#confirm').setValue('12345')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('submit disabled without agreeing to terms', async () => {
    const wrapper = mountRegister()
    await wrapper.find('input#name').setValue('Test User')
    await wrapper.find('input#email').setValue('test@test.com')
    await wrapper.find('input#password').setValue('123456')
    await wrapper.find('input#confirm').setValue('123456')
    // Don't check the checkbox
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('has link to login page', () => {
    const wrapper = mountRegister()
    const link = wrapper.find('.auth-link a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/login')
  })
})
