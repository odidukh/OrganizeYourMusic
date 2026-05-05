import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Charts, type FilterKind } from './Charts'
import { TrackTable } from './TrackTable'
import { sourceLabel, type Source } from '@/domain/sources'
import {
  decadeForYear,
  durationBucketLabel,
  popularityBucketLabel,
} from '@/domain/bucketing'
import type { Track } from '@/domain/track'

type Filter = { kind: FilterKind; label: string }

type Props = {
  source: Source
  tracks: Track[]
  truncated: boolean
  onSave: (filteredTracks: Track[], summary: string) => void
  onBack: () => void
}

export function OrganizeScreen({ source, tracks, truncated, onSave, onBack }: Props) {
  const [filters, setFilters] = useState<Filter[]>([])
  const [search, setSearch] = useState('')

  const filteredTracks = useMemo(() => {
    if (filters.length === 0) return tracks
    return tracks.filter((t) => filters.every((f) => matchesFilter(t, f)))
  }, [tracks, filters])

  function addFilter(kind: FilterKind, label: string) {
    setFilters((prev) => {
      const without = prev.filter((f) => f.kind !== kind)
      return [...without, { kind, label }]
    })
  }

  function removeFilter(idx: number) {
    setFilters((prev) => prev.filter((_, i) => i !== idx))
  }

  const filterSummary =
    filters.length === 0 ? '' : ' — ' + filters.map((f) => f.label).join(', ')
  const defaultName = `Organized: ${sourceLabel(source)}${filterSummary}`

  return (
    <div className="container px-4 py-8 mx-auto max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">{sourceLabel(source)}</h2>
          <p className="text-sm text-muted-foreground">
            {tracks.length.toLocaleString()} total tracks
            {truncated && ' (capped at 5,000)'}
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>← Back</Button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {filters.map((f, i) => (
            <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeFilter(i)}>
              {f.kind}: {f.label} ×
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[400px_1fr]">
        <div>
          <Charts tracks={filteredTracks} onSelect={addFilter} />
        </div>
        <div className="flex flex-col h-[70vh]">
          <TrackTable tracks={filteredTracks} search={search} onSearchChange={setSearch} />
          <div className="flex items-center justify-between pt-3 mt-3 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()}
            </span>
            <Button onClick={() => onSave(filteredTracks, defaultName)} disabled={filteredTracks.length === 0}>
              Save filtered view as playlist
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function matchesFilter(t: Track, f: Filter): boolean {
  switch (f.kind) {
    case 'decade':
      return decadeForYear(t.album.releaseYear) === f.label
    case 'genre':
      if (f.label === 'other') return t.genres.length === 0
      return t.genres.includes(f.label)
    case 'duration':
      return durationBucketLabel(t.durationMs) === f.label
    case 'popularity':
      return popularityBucketLabel(t.popularity) === f.label
  }
}
