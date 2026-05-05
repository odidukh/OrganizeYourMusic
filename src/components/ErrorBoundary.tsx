import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error)
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container px-4 py-32 mx-auto max-w-md text-center">
          <h2 className="mb-4 text-2xl font-semibold">Something broke.</h2>
          <p className="mb-6 text-sm text-muted-foreground">{this.state.error.message}</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )
    }
    return this.props.children
  }
}
