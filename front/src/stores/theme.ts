import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeId = 'dark-purple' | 'dark-blue' | 'light-green' | 'light-gray'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'dark-purple', label: 'Dark Purple' },
  { id: 'dark-blue', label: 'Dark Blue' },
  { id: 'light-gray', label: 'Light Gray' },
]

const DEFAULT_THEME: ThemeId =
  (import.meta.env.VITE_DEFAULT_THEME as ThemeId) || 'dark-purple'

function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute('data-theme', id)
}

export const useThemeStore = defineStore('theme', () => {
  const saved = localStorage.getItem('theme') as ThemeId | null
  const current = ref<ThemeId>(saved && THEMES.some(t => t.id === saved) ? saved : DEFAULT_THEME)

  applyTheme(current.value)

  watch(current, (v) => {
    localStorage.setItem('theme', v)
    applyTheme(v)
  })

  function set(id: ThemeId) {
    current.value = id
  }

  return { current, set }
})
