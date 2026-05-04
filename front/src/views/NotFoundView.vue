<template>
  <div class="not-found">
    <h1>404</h1>
    <p>Страница не найдена или у вас нет доступа</p>
    <RouterLink to="/" class="btn">На главную</RouterLink>
  </div>
</template>

<style scoped>
.not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 1rem; text-align: center; }
.not-found h1 { font-size: 4rem; color: var(--text-muted); font-weight: 700; margin: 0; }
.not-found p { color: var(--text-secondary); font-size: 1.1rem; }
.btn { background: var(--accent); color: white; padding: 0.6rem 1.5rem; border-radius: 8px; text-decoration: none; font-size: 0.9rem; transition: opacity 0.15s; }
.btn:hover { opacity: 0.9; }
</style>
