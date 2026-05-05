import { useEffect, useState } from 'react'
import { LoginScreen } from '@/features/login/LoginScreen'
import { PickerScreen } from '@/features/pick/PickerScreen'
import { LoadingScreen } from '@/features/loading/LoadingScreen'
import { useAuth } from '@/auth/useAuth'
import { useCurrentUser } from '@/api/queries'
import type { AppState } from '@/state/appState'
import type { Source } from '@/domain/sources'
import { fetchTracksForSource } from '@/domain/sources'
import './App.css'

export default function App() {
  const { status, login, logout } = useAuth()
  const userQuery = useCurrentUser(status.kind === 'authenticated')

  const [state, setState] = useState<AppState>({ kind: 'unauth' })

  useEffect(() => {
    if (status.kind === 'authenticated' && userQuery.data) {
      setState((prev) =>
        prev.kind === 'unauth' || prev.kind === 'error'
          ? { kind: 'picking', user: userQuery.data! }
          : prev
      )
    } else if (status.kind === 'unauth') {
      setState({ kind: 'unauth' })
    } else if (status.kind === 'error') {
      setState({ kind: 'error', message: status.message })
    }
  }, [status, userQuery.data])

  function handleOrganize(source: Source) {
    if (state.kind !== 'picking') return
    const user = state.user
    const abort = new AbortController()
    setState({
      kind: 'loading',
      source,
      user,
      abort,
      progress: { phase: 'tracks', fetched: 0, total: 0 },
    })

    fetchTracksForSource(
      source,
      user.id,
      (p) => setState((prev) => (prev.kind === 'loading' ? { ...prev, progress: p } : prev)),
      abort.signal
    )
      .then(({ tracks, truncated }) => {
        setState({ kind: 'organizing', source, user, tracks, truncated })
      })
      .catch((err) => {
        if (abort.signal.aborted) return
        setState({
          kind: 'error',
          message: err.message ?? 'Failed to fetch tracks.',
          retry: () => handleOrganize(source),
        })
      })
  }

  function handleCancel() {
    if (state.kind !== 'loading') return
    state.abort.abort()
    setState({ kind: 'picking', user: state.user })
  }

  if (state.kind === 'picking') {
    return <PickerScreen user={state.user} onOrganize={handleOrganize} onLogout={logout} />
  }

  if (state.kind === 'loading') {
    return <LoadingScreen progress={state.progress} onCancel={handleCancel} />
  }

  if (state.kind === 'organizing') {
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl">
        <h2 className="mb-4 text-2xl font-semibold">Loaded {state.tracks.length} tracks</h2>
        {state.truncated && (
          <p className="mb-4 text-sm text-amber-600">
            Showing first 5,000 tracks. Pick a smaller source for full coverage.
          </p>
        )}
        <pre className="text-xs">{JSON.stringify(state.tracks.slice(0, 3), null, 2)}</pre>
      </div>
    )
  }

  if (state.kind === 'error') {
    return <LoginScreen onLogin={state.retry ?? login} errorBanner={state.message} />
  }

  return <LoginScreen onLogin={login} />
}
