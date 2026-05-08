import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeId = 'light' | 'dark'

const DEFAULT_THEME: ThemeId =
  (import.meta.env.VITE_DEFAULT_THEME as ThemeId) === 'light' ? 'light' : 'dark'

function applyTheme(id: ThemeId) {
  const el = document.documentElement
  el.classList.toggle('dark', id === 'dark')
  el.setAttribute('data-theme', id)
}

export const useThemeStore = defineStore('theme', () => {
  const raw = localStorage.getItem('theme')
  const initial = raw === 'light' ? 'light' : raw === 'dark' ? 'dark' : DEFAULT_THEME
  const current = ref<ThemeId>(initial)

  applyTheme(current.value)

  watch(current, (v) => {
    localStorage.setItem('theme', v)
    applyTheme(v)
  })

  function toggle() {
    current.value = current.value === 'dark' ? 'light' : 'dark'
  }

  function set(id: ThemeId) {
    current.value = id
  }

  return { current, toggle, set }
})
