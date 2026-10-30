<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

// Temporary landing page for phases 1-2: proves auth and the API wrapper work.
// It is replaced by the layout shell and the real Home page in the next phases.
const auth = useAuthStore()
const router = useRouter()

onMounted(() => auth.fetchUser())

function signOut() {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <main class="home">
    <section class="home__card">
      <div v-if="auth.user" class="home__user">
        <img v-if="auth.avatarUrl" class="home__avatar" :src="auth.avatarUrl" alt="" />
        <div>
          <p class="home__label">Signed in as</p>
          <h1 class="home__name">{{ auth.displayName }}</h1>
        </div>
      </div>
      <div v-else-if="auth.error" class="home__error" role="alert">
        Could not load your profile: {{ auth.error }}
      </div>
      <div v-else class="home__skeleton" aria-busy="true"></div>

      <p class="home__text">Authentication and the API service are working. The layout shell comes next.</p>

      <button class="btn btn--ghost" type="button" @click="signOut">
        <LogOut :size="18" aria-hidden="true" />
        Log out
      </button>
    </section>
  </main>
</template>

<style scoped>
.home { min-height: 100%; display: grid; place-items: center; padding: var(--space-5); }
.home__card {
  width: min(100%, 480px);
  padding: var(--space-6);
  background: var(--color-panel);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  align-items: flex-start;
}
.home__user { display: flex; gap: var(--space-4); align-items: center; }
.home__avatar { width: 64px; height: 64px; border-radius: var(--radius-round); object-fit: cover; }
.home__label { color: var(--color-text-muted); font-size: var(--font-size-sm); }
.home__name { font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); }
.home__text { color: var(--color-text-muted); }
.home__error { color: var(--color-error); }
.home__skeleton {
  width: 220px;
  height: 64px;
  border-radius: var(--radius-md);
  background: linear-gradient(90deg, var(--color-skeleton) 25%, var(--color-skeleton-shine) 50%, var(--color-skeleton) 75%);
  background-size: 200% 100%;
  animation: shine 1.4s linear infinite;
}
@keyframes shine { to { background-position: -200% 0; } }
</style>
