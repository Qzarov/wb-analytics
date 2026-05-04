import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: () => import('@/views/LandingView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
    { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { auth: true } },
    { path: '/wb-analytics', name: 'wb-analytics', component: () => import('@/views/WbAnalyticsView.vue'), meta: { auth: true, product: 'wb-analytics' } },
    { path: '/404', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
    {
      path: '/admin',
      component: () => import('@/views/AdminLayout.vue'),
      meta: { admin: true },
      redirect: '/admin/users',
      children: [
        { path: 'users', name: 'users', component: () => import('@/views/UsersView.vue') },
        { path: 'users/:id', name: 'user-detail', component: () => import('@/views/UserDetailView.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/AdminSettingsView.vue') },
        { path: 'logs', name: 'admin-logs', component: () => import('@/views/ServiceLogsView.vue') },
      ],
    },
  ],
})

export default router
