<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const form = ref({ name: '', email: '', password: '', confirmPassword: '', agree: false })
const loading = ref(false)
const error = ref('')
const showPassword = ref(false)

const passwordMismatch = computed(() => form.value.confirmPassword.length > 0 && form.value.password !== form.value.confirmPassword)
const isValid = computed(() =>
  form.value.name.trim().length >= 2 && form.value.email.includes('@') &&
  form.value.password.length >= 6 && form.value.password === form.value.confirmPassword && form.value.agree
)

async function onSubmit() {
  if (!isValid.value) return
  loading.value = true; error.value = ''
  try {
    await auth.register(form.value.name, form.value.email, form.value.password)
    const { getDefaultRoute } = await import('@/router')
    router.push(getDefaultRoute())
  } catch (e: any) { error.value = e.message || 'Ошибка регистрации' }
  finally { loading.value = false }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Создать аккаунт</h1>
      <p class="auth-subtitle">Зарегистрируйтесь, чтобы начать работу с AI-ассистентом</p>
      <form @submit.prevent="onSubmit" class="auth-form">
        <div class="field">
          <label for="name">Имя</label>
          <input id="name" v-model="form.name" type="text" placeholder="Иван Иванов" autocomplete="name" />
        </div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="form.email" type="email" placeholder="ivan@example.com" autocomplete="email" />
        </div>
        <div class="field">
          <label for="password">Пароль</label>
          <div class="password-wrapper">
            <input id="password" v-model="form.password" :type="showPassword ? 'text' : 'password'" placeholder="Минимум 6 символов" autocomplete="new-password" />
            <button type="button" class="toggle-pw" @click="showPassword = !showPassword" tabindex="-1">{{ showPassword ? '🙈' : '👁' }}</button>
          </div>
        </div>
        <div class="field">
          <label for="confirm">Подтвердите пароль</label>
          <input id="confirm" v-model="form.confirmPassword" :type="showPassword ? 'text' : 'password'" placeholder="Повторите пароль" autocomplete="new-password" :class="{ 'input-error': passwordMismatch }" />
          <span v-if="passwordMismatch" class="field-error">Пароли не совпадают</span>
        </div>
        <label class="checkbox-row">
          <input type="checkbox" v-model="form.agree" />
          <span>Я принимаю <a href="#" @click.prevent>условия использования</a></span>
        </label>
        <div v-if="error" class="form-error">{{ error }}</div>
        <button type="submit" class="btn btn-primary btn-block" :disabled="!isValid || loading">{{ loading ? 'Регистрация...' : 'Зарегистрироваться' }}</button>
      </form>
      <p class="auth-link">Уже есть аккаунт? <RouterLink to="/login">Войти</RouterLink></p>
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
.field input.input-error { border-color: var(--danger); }
.field-error { color: var(--danger); font-size: 0.8rem; }
.password-wrapper { position: relative; }
.password-wrapper input { width: 100%; padding-right: 3rem; }
.toggle-pw { position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 1.1rem; line-height: 1; }
.checkbox-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer; }
.checkbox-row input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--accent); }
.form-error { background: var(--danger-soft); border: 1px solid var(--danger-border); color: var(--danger); padding: 0.6rem 1rem; border-radius: 8px; font-size: 0.85rem; }
.btn-block { width: 100%; padding: 0.85rem; font-size: 1rem; margin-top: 0.25rem; }
.btn-block:disabled { opacity: 0.5; cursor: not-allowed; }
.auth-link { text-align: center; margin-top: 1.5rem; color: var(--text-secondary); font-size: 0.9rem; }
</style>
