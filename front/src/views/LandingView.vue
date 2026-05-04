<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const ALL_PRODUCTS = [
  { id: 'articles', label: 'SEO-статьи', desc: 'Генерация SEO-статей по ключевым словам', path: '/articles' },
  { id: 'documents', label: 'Анализ документов', desc: 'AI-анализ документов с референсными материалами', path: '/documents' },
  { id: 'reels', label: 'Reels → Telegram', desc: 'Сбор Reels, баннеры, AI-подписи, публикация в TG', path: '/reels' },
  { id: 'sender', label: 'TG Рассылка', desc: 'Рассылка в Telegram с AI-рерайтом', path: '/sender' },
  { id: 'tg-manager', label: 'TG Аккаунты', desc: 'Управление TG-аккаунтами с AI-ответами', path: '/tg-manager' },
  { id: 'wb-analytics', label: 'WB Аналитика', desc: 'Аналитика Wildberries: продажи, остатки, отзывы', path: '/wb-analytics' },
  { id: 'chat-manager', label: 'ИИ Чат-менеджер', desc: 'AI-агент для TG-чатов: анализ, предложения, рассылки', path: '/chat-manager' },
  { id: 'tg-content', label: 'TG Контент', desc: 'Автоматизация контента для Telegram-каналов', path: '/tg-content' },
  { id: 'prediction-markets', label: 'Prediction Markets', desc: 'Мониторинг и аналитика рынков предсказаний', path: '/prediction-markets' },
] as const

const visibleProducts = computed(() => {
  if (!auth.user) return []
  let ids: string[]
  try { ids = JSON.parse(auth.user.visible_products || '[]') } catch { ids = [] }
  return ALL_PRODUCTS.filter(p => ids.includes(p.id))
})
</script>

<template>
  <div class="landing">
    <div class="container">
      <!-- Авторизован -->
      <template v-if="auth.isAuth">
        <h1 class="landing-title">Панель управления вашими агентами</h1>

        <div v-if="visibleProducts.length === 0" class="empty-state">
          У вас пока нет доступных продуктов. Обратитесь к администратору.
        </div>

        <div v-else class="products-grid">
          <RouterLink
            v-for="p in visibleProducts"
            :key="p.id"
            :to="p.path"
            class="product-card"
          >
            <h3 class="product-name">{{ p.label }}</h3>
            <p class="product-desc">{{ p.desc }}</p>
          </RouterLink>
        </div>
      </template>

      <!-- Не авторизован -->
      <template v-else>
        <h1 class="landing-title">Панель управления вашими агентами</h1>
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

.landing-title {
  font-size: 2rem; font-weight: 700; color: var(--text-primary); text-align: center; margin-bottom: 1rem;
}
.landing-subtitle {
  font-size: 1.1rem; color: var(--text-secondary); text-align: center; margin-bottom: 2rem;
}
.auth-actions { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.btn { padding: .6rem 1.2rem; border: none; border-radius: 8px; cursor: pointer; font-size: .95rem; text-decoration: none; transition: opacity .15s; display: inline-block; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { opacity: .85; }
.btn-secondary { background: var(--bg-input); color: var(--text-body); border: 1px solid var(--border); }
.btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
.btn-lg { padding: .85rem 2rem; font-size: 1.05rem; }

.empty-state { text-align: center; color: var(--text-muted); font-size: 1rem; padding: 3rem 0; }

.products-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; margin-top: 1.5rem;
}
.product-card {
  background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 1.5rem; text-decoration: none; transition: border-color .2s, box-shadow .2s; cursor: pointer;
}
.product-card:hover { border-color: var(--accent); box-shadow: 0 4px 16px rgba(0,0,0,.08); }
.product-name { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 .5rem; }
.product-desc { font-size: .88rem; color: var(--text-secondary); margin: 0; line-height: 1.5; }
</style>
