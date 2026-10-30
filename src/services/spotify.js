/**
 * Single entry point for every Spotify Web API call. Components and stores
 * must go through this module and never call fetch themselves.
 *
 * Endpoint set follows Spotify's February 2026 Development Mode rules:
 *  - library save/remove/contains use /me/library with Spotify URIs
 *  - playlist contents use /playlists/{id}/items (owned or collaborative only)
 *  - search limit is capped at 10 (paginate with offset)
 *  - no batch fetches; /browse/*, /artists/{id}/top-tracks and
 *    /artists/{id}/related-artists are unavailable, so callers must treat
 *    those sections as optional (see isUnavailable()).
 */
import { AuthError, expireSession, getAccessToken, refreshAccessToken } from './auth'

const API_BASE = 'https://api.spotify.com/v1'
const MAX_RATE_LIMIT_RETRIES = 3
const MAX_RETRY_AFTER_SECONDS = 30
export const SEARCH_MAX_LIMIT = 10

export class SpotifyError extends Error {
  constructor(status, message, { retryAfter = null, reason = null } = {}) {
    super(message)
    this.name = 'SpotifyError'
    this.status = status
    this.retryAfter = retryAfter
    this.reason = reason
  }
}

/** True when an endpoint is restricted/removed for this app: hide the section instead of failing. */
export function isUnavailable(error) {
  return error instanceof SpotifyError && [403, 404].includes(error.status)
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

function buildUrl(path, query) {
  const url = path.startsWith('http') ? new URL(path) : new URL(API_BASE + path)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

async function toError(res) {
  let body = null
  try {
    body = await res.json()
  } catch {
    /* empty or non-JSON body */
  }
  const message = body?.error?.message || body?.error_description || res.statusText || 'Request failed'
  return new SpotifyError(res.status, message, {
    retryAfter: Number(res.headers.get('Retry-After')) || null,
    reason: body?.error?.reason || null,
  })
}

/**
 * Adds the bearer token. On 401 it refreshes the token and retries once.
 * On 429 it waits for the Retry-After header and retries (bounded).
 */
async function request(path, { method = 'GET', query, body, signal } = {}) {
  const url = buildUrl(path, query)
  let refreshedAfter401 = false
  let rateLimitRetries = 0

  for (;;) {
    let token
    try {
      token = await getAccessToken()
    } catch (err) {
      if (err instanceof AuthError) throw new SpotifyError(401, 'Your session has expired.')
      throw err
    }
    if (!token) throw new SpotifyError(401, 'You are not signed in.')

    const hasBody = body !== undefined
    const res = await fetch(url, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401) {
      if (refreshedAfter401) {
        expireSession()
        throw await toError(res)
      }
      refreshedAfter401 = true
      try {
        await refreshAccessToken()
      } catch {
        throw new SpotifyError(401, 'Your session has expired.')
      }
      continue
    }

    if (res.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
      rateLimitRetries += 1
      const seconds = Number(res.headers.get('Retry-After'))
      const wait = Number.isFinite(seconds) && seconds > 0 ? seconds : 1
      await sleep(Math.min(wait, MAX_RETRY_AFTER_SECONDS) * 1000, signal)
      continue
    }

    if (!res.ok) throw await toError(res)
    if (res.status === 204) return null
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
}

const get = (path, query, signal) => request(path, { query, signal })

/* ---------------------------------- user ---------------------------------- */

export const getMe = () => get('/me')

/* --------------------------------- library --------------------------------- */

export const getMyPlaylists = ({ limit = 50, offset = 0 } = {}) => get('/me/playlists', { limit, offset })
export const getSavedAlbums = ({ limit = 50, offset = 0 } = {}) => get('/me/albums', { limit, offset })
export const getSavedTracks = ({ limit = 50, offset = 0 } = {}) => get('/me/tracks', { limit, offset })
export const getFollowedArtists = ({ limit = 50, after } = {}) =>
  get('/me/following', { type: 'artist', limit, after })

/** `uris` are Spotify URIs, e.g. "spotify:track:123". */
export const saveToLibrary = (uris) => request('/me/library', { method: 'PUT', body: { uris } })
export const removeFromLibrary = (uris) => request('/me/library', { method: 'DELETE', body: { uris } })
export const checkLibrary = (uris) => get('/me/library/contains', { uris: uris.join(',') })

/* ------------------------------ personalization ----------------------------- */

export const getRecentlyPlayed = ({ limit = 20 } = {}) => get('/me/player/recently-played', { limit })
export const getTopArtists = ({ limit = 20, time_range = 'medium_term' } = {}) =>
  get('/me/top/artists', { limit, time_range })
export const getTopTracks = ({ limit = 20, time_range = 'medium_term' } = {}) =>
  get('/me/top/tracks', { limit, time_range })

/* --------------------------------- catalog --------------------------------- */

export const getPlaylist = (id) => get(`/playlists/${id}`)
export const getPlaylistItems = (id, { limit = 50, offset = 0 } = {}) =>
  get(`/playlists/${id}/items`, { limit, offset })
export const getAlbum = (id) => get(`/albums/${id}`)
export const getAlbumTracks = (id, { limit = 50, offset = 0 } = {}) =>
  get(`/albums/${id}/tracks`, { limit, offset })
export const getArtist = (id) => get(`/artists/${id}`)
export const getArtistAlbums = (id, { limit = 20, offset = 0, include_groups = 'album,single' } = {}) =>
  get(`/artists/${id}/albums`, { limit, offset, include_groups })
export const getTrack = (id) => get(`/tracks/${id}`)

/** `types` is an array: track, artist, album, playlist. Limit is capped at 10 by Spotify. */
export const search = (q, { types = ['track', 'artist', 'album', 'playlist'], limit = 5, offset = 0, signal } = {}) =>
  get(
    '/search',
    { q, type: types.join(','), limit: Math.min(limit, SEARCH_MAX_LIMIT), offset },
    signal,
  )

/* --------------------------------- playlists -------------------------------- */

export const createPlaylist = ({ name, description = '', isPublic = false }) =>
  request('/me/playlists', { method: 'POST', body: { name, description, public: isPublic } })
export const addPlaylistItems = (id, uris) =>
  request(`/playlists/${id}/items`, { method: 'POST', body: { uris } })
export const removePlaylistItems = (id, uris) =>
  request(`/playlists/${id}/items`, {
    method: 'DELETE',
    body: { items: uris.map((uri) => ({ uri })) },
  })

/* ---------------------------------- player ---------------------------------- */

export const getPlaybackState = () => get('/me/player')
export const getDevices = () => get('/me/player/devices')
export const getQueue = () => get('/me/player/queue')
export const transferPlayback = (deviceId, play = true) =>
  request('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play } })
export const play = ({ deviceId, uris, contextUri, offset, positionMs } = {}) =>
  request('/me/player/play', {
    method: 'PUT',
    query: { device_id: deviceId },
    body: {
      ...(uris ? { uris } : {}),
      ...(contextUri ? { context_uri: contextUri } : {}),
      ...(offset ? { offset } : {}),
      ...(positionMs !== undefined ? { position_ms: positionMs } : {}),
    },
  })
export const pause = (deviceId) => request('/me/player/pause', { method: 'PUT', query: { device_id: deviceId } })
export const next = (deviceId) => request('/me/player/next', { method: 'POST', query: { device_id: deviceId } })
export const previous = (deviceId) =>
  request('/me/player/previous', { method: 'POST', query: { device_id: deviceId } })
export const seek = (positionMs, deviceId) =>
  request('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(positionMs), device_id: deviceId } })
export const setVolume = (percent, deviceId) =>
  request('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(percent), device_id: deviceId } })
export const setShuffle = (state, deviceId) =>
  request('/me/player/shuffle', { method: 'PUT', query: { state, device_id: deviceId } })
export const setRepeat = (state, deviceId) =>
  request('/me/player/repeat', { method: 'PUT', query: { state, device_id: deviceId } })
export const addToQueue = (uri, deviceId) =>
  request('/me/player/queue', { method: 'POST', query: { uri, device_id: deviceId } })
