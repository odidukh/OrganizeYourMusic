import { spotifyFetch } from '@/api/spotifyClient'
import { paginate, batchedFetch, type ProgressUpdate } from '@/api/pagination'
import { dedupeTracks, mergeArtistGenres, normalizePlaylistItems, normalizeSavedItems, type Track } from './track'

export type Source =
  | { type: 'saved' }
  | { type: 'added' }
  | { type: 'follow' }
  | { type: 'all' }
  | { type: 'playlist'; id: string }

export type FetchResult = { tracks: Track[]; truncated: boolean; reportedTotal: number }

export type ProgressPhase = 'tracks' | 'genres'
export type ProgressEvent = { phase: ProgressPhase; fetched: number; total: number }

const PAGE = 50
const ARTIST_BATCH = 50

type Owner = { id: string }
type PlaylistRef = { id: string; owner: Owner }

export function parsePlaylistInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // bare ID (22 alphanumeric chars typical)
  if (/^[A-Za-z0-9]+$/.test(trimmed) && trimmed.length >= 16) return trimmed
  // spotify URI
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/)
  if (uriMatch) return uriMatch[1]
  // open.spotify.com URL
  try {
    const url = new URL(trimmed)
    if (url.hostname.includes('spotify.com')) {
      const m = url.pathname.match(/\/playlist\/([A-Za-z0-9]+)/)
      if (m) return m[1]
    }
  } catch {
    /* not a URL */
  }
  return null
}

async function fetchSaved(
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<FetchResult> {
  const result = await paginate<{ added_at: string; track: any }>(
    ({ offset, limit }) => `/me/tracks?offset=${offset}&limit=${limit}`,
    PAGE,
    (p) => onProgress({ phase: 'tracks', ...p }),
    signal
  )
  return { tracks: normalizeSavedItems(result.items), truncated: result.truncated, reportedTotal: result.reportedTotal }
}

async function fetchPlaylistTracks(
  playlistId: string,
  onProgress: (p: ProgressUpdate) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const result = await paginate<{ added_at: string | null; track: any }>(
    ({ offset, limit }) => `/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}`,
    PAGE,
    onProgress,
    signal
  )
  return normalizePlaylistItems(result.items)
}

async function fetchUserPlaylists(signal?: AbortSignal): Promise<PlaylistRef[]> {
  const all: PlaylistRef[] = []
  let next: string | null = `/me/playlists?limit=50&offset=0`
  let offset = 0
  while (next) {
    const page = await spotifyFetch<{ items: PlaylistRef[]; next: string | null; total: number }>(next, { signal })
    all.push(...page.items)
    if (!page.next) break
    offset += 50
    next = `/me/playlists?limit=50&offset=${offset}`
  }
  return all
}

async function fetchTracksFromMany(
  playlistIds: string[],
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const all: Track[] = []
  for (let i = 0; i < playlistIds.length; i++) {
    if (signal?.aborted) break
    const tracks = await fetchPlaylistTracks(playlistIds[i], () => {}, signal)
    all.push(...tracks)
    onProgress({ phase: 'tracks', fetched: i + 1, total: playlistIds.length })
  }
  return dedupeTracks(all)
}

async function fetchAdded(
  userId: string,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const playlists = await fetchUserPlaylists(signal)
  const owned = playlists.filter((p) => p.owner.id === userId).map((p) => p.id)
  return fetchTracksFromMany(owned, onProgress, signal)
}

async function fetchFollow(
  userId: string,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const playlists = await fetchUserPlaylists(signal)
  const followed = playlists.filter((p) => p.owner.id !== userId).map((p) => p.id)
  return fetchTracksFromMany(followed, onProgress, signal)
}

async function enrichWithGenres(
  tracks: Track[],
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<Track[]> {
  const ids = Array.from(new Set(tracks.flatMap((t) => t.artistIds)))
  if (ids.length === 0) return tracks

  const batches = await batchedFetch(
    ids,
    ARTIST_BATCH,
    async (chunk) => {
      const json = await spotifyFetch<{ artists: { id: string; genres: string[] }[] }>(
        `/artists?ids=${chunk.join(',')}`,
        { signal }
      )
      return json.artists
    },
    (p) => onProgress({ phase: 'genres', ...p }),
    signal
  )

  const genresByArtist = new Map<string, string[]>()
  for (const batch of batches) {
    for (const a of batch) genresByArtist.set(a.id, a.genres ?? [])
  }
  return mergeArtistGenres(tracks, genresByArtist)
}

export async function fetchTracksForSource(
  source: Source,
  userId: string,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<FetchResult> {
  let tracks: Track[]
  let truncated = false
  let reportedTotal = 0

  if (source.type === 'saved') {
    const r = await fetchSaved(onProgress, signal)
    tracks = r.tracks
    truncated = r.truncated
    reportedTotal = r.reportedTotal
  } else if (source.type === 'playlist') {
    tracks = await fetchPlaylistTracks(source.id, (p) => onProgress({ phase: 'tracks', ...p }), signal)
    reportedTotal = tracks.length
  } else if (source.type === 'added') {
    tracks = await fetchAdded(userId, onProgress, signal)
    reportedTotal = tracks.length
  } else if (source.type === 'follow') {
    tracks = await fetchFollow(userId, onProgress, signal)
    reportedTotal = tracks.length
  } else {
    // 'all'
    const saved = await fetchSaved(onProgress, signal)
    const added = await fetchAdded(userId, onProgress, signal)
    const follow = await fetchFollow(userId, onProgress, signal)
    tracks = dedupeTracks([...saved.tracks, ...added, ...follow])
    truncated = saved.truncated || tracks.length >= 5000
    reportedTotal = tracks.length
  }

  // Cap to 5000 universally
  if (tracks.length > 5000) {
    tracks = tracks.slice(0, 5000)
    truncated = true
  }

  tracks = await enrichWithGenres(tracks, onProgress, signal)
  return { tracks, truncated, reportedTotal }
}

export function sourceLabel(s: Source): string {
  switch (s.type) {
    case 'saved': return 'Saved Tracks'
    case 'added': return 'Songs in Your Playlists'
    case 'follow': return 'Songs in Followed Playlists'
    case 'all': return 'All Your Music'
    case 'playlist': return 'Playlist'
  }
}
