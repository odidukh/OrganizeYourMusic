import { generateCodeVerifier, deriveCodeChallenge } from './pkce'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'

const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ')

const VERIFIER_KEY = 'oym_pkce_verifier'
const REFRESH_KEY = 'oym_refresh_token'

export type TokenSet = {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

function clientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (!id) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set')
  return id
}

function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

export async function beginLoginRedirect(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await deriveCodeChallenge(verifier)
  localStorage.setItem(VERIFIER_KEY, verifier)

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('scope', SCOPES)

  window.location.assign(url.toString())
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const verifier = localStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Missing PKCE verifier; please log in again.')

  const body = new URLSearchParams({
    client_id: clientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  localStorage.removeItem(VERIFIER_KEY)
  const tokens: TokenSet = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  saveRefreshToken(tokens.refreshToken)
  return tokens
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: clientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Refresh failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  // Spotify rotates refresh tokens; keep the new one if returned.
  const newRefresh = json.refresh_token ?? refreshToken
  saveRefreshToken(newRefresh)
  return {
    accessToken: json.access_token,
    refreshToken: newRefresh,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
}

export function loadRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function saveRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token)
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_KEY)
}

export function stripCodeFromUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}
