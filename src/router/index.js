import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  { path: '/callback', name: 'callback', component: () => import('@/views/CallbackView.vue'), meta: { public: true } },
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) {
    // Signed-in users have no reason to see the login screen.
    if (to.name === 'login' && auth.isAuthenticated) return { name: 'home' }
    return true
  }
  if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})

// Session lost mid-use (refresh token rejected): send the user back to login.
export function redirectToLoginOnExpiry() {
  const auth = useAuthStore()
  const stop = auth.$subscribe(() => {
    if (!auth.isAuthenticated && router.currentRoute.value.name !== 'login') {
      router.replace({ name: 'login' })
    }
  })
  return stop
}

export default router
