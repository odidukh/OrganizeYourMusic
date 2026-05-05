import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ProgressEvent } from '@/domain/sources'

type Props = {
  progress: ProgressEvent
  onCancel: () => void
}

export function LoadingScreen({ progress, onCancel }: Props) {
  const pct = progress.total > 0 ? Math.round((progress.fetched / progress.total) * 100) : 0
  const label =
    progress.phase === 'tracks'
      ? `Fetching tracks (${progress.fetched.toLocaleString()}/${progress.total.toLocaleString()})…`
      : `Loading artist genres (${progress.fetched}/${progress.total} batches)…`

  return (
    <div className="container px-4 py-32 mx-auto max-w-md text-center">
      <h2 className="mb-6 text-2xl font-semibold">Organizing your music</h2>
      <Progress value={pct} className="mb-3" />
      <p className="mb-8 text-sm text-muted-foreground">{label}</p>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
  )
}
