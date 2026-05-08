import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './assets/main.css'

const saved = localStorage.getItem('theme')
const theme = saved === 'light' ? 'light' : saved === 'dark' ? 'dark' : (import.meta.env.VITE_DEFAULT_THEME === 'light' ? 'light' : 'dark')
document.documentElement.classList.toggle('dark', theme === 'dark')
document.documentElement.setAttribute('data-theme', theme)

if (import.meta.env.DEV) document.title = '(dev) ' + document.title

const app = createApp(App)
app.use(createPinia())
app.use(router)

const showLanding = import.meta.env.VITE_SHOW_LANDING !== 'false'

function getDefaultRoute(): string {
  const auth = useAuthStore()
  if (auth.isAdmin) return '/admin'
  if (auth.user) {
    try {
      const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
      if (ids.includes('wb-analytics')) return '/wb-analytics'
    } catch {}
  }
  if (showLanding) return '/'
  return '/profile'
}

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.name === 'landing' && !showLanding) return '/login'
  if (to.meta.auth && !auth.isAuth) return '/login'
  if (to.meta.admin && !auth.isAdmin) return '/login'
  if (to.meta.product && auth.isAuth && auth.user) {
    try {
      const ids = JSON.parse(auth.user.visible_products || '[]') as string[]
      if (!ids.includes(to.meta.product as string)) return '/404'
    } catch {}
  }
  if (to.meta.guest && auth.isAuth) return getDefaultRoute()
})

app.mount('#app')
