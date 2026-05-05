import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Charts } from './Charts'
import { TrackTable } from './TrackTable'
import { SavePlaylistDialog } from './SavePlaylistDialog'
import { FilterChip } from './FilterChip'
import { useFilterUrlSync } from './useFilterUrlSync'
import { sourceLabel, type Source } from '@/domain/sources'
import {
  clearAll,
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

  const sourceKey = useMemo(() => sourceKeyOf(source), [source])

  useFilterUrlSync({
    sourceKey,
    state,
    onRestore: (restored) => {
      setState(restored)
      setSearch(selectedFor(restored, 'search')[0] ?? '')
    },
    onRestoreFailure: () =>
      toast.warning("Couldn't restore filters from link"),
  })

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
          {filteredTracks.length === 0 && state.filters.length > 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded border border-dashed text-center p-6">
              <p className="text-sm text-muted-foreground">
                No tracks match these filters.
              </p>
              <Button variant="outline" onClick={() => setState(clearAll())}>
                Clear all filters
              </Button>
            </div>
          ) : (
            <TrackTable tracks={filteredTracks} search={search} onSearchChange={setSearch} />
          )}
          <div className="flex items-center justify-between pt-3 mt-3 border-t gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href)
                    toast.success('Link copied')
                  } catch {
                    toast.error('Could not copy link')
                  }
                }}
                disabled={state.filters.length === 0}
              >
                Copy link
              </Button>
              <Button onClick={() => setSaveOpen(true)} disabled={filteredTracks.length === 0}>
                Save filtered view as playlist
              </Button>
            </div>
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

function sourceKeyOf(source: Source): string {
  switch (source.type) {
    case 'saved':
      return 'saved'
    case 'added':
      return 'added'
    case 'follow':
      return 'follow'
    case 'all':
      return 'all'
    case 'playlist':
      return `playlist:${source.id}`
  }
}
