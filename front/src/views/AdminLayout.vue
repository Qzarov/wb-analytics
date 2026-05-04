<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router'
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <nav class="sidebar-nav">
        <RouterLink to="/admin/users" class="sidebar-link">Пользователи</RouterLink>
        <RouterLink to="/admin/payments" class="sidebar-link">Платёжки</RouterLink>
        <RouterLink to="/admin/logs" class="sidebar-link">Логи</RouterLink>
        <RouterLink to="/admin/settings" class="sidebar-link">Настройки</RouterLink>
      </nav>
    </aside>
    <div class="admin-content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  min-height: calc(100vh - 64px - 60px);
}
.admin-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  padding: 1.5rem 0;
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.sidebar-link {
  display: block;
  padding: 0.7rem 1.5rem;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.15s;
  border-left: 3px solid transparent;
}
.sidebar-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.sidebar-link.router-link-active {
  color: var(--accent);
  background: var(--accent-soft);
  border-left-color: var(--accent);
  font-weight: 600;
}
.admin-content {
  flex: 1;
  min-width: 0;
}
</style>
