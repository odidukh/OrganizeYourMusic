import { useEffect, useState } from 'react'
import { LoginScreen } from '@/features/login/LoginScreen'
import { PickerScreen } from '@/features/pick/PickerScreen'
import { useAuth } from '@/auth/useAuth'
import { useCurrentUser } from '@/api/queries'
import type { AppState } from '@/state/appState'
import type { Source } from '@/domain/sources'
import './App.css'

export default function App() {
  const { status, login, logout } = useAuth()
  const userQuery = useCurrentUser(status.kind === 'authenticated')

  const [state, setState] = useState<AppState>({ kind: 'unauth' })

  useEffect(() => {
    if (status.kind === 'authenticated' && userQuery.data) {
      setState({ kind: 'picking', user: userQuery.data })
    } else if (status.kind === 'unauth') {
      setState({ kind: 'unauth' })
    } else if (status.kind === 'error') {
      setState({ kind: 'error', message: status.message })
    }
  }, [status, userQuery.data])

  function handleOrganize(source: Source) {
    if (state.kind !== 'picking') return
    console.warn('Organize requested', source)
  }

  if (state.kind === 'picking') {
    return <PickerScreen user={state.user} onOrganize={handleOrganize} onLogout={logout} />
  }

  if (state.kind === 'error') {
    return (
      <LoginScreen
        onLogin={login}
        errorBanner={state.message}
      />
    )
  }

  return <LoginScreen onLogin={login} />
}
