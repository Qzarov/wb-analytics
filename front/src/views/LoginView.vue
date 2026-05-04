<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)

const isValid = computed(() => email.value.includes('@') && password.value.length >= 1)

async function onSubmit() {
  if (!isValid.value) return
  loading.value = true; error.value = ''
  try {
    await auth.login(email.value, password.value)
    const { getDefaultRoute } = await import('@/router')
    router.push(getDefaultRoute())
  } catch (e: any) { error.value = e.message || 'Ошибка входа' }
  finally { loading.value = false }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Вход</h1>
      <p class="auth-subtitle">Войдите в свой аккаунт</p>
      <form @submit.prevent="onSubmit" class="auth-form">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" placeholder="ivan@example.com" autocomplete="email" />
        </div>
        <div class="field">
          <label for="password">Пароль</label>
          <div class="password-wrapper">
            <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Пароль" autocomplete="current-password" />
            <button type="button" class="toggle-pw" @click="showPassword = !showPassword" tabindex="-1">{{ showPassword ? '🙈' : '👁' }}</button>
          </div>
        </div>
        <div v-if="error" class="form-error">{{ error }}</div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="!isValid || loading">{{ loading ? 'Вход...' : 'Войти' }}</button>
      </form>
      <p class="auth-link">Нет аккаунта? <RouterLink to="/register">Зарегистрироваться</RouterLink></p>
    </div>
  </div>
</template>

<style scoped>
.auth-page { display: flex; justify-content: center; padding: 4rem 1rem; }
.auth-card { width: 100%; max-width: 440px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 16px; padding: 2.5rem; }
.auth-title { color: var(--text-primary); font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; }
.auth-subtitle { color: var(--text-secondary); font-size: 0.95rem; margin-bottom: 2rem; }
.auth-form { display: flex; flex-direction: column; gap: 1.25rem; }
.field { display: flex; flex-direction: column; gap: 0.4rem; }
.field label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; }
.field input { background: var(--bg-input); border: 1px solid var(--border-input); border-radius: 8px; padding: 0.75rem 1rem; color: var(--text-body); font-size: 0.95rem; outline: none; transition: border-color 0.2s; }
.field input:focus { border-color: var(--accent); }
.password-wrapper { position: relative; }
.password-wrapper input { width: 100%; padding-right: 3rem; }
.toggle-pw { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 1.1rem; line-height: 1; }
.form-error { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.btn-block { width: 100%; padding: 0.85rem; font-size: 1rem; margin-top: 0.25rem; }
.btn-block:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-link { text-align: center; margin-top: 1.5rem; color: var(--text-secondary); font-size: 0.9rem; }
</style>
