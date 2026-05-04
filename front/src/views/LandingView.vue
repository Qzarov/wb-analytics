<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="landing">
    <div class="container">
      <template v-if="auth.isAuth">
        <h1 class="landing-title">WB Аналитика</h1>
        <p class="landing-subtitle">Аналитика Wildberries: продажи, остатки, отзывы, отчёты</p>
        <div class="auth-actions">
          <RouterLink to="/wb-analytics" class="btn btn-primary btn-lg">Перейти к аналитике</RouterLink>
        </div>
      </template>

      <template v-else>
        <h1 class="landing-title">WB Аналитика</h1>
        <p class="landing-subtitle">Войдите или зарегистрируйтесь, чтобы начать работу</p>
        <div class="auth-actions">
          <RouterLink to="/login" class="btn btn-primary btn-lg">Войти</RouterLink>
          <RouterLink to="/register" class="btn btn-secondary btn-lg">Зарегистрироваться</RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.landing { min-height: 80vh; display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
.container { max-width: 900px; width: 100%; }
.landing-title { font-size: 2rem; font-weight: 700; color: var(--text-primary); text-align: center; margin-bottom: 1rem; }
.landing-subtitle { font-size: 1.1rem; color: var(--text-secondary); text-align: center; margin-bottom: 2rem; }
.auth-actions { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.btn { padding: .6rem 1.2rem; border: none; border-radius: 8px; cursor: pointer; font-size: .95rem; text-decoration: none; transition: opacity .15s; display: inline-block; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { opacity: .85; }
.btn-secondary { background: var(--bg-input); color: var(--text-body); border: 1px solid var(--border); }
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
.btn-lg { padding: .85rem 2rem; font-size: 1.05rem; }
</style>
