import type { Track } from './track'
import { fetchArtistTags, LastfmAbortError, LastfmFatalError } from '@/api/lastfm'
import * as cache from './inferenceCache'
import { normalizeGenre } from './genreWhitelist'

const THROTTLE_MS = 200 // 5 req/sec

export type InferenceProgress = { done: number; total: number }

export type InferenceResult = {
  perArtist: Map<string, string[]> // includes pre-cached and freshly fetched
  fetched: number // count of artists actually called against Last.fm
  fromCache: number
}

export type InferenceParams = {
  tracks: Track[]
  candidateArtistIds: string[]
  whitelist: ReadonlySet<string>
  signal: AbortSignal
  onProgress?: (p: InferenceProgress) => void
}

// Computes the candidate set: artistIds that appear on at least one track
// whose genres array is empty.
export function candidateArtistIds(tracks: Track[]): string[] {
  const ids = new Set<string>()
  for (const t of tracks) {
    if (t.genres.length > 0) continue
    for (const id of t.artistIds) ids.add(id)
  }
  return Array.from(ids)
}

// Build a Map<artistId, artistName> from track data. First-seen name wins.
export function artistNamesById(tracks: Track[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of tracks) {
    for (let i = 0; i < t.artistIds.length; i++) {
      const id = t.artistIds[i]
      if (id && !out.has(id)) out.set(id, t.artistNames[i] ?? '')
    }
  }
  return out
}

export async function inferGenres(params: InferenceParams): Promise<InferenceResult> {
  const { tracks, candidateArtistIds: candidates, whitelist, signal, onProgress } = params
  const stored = cache.read()
  const nameById = artistNamesById(tracks)

  const uncached = candidates.filter((id) => !(id in stored))
  const total = uncached.length
  let done = 0
  let fetched = 0

  const updates: cache.InferenceCache = {}

  for (const id of uncached) {
    if (signal.aborted) {
      cache.write(cache.merge(stored, updates))
      throw new LastfmAbortError()
    }
    const name = nameById.get(id)
    if (!name) {
      updates[id] = []
      done++
      onProgress?.({ done, total })
      continue
    }
    try {
      const raw = await fetchArtistTags(name, signal)
      const kept = filterTags(raw, whitelist)
      updates[id] = kept
      fetched++
    } catch (err) {
      if (err instanceof LastfmAbortError) {
        cache.write(cache.merge(stored, updates))
        throw err
      }
      if (err instanceof LastfmFatalError && /rate limit/i.test(err.message)) {
        cache.write(cache.merge(stored, updates))
        throw err
      }
      // Other transient/fatal: skip this artist (no cache entry)
    }
    done++
    onProgress?.({ done, total })
    if (done < total) await sleep(THROTTLE_MS, signal)
  }

  const merged = cache.merge(stored, updates)
  cache.write(merged)

  const perArtist = new Map<string, string[]>()
  for (const id of candidates) {
    const tags = merged[id]
    if (tags) perArtist.set(id, tags)
  }

  return {
    perArtist,
    fetched,
    fromCache: candidates.length - uncached.length,
  }
}

// Apply inference results to tracks immutably. inferredGenres = union of
// whitelisted tags from all of a track's artists, minus any value already
// present in t.genres (so the two arrays remain disjoint per Track type doc).
export function applyInference(
  tracks: Track[],
  perArtist: ReadonlyMap<string, string[]>
): Track[] {
  return tracks.map((t) => {
    const set = new Set<string>()
    for (const id of t.artistIds) {
      for (const g of perArtist.get(id) ?? []) set.add(g)
    }
    if (set.size === 0 && t.inferredGenres.length === 0) return t
    for (const g of t.genres) set.delete(g)
    const next = Array.from(set)
    if (sameValues(next, t.inferredGenres)) return t
    return { ...t, inferredGenres: next }
  })
}

function filterTags(raw: string[], whitelist: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of raw) {
    const norm = normalizeGenre(tag)
    if (!whitelist.has(norm)) continue
    if (seen.has(norm)) continue
    seen.add(norm)
    out.push(norm)
  }
  return out
}

function sameValues(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  for (const v of b) if (!set.has(v)) return false
  return true
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new LastfmAbortError())
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      reject(new LastfmAbortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
