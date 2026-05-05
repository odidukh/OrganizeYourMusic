export type Track = {
  id: string
  uri: string
  name: string
  artistNames: string[]
  artistIds: string[]
  album: { name: string; releaseYear: number; releaseDate: string }
  durationMs: number
  popularity: number
  explicit: boolean
  previewUrl: string | null
  genres: string[] // populated post artist enrichment
  addedAt: string | null
}

type RawArtist = { id: string; name: string }
type RawAlbum = { name: string; release_date: string }

type RawTrack = {
  id: string | null
  uri: string
  name: string
  artists: RawArtist[]
  album: RawAlbum
  duration_ms: number
  popularity?: number
  explicit: boolean
  preview_url: string | null
}

type SavedTrackItem = { added_at: string; track: RawTrack | null }
type PlaylistTrackItem = { added_at: string | null; track: RawTrack | null }

function parseReleaseYear(releaseDate: string): number {
  const year = Number(releaseDate?.slice(0, 4))
  return Number.isFinite(year) ? year : 0
}

export function normalizeTrack(raw: RawTrack, addedAt: string | null = null): Track | null {
  if (!raw || !raw.id) return null
  const artists = raw.artists ?? []
  const releaseDate = raw.album?.release_date ?? ''
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artistNames: artists.map((a) => a.name),
    artistIds: artists.map((a) => a.id),
    album: {
      name: raw.album?.name ?? '',
      releaseDate,
      releaseYear: parseReleaseYear(releaseDate),
    },
    durationMs: raw.duration_ms,
    popularity: raw.popularity ?? 0,
    explicit: raw.explicit,
    previewUrl: raw.preview_url,
    genres: [],
    addedAt,
  }
}

export function normalizeSavedItems(items: SavedTrackItem[]): Track[] {
  return items
    .map((it) => (it.track ? normalizeTrack(it.track, it.added_at) : null))
    .filter((t): t is Track => t !== null)
}

export function normalizePlaylistItems(items: PlaylistTrackItem[]): Track[] {
  return items
    .map((it) => (it.track ? normalizeTrack(it.track, it.added_at) : null))
    .filter((t): t is Track => t !== null)
}

export function mergeArtistGenres(
  tracks: Track[],
  genresByArtistId: Map<string, string[]>
): Track[] {
  return tracks.map((t) => {
    const set = new Set<string>()
    for (const aid of t.artistIds) {
      for (const g of genresByArtistId.get(aid) ?? []) set.add(g)
    }
    return { ...t, genres: Array.from(set) }
  })
}

export function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Map<string, Track>()
  for (const t of tracks) if (!seen.has(t.id)) seen.set(t.id, t)
  return Array.from(seen.values())
}
