import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, type User } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<User | null>(JSON.parse(localStorage.getItem('user') || 'null'))

  const isAuth = computed(() => !!token.value)
  const isSuperAdmin = computed(() => user.value?.role === 'superadmin')
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'superadmin')

  function setAuth(t: string, u: User) {
    token.value = t
    user.value = u
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  async function register(name: string, email: string, password: string) {
    const res = await api.register(name, email, password)
    setAuth(res.token, res.user)
  }

  async function login(email: string, password: string) {
    const res = await api.login(email, password)
    setAuth(res.token, res.user)
  }

  function updateCredits(credits: number) {
    if (user.value) {
      user.value = { ...user.value, credits }
      localStorage.setItem('user', JSON.stringify(user.value))
    }
  }

  return { token, user, isAuth, isAdmin, isSuperAdmin, register, login, logout, updateCredits }
})
