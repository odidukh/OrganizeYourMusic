import { refreshAccessToken, clearRefreshToken, loadRefreshToken } from '@/auth/spotifyAuth'

export class SpotifyError extends Error {
  status: number
  retryable: boolean
  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'SpotifyError'
    this.status = status
    this.retryable = retryable
  }
}

type ClientState = {
  accessToken: string | null
  // Promise to dedupe concurrent refreshes
  refreshing: Promise<string> | null
  onUnauth: (() => void) | null
}

const state: ClientState = {
  accessToken: null,
  refreshing: null,
  onUnauth: null,
}

export function setAccessToken(token: string | null): void {
  state.accessToken = token
}

export function getAccessToken(): string | null {
  return state.accessToken
}

export function setOnUnauthCallback(cb: () => void): void {
  state.onUnauth = cb
}

async function ensureFreshToken(): Promise<string> {
  if (state.accessToken) return state.accessToken
  if (state.refreshing) return state.refreshing

  const refresh = loadRefreshToken()
  if (!refresh) throw new SpotifyError('Not authenticated', 401, false)

  state.refreshing = refreshAccessToken(refresh)
    .then((tokens) => {
      state.accessToken = tokens.accessToken
      return tokens.accessToken
    })
    .catch((err) => {
      clearRefreshToken()
      state.accessToken = null
      state.onUnauth?.()
      throw err
    })
    .finally(() => {
      state.refreshing = null
    })
  return state.refreshing
}

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

const SPOTIFY_BASE = 'https://api.spotify.com/v1'

export async function spotifyFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  return spotifyFetchInternal<T>(path, opts, /*isRetry*/ false)
}

async function spotifyFetchInternal<T>(
  path: string,
  opts: RequestOpts,
  isRetry: boolean
): Promise<T> {
  const token = await ensureFreshToken()
  const url = path.startsWith('http') ? path : SPOTIFY_BASE + path

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (res.status === 204) return undefined as unknown as T

  if (res.status === 401 && !isRetry) {
    state.accessToken = null
    return spotifyFetchInternal<T>(path, opts, true)
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1')
    await sleep(retryAfter * 1000)
    return spotifyFetchInternal<T>(path, opts, isRetry)
  }

  if (!res.ok) {
    const retryable = res.status >= 500
    const text = await res.text().catch(() => '')
    throw new SpotifyError(
      `Spotify ${res.status}${text ? `: ${text}` : ''}`,
      res.status,
      retryable
    )
  }

  return (await res.json()) as T
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
