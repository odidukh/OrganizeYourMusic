import { useMemo, useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Input } from '@/components/ui/input'
import type { Track } from '@/domain/track'

type SortKey = 'name' | 'artist' | 'album' | 'year' | 'duration' | 'popularity' | 'explicit' | null
type SortDir = 'asc' | 'desc'

type Props = {
  tracks: Track[]
  search: string
  onSearchChange: (s: string) => void
}

const ROW_HEIGHT = 40

export function TrackTable({ tracks, search, onSearchChange }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [debouncedSearch, setDebouncedSearch] = useState(search)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200)
    return () => clearTimeout(t)
  }, [search])

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return tracks
    const q = debouncedSearch.toLowerCase()
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.artistNames.some((a) => a.toLowerCase().includes(q))
    )
  }, [tracks, debouncedSearch])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = pickSortValue(a, sortKey)
      const bv = pickSortValue(b, sortKey)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  function toggleSort(key: Exclude<SortKey, null>) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortKey(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <Input
          placeholder="Search title or artist…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-[40px_2fr_1.5fr_1.5fr_60px_70px_70px_50px] gap-2 px-2 py-2 text-xs font-semibold border-b">
        <span>#</span>
        <Header label="Title" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
        <Header label="Artist" active={sortKey === 'artist'} dir={sortDir} onClick={() => toggleSort('artist')} />
        <Header label="Album" active={sortKey === 'album'} dir={sortDir} onClick={() => toggleSort('album')} />
        <Header label="Year" active={sortKey === 'year'} dir={sortDir} onClick={() => toggleSort('year')} />
        <Header label="Duration" active={sortKey === 'duration'} dir={sortDir} onClick={() => toggleSort('duration')} />
        <Header label="Pop" active={sortKey === 'popularity'} dir={sortDir} onClick={() => toggleSort('popularity')} />
        <Header label="E" active={sortKey === 'explicit'} dir={sortDir} onClick={() => toggleSort('explicit')} />
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto" style={{ contain: 'strict' }}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vrow) => {
            const track = sorted[vrow.index]
            return (
              <div
                key={track.id + ':' + vrow.index}
                className="absolute left-0 right-0 grid grid-cols-[40px_2fr_1.5fr_1.5fr_60px_70px_70px_50px] gap-2 px-2 items-center text-sm border-b"
                style={{ top: vrow.start, height: ROW_HEIGHT }}
              >
                <span className="text-muted-foreground">{vrow.index + 1}</span>
                <span className="truncate">{track.name}</span>
                <span className="truncate">{track.artistNames.join(', ')}</span>
                <span className="truncate">{track.album.name}</span>
                <span>{track.album.releaseYear || '—'}</span>
                <span>{formatDuration(track.durationMs)}</span>
                <span>{track.popularity}</span>
                <span>{track.explicit ? 'E' : ''}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function pickSortValue(t: Track, key: Exclude<SortKey, null>): string | number {
  switch (key) {
    case 'name': return t.name.toLowerCase()
    case 'artist': return (t.artistNames[0] ?? '').toLowerCase()
    case 'album': return t.album.name.toLowerCase()
    case 'year': return t.album.releaseYear
    case 'duration': return t.durationMs
    case 'popularity': return t.popularity
    case 'explicit': return t.explicit ? 1 : 0
  }
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Header({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: SortDir
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="text-left hover:text-foreground/80">
      {label}
      {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )
}
