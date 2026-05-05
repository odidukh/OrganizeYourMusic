import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Charts } from './Charts'
import { TrackTable } from './TrackTable'
import { SavePlaylistDialog } from './SavePlaylistDialog'
import { FilterChip } from './FilterChip'
import { sourceLabel, type Source } from '@/domain/sources'
import {
  emptyFilterState,
  matchesFilters,
  removeFilter,
  removeValue,
  selectedValues as selectedFor,
  setMode,
  toggleValue,
  upsertSearch,
  type FilterKind,
  type FilterState,
} from '@/domain/filters'
import type { Track } from '@/domain/track'
import type { SpotifyUser } from '@/state/appState'

type Props = {
  user: SpotifyUser
  source: Source
  tracks: Track[]
  truncated: boolean
  onBack: () => void
}

export function OrganizeScreen({ user, source, tracks, truncated, onBack }: Props) {
  const [state, setState] = useState<FilterState>(emptyFilterState)
  const [search, setSearch] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setState((prev) => upsertSearch(prev, search))
    }, 150)
    return () => clearTimeout(t)
  }, [search])

  const filteredTracks = useMemo(
    () => (state.filters.length === 0 ? tracks : tracks.filter((t) => matchesFilters(t, state.filters))),
    [tracks, state]
  )

  function onToggle(kind: FilterKind, value: string) {
    setState((prev) => toggleValue(prev, kind, value))
  }

  function onRemoveFilter(kind: FilterKind) {
    setState((prev) => removeFilter(prev, kind))
  }

  const summary =
    state.filters.length === 0
      ? ''
      : ' — ' +
        state.filters
          .map((f) => `${f.kind}${f.mode === 'exclude' ? '≠' : ':'}${f.values.join('/')}`)
          .join(', ')
  const defaultName = `Organized: ${sourceLabel(source)}${summary}`

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

      {state.filters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {state.filters.map((f) => (
            <FilterChip
              key={f.kind}
              filter={f}
              onSetMode={(kind, mode) => setState((p) => setMode(p, kind, mode))}
              onRemoveValue={(kind, v) => setState((p) => removeValue(p, kind, v))}
              onRemove={onRemoveFilter}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0">
          <Charts
            tracks={tracks}
            filtered={filteredTracks}
            selection={{
              decade: selectedFor(state, 'decade'),
              genre: selectedFor(state, 'genre'),
              duration: selectedFor(state, 'duration'),
              popularity: selectedFor(state, 'popularity'),
            }}
            onToggle={onToggle}
          />
        </div>
        <div className="flex flex-col h-[70vh] min-w-0">
          <TrackTable tracks={filteredTracks} search={search} onSearchChange={setSearch} />
          <div className="flex items-center justify-between pt-3 mt-3 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()}
            </span>
            <Button onClick={() => setSaveOpen(true)} disabled={filteredTracks.length === 0}>
              Save filtered view as playlist
            </Button>
          </div>
        </div>
      </div>

      {saveOpen && (
        <SavePlaylistDialog
          user={user}
          tracks={filteredTracks}
          defaultName={defaultName}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  )
}
