import { Button } from '@/components/ui/button'

type Props = {
  onLogin: () => void
  errorBanner?: string | null
}

export function LoginScreen({ onLogin, errorBanner }: Props) {
  return (
    <div className="container px-4 py-16 mx-auto max-w-2xl">
      <h1 className="mb-4 text-4xl font-bold">Organize Your Music</h1>
      <p className="mb-8 text-muted-foreground">
        Organize your Spotify music collection by decade, genre, duration, popularity, and more.
        Then save any filtered view as a new Spotify playlist.
      </p>
      {errorBanner && (
        <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {errorBanner}
        </div>
      )}
      <Button size="lg" onClick={onLogin}>
        Log in with Spotify
      </Button>
    </div>
  )
}
