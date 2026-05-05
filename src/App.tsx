import { useEffect, useState } from 'react'
import { LoginScreen } from '@/features/login/LoginScreen'
import { PickerScreen } from '@/features/pick/PickerScreen'
import { LoadingScreen } from '@/features/loading/LoadingScreen'
import { OrganizeScreen } from '@/features/organize/OrganizeScreen'
import { useAuth } from '@/auth/useAuth'
import { useCurrentUser } from '@/api/queries'
import { Button } from '@/components/ui/button'
import type { AppState, SpotifyUser } from '@/state/appState'
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

  function startOrganize(source: Source, user: SpotifyUser) {
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
          retry: () => startOrganize(source, user),
        })
      })
  }

  function handleOrganize(source: Source) {
    if (state.kind !== 'picking') return
    startOrganize(source, state.user)
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
      <OrganizeScreen
        user={state.user}
        source={state.source}
        tracks={state.tracks}
        truncated={state.truncated}
        onBack={() => setState({ kind: 'picking', user: state.user })}
      />
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="container px-4 py-32 mx-auto max-w-md text-center">
        <h2 className="mb-4 text-2xl font-semibold">Something went wrong</h2>
        <p className="mb-6 text-sm text-muted-foreground">{state.message}</p>
        <div className="flex justify-center gap-2">
          {state.retry && <Button onClick={state.retry}>Retry</Button>}
          <Button variant="outline" onClick={() => setState({ kind: 'unauth' })}>
            Back to login
          </Button>
        </div>
      </div>
    )
  }

  return <LoginScreen onLogin={login} />
}
