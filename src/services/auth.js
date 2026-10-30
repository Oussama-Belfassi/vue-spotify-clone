/**
 * Spotify Authorization Code flow with PKCE. Front-end only: no client secret.
 * Token storage and refresh live here so both the API wrapper and the auth
 * store can use them without importing each other.
 */

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

export const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-top-read',
  'user-read-recently-played',
  'user-read-playback-state',
  'user-modify-playback-state',
  'streaming',
]

const KEYS = {
  tokens: 'vsc.tokens',
  verifier: 'vsc.pkce_verifier',
  state: 'vsc.oauth_state',
}

// Refresh this long before the token actually expires.
const REFRESH_MARGIN_MS = 60 * 1000

export class AuthError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'AuthError'
    this.code = code
  }
}

/* ------------------------------ configuration ----------------------------- */

export function getConfig() {
  return {
    clientId: (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim(),
    redirectUri: (import.meta.env.VITE_SPOTIFY_REDIRECT_URI || '').trim(),
  }
}

export function isConfigured() {
  const { clientId, redirectUri } = getConfig()
  return Boolean(clientId && redirectUri)
}

/* ---------------------------------- PKCE ---------------------------------- */

const VERIFIER_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const b of bytes) out += VERIFIER_CHARS[b % VERIFIER_CHARS.length]
  return out
}

export function generateCodeVerifier(length = 64) {
  return randomString(length)
}

function base64UrlEncode(buffer) {
  let binary = ''
  for (const b of new Uint8Array(buffer)) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function generateCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

/* ---------------------------- token persistence ---------------------------- */

let refreshPromise = null
let refreshTimer = null
const expiredListeners = new Set()

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(KEYS.tokens)) || null
  } catch {
    return null
  }
}

function writeTokens(tokens) {
  localStorage.setItem(KEYS.tokens, JSON.stringify(tokens))
}

export function clearTokens() {
  localStorage.removeItem(KEYS.tokens)
  localStorage.removeItem(KEYS.verifier)
  localStorage.removeItem(KEYS.state)
  clearTimeout(refreshTimer)
  refreshTimer = null
}

export function hasSession() {
  const t = readTokens()
  return Boolean(t && (t.refreshToken || t.expiresAt > Date.now()))
}

function storeTokenResponse(data, previous) {
  const tokens = {
    accessToken: data.access_token,
    // Spotify may or may not rotate the refresh token: keep the old one if absent.
    refreshToken: data.refresh_token || previous?.refreshToken || null,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope || previous?.scope || '',
  }
  writeTokens(tokens)
  scheduleRefresh()
  return tokens
}

/* ------------------------------- login flow -------------------------------- */

export async function startLogin() {
  if (!isConfigured()) {
    throw new AuthError(
      'Missing VITE_SPOTIFY_CLIENT_ID or VITE_SPOTIFY_REDIRECT_URI in your .env file.',
      'not_configured',
    )
  }
  const { clientId, redirectUri } = getConfig()
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state = randomString(24)

  localStorage.setItem(KEYS.verifier, verifier)
  localStorage.setItem(KEYS.state, state)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.assign(`${AUTHORIZE_URL}?${params}`)
}

async function postToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const code = data?.error || `http_${res.status}`
    throw new AuthError(data?.error_description || 'Token request failed.', code)
  }
  return data
}

/** Complete the login on the /callback route. */
export async function handleCallback(query) {
  if (query.error) {
    throw new AuthError(
      query.error === 'access_denied'
        ? 'Access was denied. Accept the permissions to use the player.'
        : `Spotify returned an error: ${query.error}`,
      query.error,
    )
  }
  const expectedState = localStorage.getItem(KEYS.state)
  const verifier = localStorage.getItem(KEYS.verifier)
  if (!query.code) throw new AuthError('No authorization code in the callback URL.', 'missing_code')
  if (!expectedState || query.state !== expectedState) {
    throw new AuthError('The login state did not match. Start the login again.', 'state_mismatch')
  }
  if (!verifier) throw new AuthError('The login session expired. Start the login again.', 'missing_verifier')

  const { clientId, redirectUri } = getConfig()
  const data = await postToken({
    grant_type: 'authorization_code',
    code: query.code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  })
  localStorage.removeItem(KEYS.verifier)
  localStorage.removeItem(KEYS.state)
  return storeTokenResponse(data, null)
}

/* -------------------------------- refreshing -------------------------------- */

/** Register a callback that runs when the session can no longer be refreshed. */
export function onSessionExpired(listener) {
  expiredListeners.add(listener)
  return () => expiredListeners.delete(listener)
}

export function expireSession() {
  clearTokens()
  expiredListeners.forEach((fn) => fn())
}

/** Single-flight refresh: concurrent callers share one request. */
export function refreshAccessToken() {
  if (refreshPromise) return refreshPromise

  const tokens = readTokens()
  if (!tokens?.refreshToken) {
    expireSession()
    return Promise.reject(new AuthError('No refresh token available.', 'no_refresh_token'))
  }

  const { clientId } = getConfig()
  refreshPromise = postToken({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  })
    .then((data) => storeTokenResponse(data, tokens))
    .catch((err) => {
      // Only a rejected refresh token ends the session; network errors can be retried.
      if (err instanceof AuthError && (err.code === 'invalid_grant' || err.code === 'invalid_client')) {
        expireSession()
      }
      throw err
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

function scheduleRefresh() {
  clearTimeout(refreshTimer)
  const tokens = readTokens()
  if (!tokens) return
  const delay = Math.max(tokens.expiresAt - Date.now() - REFRESH_MARGIN_MS, 0)
  refreshTimer = setTimeout(() => {
    refreshAccessToken().catch(() => {})
  }, Math.min(delay, 2 ** 31 - 1))
}

/** Call once at startup: resumes the refresh timer and re-checks when the tab wakes up. */
export function startAutoRefresh() {
  scheduleRefresh()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    const tokens = readTokens()
    if (tokens && tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
      refreshAccessToken().catch(() => {})
    }
  })
}

/** Returns a valid access token, refreshing first if it is about to expire. */
export async function getAccessToken() {
  const tokens = readTokens()
  if (!tokens) return null
  if (tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    const fresh = await refreshAccessToken()
    return fresh.accessToken
  }
  return tokens.accessToken
}
