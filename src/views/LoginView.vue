<script setup>
import { ref } from 'vue'
import { LogIn, TriangleAlert } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const redirecting = ref(false)

async function signIn() {
  redirecting.value = true
  await auth.login()
  // On success the browser navigates away; only reset if something failed.
  redirecting.value = false
}
</script>

<template>
  <main class="login">
    <section class="login__card">
      <h1 class="login__title">Music for every moment</h1>
      <p class="login__text">
        Sign in with your Spotify account to browse your library, search and play music.
      </p>

      <p v-if="!auth.isConfigured" class="login__alert" role="alert">
        <TriangleAlert :size="18" aria-hidden="true" />
        <span>
          Setup needed: add <code>VITE_SPOTIFY_CLIENT_ID</code> and
          <code>VITE_SPOTIFY_REDIRECT_URI</code> to your <code>.env</code> file, then restart the dev server.
        </span>
      </p>
      <p v-else-if="auth.error" class="login__alert" role="alert">
        <TriangleAlert :size="18" aria-hidden="true" />
        <span>{{ auth.error }}</span>
      </p>

      <button
        class="btn btn--primary login__button"
        type="button"
        :disabled="!auth.isConfigured || redirecting"
        @click="signIn"
      >
        <LogIn :size="20" aria-hidden="true" />
        {{ redirecting ? 'Redirecting…' : 'Continue with Spotify' }}
      </button>

      <p class="login__legal">Educational project. Not affiliated with or endorsed by Spotify.</p>
    </section>
  </main>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-5);
  background: linear-gradient(180deg, var(--color-hover-strong) 0%, var(--color-bg) 60%);
}
.login__card {
  width: min(100%, 440px);
  padding: var(--space-6);
  background: var(--color-panel);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  text-align: center;
}
.login__title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-black);
  line-height: 1.15;
}
.login__text { color: var(--color-text-muted); }
.login__alert {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: var(--font-size-sm);
}
.login__alert svg { flex-shrink: 0; margin-top: 2px; }
.login__alert code { color: var(--color-text); }
.login__button { width: 100%; }
.login__legal { color: var(--color-text-subdued); font-size: var(--font-size-xs); }
</style>
