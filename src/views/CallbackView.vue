<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

onMounted(async () => {
  const ok = await auth.completeLogin(route.query)
  // Drop ?code=...&state=... from the URL either way.
  await router.replace({ name: ok ? 'home' : 'login' })
})
</script>

<template>
  <main class="callback" aria-busy="true">
    <span class="callback__spinner" aria-hidden="true"></span>
    <p>Signing you in…</p>
  </main>
</template>

<style scoped>
.callback {
  min-height: 100%;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
}
.callback__spinner {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-round);
  border: 3px solid var(--color-hover-strong);
  border-top-color: var(--color-accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
