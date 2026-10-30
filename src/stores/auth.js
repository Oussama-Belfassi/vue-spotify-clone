import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authService from '@/services/auth'
import * as spotify from '@/services/spotify'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const authenticated = ref(authService.hasSession())

  const isAuthenticated = computed(() => authenticated.value)
  const isConfigured = authService.isConfigured()

  const avatarUrl = computed(() => user.value?.images?.[0]?.url ?? null)
  const displayName = computed(() => user.value?.display_name || user.value?.id || '')

  // If the refresh token is rejected anywhere, reset state; the router guard handles the redirect.
  authService.onSessionExpired(() => {
    authenticated.value = false
    user.value = null
  })

  async function login() {
    error.value = null
    try {
      await authService.startLogin()
    } catch (e) {
      error.value = e.message
    }
  }

  async function completeLogin(query) {
    loading.value = true
    error.value = null
    try {
      await authService.handleCallback(query)
      authenticated.value = true
      return true
    } catch (e) {
      error.value = e.message
      authenticated.value = false
      return false
    } finally {
      loading.value = false
    }
  }

  async function fetchUser() {
    if (!authenticated.value || user.value) return user.value
    try {
      user.value = await spotify.getMe()
    } catch (e) {
      error.value = e.message
    }
    return user.value
  }

  function logout() {
    authService.clearTokens()
    authenticated.value = false
    user.value = null
  }

  return {
    user, loading, error, isAuthenticated, isConfigured, avatarUrl, displayName,
    login, completeLogin, fetchUser, logout,
  }
})
