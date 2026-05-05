import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { Track } from '@/domain/track'

type Props = {
  tracks: Track[]
  previousByTrackId: ReadonlyMap<string, ReadonlySet<string>>
  onDismiss: () => void
}

export function LastRunTable({ tracks, previousByTrackId, onDismiss }: Props) {
  const rows = useMemo(
    () =>
      tracks.map((t) => {
        const prev = previousByTrackId.get(t.id) ?? new Set<string>()
        const newTags = t.inferredGenres.filter((g) => !prev.has(g))
        return { track: t, newTags }
      }),
    [tracks, previousByTrackId]
  )

  return (
    <section className="mt-6 rounded border">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-semibold">
          Last run · {tracks.length.toLocaleString()} tracks enriched
        </h3>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </header>

      <div className="grid grid-cols-[2fr_1.5fr_3fr] gap-2 px-4 py-2 text-xs font-semibold border-b bg-muted/30">
        <span>Title</span>
        <span>Artist</span>
        <span>New inferred genres</span>
      </div>

      <div className="max-h-[40vh] overflow-auto">
        {rows.map(({ track, newTags }) => (
          <div
            key={track.id}
            className="grid grid-cols-[2fr_1.5fr_3fr] gap-2 px-4 py-2 text-sm border-b items-center"
          >
            <span className="truncate">{track.name}</span>
            <span className="truncate text-muted-foreground">
              {track.artistNames.join(', ')}
            </span>
            <span className="flex flex-wrap gap-1">
              {newTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded border px-1.5 py-0.5 text-xs"
                >
                  {tag}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
