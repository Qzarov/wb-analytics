import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'

// Apply saved theme before mount to avoid flash
const saved = localStorage.getItem('theme')
document.documentElement.setAttribute('data-theme', saved || import.meta.env.VITE_DEFAULT_THEME || 'dark-purple')

if (import.meta.env.DEV) document.title = '(dev) ' + document.title

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
