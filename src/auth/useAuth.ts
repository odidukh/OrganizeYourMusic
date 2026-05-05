import { useCallback, useEffect, useState } from 'react'
import {
  beginLoginRedirect,
  clearRefreshToken,
  exchangeCodeForTokens,
  loadRefreshToken,
  refreshAccessToken,
  stripCodeFromUrl,
} from './spotifyAuth'
import { setAccessToken, setOnUnauthCallback } from '@/api/spotifyClient'

type AuthStatus =
  | { kind: 'idle' }
  | { kind: 'authenticating' } // waiting for token exchange
  | { kind: 'authenticated' }
  | { kind: 'unauth' }
  | { kind: 'error'; message: string }

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>({ kind: 'idle' })

  const handleUnauth = useCallback(() => {
    setStatus({ kind: 'unauth' })
  }, [])

  useEffect(() => {
    setOnUnauthCallback(handleUnauth)
  }, [handleUnauth])

  // On mount: check URL for ?code=, otherwise try refresh from localStorage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      stripCodeFromUrl()
      setStatus({ kind: 'error', message: `Spotify login was cancelled (${error}).` })
      return
    }

    if (code) {
      setStatus({ kind: 'authenticating' })
      exchangeCodeForTokens(code)
        .then((tokens) => {
          setAccessToken(tokens.accessToken)
          stripCodeFromUrl()
          setStatus({ kind: 'authenticated' })
        })
        .catch((err) => {
          stripCodeFromUrl()
          setStatus({ kind: 'error', message: err.message ?? 'Login failed.' })
        })
      return
    }

    const refresh = loadRefreshToken()
    if (refresh) {
      refreshAccessToken(refresh)
        .then((tokens) => {
          setAccessToken(tokens.accessToken)
          setStatus({ kind: 'authenticated' })
        })
        .catch(() => {
          clearRefreshToken()
          setStatus({ kind: 'unauth' })
        })
      return
    }

    setStatus({ kind: 'unauth' })
  }, [])

  const login = useCallback(() => {
    beginLoginRedirect().catch((err) =>
      setStatus({ kind: 'error', message: err.message ?? 'Could not start login.' })
    )
  }, [])

  const logout = useCallback(() => {
    clearRefreshToken()
    setAccessToken(null)
    setStatus({ kind: 'unauth' })
  }, [])

  return { status, login, logout }
}
