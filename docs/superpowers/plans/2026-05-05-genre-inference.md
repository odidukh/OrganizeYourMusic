# Genre Inference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Fill missing genres" button that uses Last.fm's `artist.getTopTags` API to enrich tracks whose Spotify artists return no genres, persisting results in localStorage and surfacing inferred contributions visually in charts and filter chips.

**Architecture:** A new `inferredGenres: string[]` field on `Track` carries Last.fm-sourced tags separately from Spotify-sourced `genres`. Bucketing and filters union both fields for matching. Charts and chips render visual markers for inferred-only contributions. A localStorage cache (`oym:lastfm:v1`) keyed by Spotify `artistId` makes inference one-shot per artist.

**Tech Stack:** React 18 + TypeScript strict, Vite 5, native `fetch` with AbortSignal, no new npm packages, Tailwind 3 + shadcn/ui, Recharts SVG `<pattern>` defs, Sonner toasts.

**Spec:** `docs/superpowers/specs/2026-05-05-genre-inference-design.md`

**Project constraint (CLAUDE.md):** No test runner is wired. Verify each task with `npm run build` (typecheck + Vite build) and `npm run lint`. Manual smoke tests on UI tasks. Do not add tests.

---

## Task 1: Add `inferredGenres` field to Track

**Files:**
- Modify: `src/domain/track.ts`

- [ ] **Step 1: Add field to Track type**

Edit `src/domain/track.ts` — add `inferredGenres: string[]` after `genres`:

```ts
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
  inferredGenres: string[] // populated post Last.fm inference; never includes values already in genres
  addedAt: string | null
}
```

- [ ] **Step 2: Initialize in `normalizeTrack`**

In the same file, in `normalizeTrack`, add `inferredGenres: []` to the returned object next to `genres: []`:

```ts
    genres: [],
    inferredGenres: [],
    addedAt,
```

- [ ] **Step 3: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: Build succeeds. Any lint errors must be unrelated to these changes (the codebase has pre-existing lint warnings — confirm none of them mention `inferredGenres` or `track.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/domain/track.ts
git commit -m "feat(genre): add inferredGenres field to Track type"
```

---

## Task 2: Add Spotify genre seed whitelist

**Files:**
- Create: `src/domain/genreWhitelist.ts`

- [ ] **Step 1: Create the file with the static seed list and helpers**

Create `src/domain/genreWhitelist.ts`:

```ts
// Spotify's published genre seed list (from /recommendations/available-genre-seeds
// before deprecation). Stable, curated vocabulary used as the base whitelist.
const STATIC_GENRES_RAW = [
  'acoustic', 'afrobeat', 'alt-rock', 'alternative', 'ambient', 'anime',
  'black-metal', 'bluegrass', 'blues', 'bossanova', 'brazil', 'breakbeat',
  'british', 'cantopop', 'chicago-house', 'children', 'chill', 'classical',
  'club', 'comedy', 'country', 'dance', 'dancehall', 'death-metal',
  'deep-house', 'detroit-techno', 'disco', 'disney', 'drum-and-bass', 'dub',
  'dubstep', 'edm', 'electro', 'electronic', 'emo', 'folk', 'forro', 'french',
  'funk', 'garage', 'german', 'gospel', 'goth', 'grindcore', 'groove',
  'grunge', 'guitar', 'happy', 'hard-rock', 'hardcore', 'hardstyle',
  'heavy-metal', 'hip-hop', 'holidays', 'honky-tonk', 'house', 'idm', 'indian',
  'indie', 'indie-pop', 'industrial', 'iranian', 'j-dance', 'j-idol', 'j-pop',
  'j-rock', 'jazz', 'k-pop', 'kids', 'latin', 'latino', 'malay', 'mandopop',
  'metal', 'metal-misc', 'metalcore', 'minimal-techno', 'movies', 'mpb',
  'new-age', 'new-release', 'opera', 'pagode', 'party', 'philippines-opm',
  'piano', 'pop', 'pop-film', 'post-dubstep', 'power-pop', 'progressive-house',
  'psych-rock', 'punk', 'punk-rock', 'r-n-b', 'rainy-day', 'reggae',
  'reggaeton', 'road-trip', 'rock', 'rock-n-roll', 'rockabilly', 'romance',
  'sad', 'salsa', 'samba', 'sertanejo', 'show-tunes', 'singer-songwriter',
  'ska', 'sleep', 'songwriter', 'soul', 'soundtracks', 'spanish', 'study',
  'summer', 'swedish', 'synth-pop', 'tango', 'techno', 'trance', 'trip-hop',
  'turkish', 'work-out', 'world-music',
] as const

// Normalize for matching: lowercase, replace dashes/underscores with spaces,
// collapse whitespace, trim. Last.fm returns "Indie Rock", Spotify uses "indie-rock";
// both normalize to "indie rock".
export function normalizeGenre(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const STATIC_GENRES: ReadonlySet<string> = new Set(
  STATIC_GENRES_RAW.map(normalizeGenre)
)

export function buildWhitelist(libraryGenres: Iterable<string>): ReadonlySet<string> {
  const out = new Set<string>(STATIC_GENRES)
  for (const g of libraryGenres) out.add(normalizeGenre(g))
  return out
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/domain/genreWhitelist.ts
git commit -m "feat(genre): add Spotify genre seed whitelist"
```

---

## Task 3: Union `genres` and `inferredGenres` in bucketing and filters

**Files:**
- Modify: `src/domain/bucketing.ts`
- Modify: `src/domain/filters.ts`

- [ ] **Step 1: Update `bucketByGenre` to count both fields**

Edit `src/domain/bucketing.ts`. Replace the body of `bucketByGenre`:

```ts
export function bucketByGenre(tracks: Track[], topN = 15): Bucket[] {
  const counts = new Map<string, number>()
  for (const t of tracks) {
    const merged = unionGenres(t)
    if (merged.length === 0) {
      counts.set('(no genre)', (counts.get('(no genre)') ?? 0) + 1)
      continue
    }
    for (const g of merged) {
      counts.set(g, (counts.get(g) ?? 0) + 1)
    }
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, topN).map(([label, count]) => ({ label, count }))
  const rest = sorted.slice(topN).reduce((sum, [, c]) => sum + c, 0)
  if (rest > 0) top.push({ label: 'other', count: rest })
  return top
}

function unionGenres(t: Track): string[] {
  if (t.inferredGenres.length === 0) return t.genres
  if (t.genres.length === 0) return t.inferredGenres
  return Array.from(new Set([...t.genres, ...t.inferredGenres]))
}
```

- [ ] **Step 2: Update `topGenres` (no change needed but verify)**

`topGenres` calls `bucketByGenre` and filters out `'other'` and `'(no genre)'`. Since `bucketByGenre` now unions both fields, `topGenres` automatically picks up inferred-derived genres. No code change needed; do not edit.

- [ ] **Step 3: Update `matchGenreValue` in filters to check both fields**

Edit `src/domain/filters.ts`. Replace `matchGenreValue`:

```ts
function matchGenreValue(track: Track, value: string, ctx?: MatchContext): boolean {
  const merged = unionTrackGenres(track)
  if (value === '(no genre)') return merged.length === 0
  if (value === 'other') {
    if (merged.length === 0) return false
    const top = ctx?.topGenres
    if (!top) return false
    return merged.every((g) => !top.has(g))
  }
  return merged.includes(value)
}

function unionTrackGenres(t: Track): string[] {
  if (t.inferredGenres.length === 0) return t.genres
  if (t.genres.length === 0) return t.inferredGenres
  return Array.from(new Set([...t.genres, ...t.inferredGenres]))
}
```

- [ ] **Step 4: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds. Existing tracks have `inferredGenres: []` from Task 1, so behavior is unchanged until inference runs.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Open http://127.0.0.1:8000/OrganizeYourMusic/ , log in, pick a source, organize. Verify charts and filters render exactly as before (no inference run yet, so identical behavior).

- [ ] **Step 6: Commit**

```bash
git add src/domain/bucketing.ts src/domain/filters.ts
git commit -m "feat(genre): bucket and filter union genres + inferredGenres"
```

---

## Task 4: localStorage inference cache

**Files:**
- Create: `src/domain/inferenceCache.ts`

- [ ] **Step 1: Create the cache module**

Create `src/domain/inferenceCache.ts`:

```ts
const STORAGE_KEY = 'oym:lastfm:v1'

export type InferenceCache = Record<string, string[]>

export function read(): InferenceCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: InferenceCache = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out[k] = v as string[]
      }
    }
    return out
  } catch {
    return {}
  }
}

export function write(cache: InferenceCache): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    return true
  } catch {
    return false
  }
}

export function merge(cache: InferenceCache, updates: InferenceCache): InferenceCache {
  return { ...cache, ...updates }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/domain/inferenceCache.ts
git commit -m "feat(genre): add localStorage inference cache"
```

---

## Task 5: Last.fm artist tags client

**Files:**
- Create: `src/api/lastfm.ts`

- [ ] **Step 1: Create the API client**

Create `src/api/lastfm.ts`:

```ts
const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/'

type RawTag = { name: string; count?: number | string }
type RawTopTagsResponse = {
  toptags?: { tag?: RawTag[] | RawTag }
  error?: number
  message?: string
}

export function isConfigured(): boolean {
  return Boolean(getKey())
}

function getKey(): string | undefined {
  const raw = (import.meta.env.VITE_LASTFM_API_KEY as string | undefined)?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

export class LastfmAbortError extends Error {
  constructor() {
    super('aborted')
    this.name = 'LastfmAbortError'
  }
}

export class LastfmFatalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LastfmFatalError'
  }
}

// Returns [] when the artist is unknown, has no tags, or returns only transient
// failures we can't recover from. Throws LastfmAbortError on abort or
// LastfmFatalError on unrecoverable conditions (rate limit exceeded twice,
// network failure on a retry).
export async function fetchArtistTags(
  artistName: string,
  signal: AbortSignal
): Promise<string[]> {
  const key = getKey()
  if (!key) throw new LastfmFatalError('VITE_LASTFM_API_KEY not configured')

  const url = new URL(ENDPOINT)
  url.searchParams.set('method', 'artist.getTopTags')
  url.searchParams.set('artist', artistName)
  url.searchParams.set('api_key', key)
  url.searchParams.set('format', 'json')
  url.searchParams.set('autocorrect', '1')

  return await fetchWithRetry(url.toString(), signal)
}

async function fetchWithRetry(url: string, signal: AbortSignal): Promise<string[]> {
  // First attempt
  const first = await attempt(url, signal)
  if (first.kind === 'ok') return first.tags
  if (first.kind === 'empty') return []
  if (first.kind === 'fatal') throw new LastfmFatalError(first.message)

  // Retry once for transient (5xx, network, 429, error:8)
  await sleep(first.kind === 'rateLimited' ? 5000 : 1000, signal)

  const second = await attempt(url, signal)
  if (second.kind === 'ok') return second.tags
  if (second.kind === 'empty') return []
  if (second.kind === 'fatal') throw new LastfmFatalError(second.message)
  if (second.kind === 'rateLimited') {
    throw new LastfmFatalError('Last.fm rate limit exceeded')
  }
  // Second 5xx / network: skip this artist (caller treats as no cache write)
  throw new LastfmFatalError(second.message ?? 'Last.fm transient failure')
}

type AttemptResult =
  | { kind: 'ok'; tags: string[] }
  | { kind: 'empty' } // artist not found or no tags returned
  | { kind: 'transient'; message: string } // 5xx, network error, error:8
  | { kind: 'rateLimited' }
  | { kind: 'fatal'; message: string }

async function attempt(url: string, signal: AbortSignal): Promise<AttemptResult> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new LastfmAbortError()
    return { kind: 'transient', message: 'network error' }
  }

  if (res.status === 429) return { kind: 'rateLimited' }
  if (res.status >= 500) return { kind: 'transient', message: `HTTP ${res.status}` }
  if (!res.ok) return { kind: 'fatal', message: `HTTP ${res.status}` }

  let json: RawTopTagsResponse
  try {
    json = await res.json()
  } catch {
    return { kind: 'transient', message: 'invalid JSON' }
  }

  if (json.error === 6) return { kind: 'empty' } // artist not found
  if (json.error === 8) return { kind: 'transient', message: 'operation failed' }
  if (typeof json.error === 'number') {
    return { kind: 'fatal', message: json.message ?? `Last.fm error ${json.error}` }
  }

  const raw = json.toptags?.tag
  if (!raw) return { kind: 'empty' }
  const list = Array.isArray(raw) ? raw : [raw]
  const tags = list.map((t) => t.name).filter((s): s is string => typeof s === 'string' && s.length > 0)
  return { kind: 'ok', tags }
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
```

- [ ] **Step 2: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/api/lastfm.ts
git commit -m "feat(genre): add Last.fm artist tags client"
```

---

## Task 6: Inference orchestrator

**Files:**
- Create: `src/domain/genreInference.ts`

- [ ] **Step 1: Create the orchestrator**

Create `src/domain/genreInference.ts`:

```ts
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
```

- [ ] **Step 2: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/domain/genreInference.ts
git commit -m "feat(genre): add inference orchestrator"
```

---

## Task 7: FillGenresButton component

**Files:**
- Create: `src/features/organize/FillGenresButton.tsx`

- [ ] **Step 1: Create the button component**

Create `src/features/organize/FillGenresButton.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isConfigured, LastfmAbortError, LastfmFatalError } from '@/api/lastfm'
import {
  applyInference,
  artistNamesById,
  candidateArtistIds,
  inferGenres,
  type InferenceProgress,
} from '@/domain/genreInference'
import { buildWhitelist } from '@/domain/genreWhitelist'
import type { Track } from '@/domain/track'

type Props = {
  tracks: Track[]
  onTracksUpdate: (next: Track[]) => void
}

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'running'; controller: AbortController; progress: InferenceProgress }
  | { kind: 'done'; filled: number; remaining: number }

export function FillGenresButton({ tracks, onTracksUpdate }: Props) {
  const [state, setState] = useState<ButtonState>({ kind: 'idle' })
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  useEffect(() => {
    if (state.kind !== 'done') return
    const t = setTimeout(() => setState({ kind: 'idle' }), 4000)
    return () => clearTimeout(t)
  }, [state])

  if (!isConfigured()) {
    return (
      <Button variant="outline" disabled title="Genre inference not configured">
        Fill missing genres
      </Button>
    )
  }

  const noGenreCount = tracks.reduce(
    (n, t) => (t.genres.length === 0 && t.inferredGenres.length === 0 ? n + 1 : n),
    0
  )

  if (state.kind === 'running') {
    return (
      <Button
        variant="outline"
        onClick={() => state.controller.abort()}
      >
        Cancel ({state.progress.done}/{state.progress.total})
      </Button>
    )
  }

  if (state.kind === 'done') {
    return (
      <Button variant="outline" disabled>
        Filled {state.filled} ✓
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      disabled={noGenreCount === 0}
      onClick={() => start()}
      title={noGenreCount === 0 ? 'No tracks need inference' : `${noGenreCount} tracks have no genre`}
    >
      Fill missing genres
    </Button>
  )

  async function start() {
    const controller = new AbortController()
    const initial: InferenceProgress = { done: 0, total: 0 }
    setState({ kind: 'running', controller, progress: initial })

    const current = tracksRef.current
    const candidates = candidateArtistIds(current)
    if (candidates.length === 0) {
      setState({ kind: 'done', filled: 0, remaining: 0 })
      return
    }

    const libraryGenres: string[] = []
    for (const t of current) for (const g of t.genres) libraryGenres.push(g)
    const whitelist = buildWhitelist(libraryGenres)

    try {
      const result = await inferGenres({
        tracks: current,
        candidateArtistIds: candidates,
        whitelist,
        signal: controller.signal,
        onProgress: (progress) =>
          setState((prev) =>
            prev.kind === 'running' ? { ...prev, progress } : prev
          ),
      })
      const next = applyInference(current, result.perArtist)
      onTracksUpdate(next)
      const filled = next.reduce(
        (n, t, i) =>
          t.inferredGenres.length > 0 && current[i].inferredGenres.length === 0
            ? n + 1
            : n,
        0
      )
      const remaining = next.reduce(
        (n, t) => (t.genres.length === 0 && t.inferredGenres.length === 0 ? n + 1 : n),
        0
      )
      setState({ kind: 'done', filled, remaining })
      toast.success(`Filled ${filled} tracks. ${remaining} still unknown.`)
    } catch (err) {
      const partial = applyInference(current, await readPerArtistFromCache(candidates))
      onTracksUpdate(partial)
      if (err instanceof LastfmAbortError) {
        toast.message('Cancelled. Saved partial progress.')
      } else if (err instanceof LastfmFatalError) {
        toast.error(err.message)
      } else {
        toast.error('Genre inference failed')
      }
      setState({ kind: 'idle' })
    }
  }
}

async function readPerArtistFromCache(
  candidateIds: string[]
): Promise<Map<string, string[]>> {
  const { read } = await import('@/domain/inferenceCache')
  const cached = read()
  const out = new Map<string, string[]>()
  for (const id of candidateIds) {
    const v = cached[id]
    if (v) out.set(id, v)
  }
  return out
}
```

- [ ] **Step 2: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/features/organize/FillGenresButton.tsx
git commit -m "feat(genre): add FillGenresButton component"
```

---

## Task 8: Wire button into OrganizeScreen

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Pass `onTracksUpdate` callback from App**

Edit `src/App.tsx`. In the `state.kind === 'organizing'` branch, replace the `<OrganizeScreen ... />` element:

```tsx
  if (state.kind === 'organizing') {
    return (
      <OrganizeScreen
        user={state.user}
        source={state.source}
        tracks={state.tracks}
        truncated={state.truncated}
        onBack={() => setState({ kind: 'picking', user: state.user })}
        onTracksUpdate={(nextTracks) =>
          setState((prev) =>
            prev.kind === 'organizing' ? { ...prev, tracks: nextTracks } : prev
          )
        }
      />
    )
  }
```

- [ ] **Step 2: Add the prop to OrganizeScreen and render the button**

Edit `src/features/organize/OrganizeScreen.tsx`. Add the import and prop, then place the button next to Copy link. Make these specific changes:

Add import near the other organize-folder imports:

```tsx
import { FillGenresButton } from './FillGenresButton'
```

Update the `Props` type:

```tsx
type Props = {
  user: SpotifyUser
  source: Source
  tracks: Track[]
  truncated: boolean
  onBack: () => void
  onTracksUpdate: (next: Track[]) => void
}
```

Update the function signature to destructure the new prop:

```tsx
export function OrganizeScreen({ user, source, tracks, truncated, onBack, onTracksUpdate }: Props) {
```

Replace the action-bar block (the `<div className="flex gap-2">` containing Copy link and Save) with:

```tsx
            <div className="flex gap-2">
              <FillGenresButton tracks={tracks} onTracksUpdate={onTracksUpdate} />
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
```

- [ ] **Step 3: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds.

- [ ] **Step 4: Manual smoke test (with key)**

Add to `.env.local`:

```
VITE_LASTFM_API_KEY=<your-lastfm-api-key>
```

(Get a free key from https://www.last.fm/api/account/create.)

```bash
npm run dev
```

Open the app, log in, organize a small library. Confirm:
- "Fill missing genres" button appears next to Copy link
- Clicking shows progress as `Cancel (X/Y)`
- After completion, toast shows filled / unknown counts
- The `(no genre)` chart slice shrinks
- Button shows "Filled N ✓" then returns to idle

Without a key (remove from `.env.local` and restart): button is disabled with tooltip.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/features/organize/OrganizeScreen.tsx
git commit -m "feat(genre): wire fill genres button into organize screen"
```

---

## Task 9: Mark inferred-only values in FilterChip

**Files:**
- Modify: `src/features/organize/FilterChip.tsx`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Compute inferred-only values in OrganizeScreen**

Edit `src/features/organize/OrganizeScreen.tsx`. Add a memoized set of genre values that exist only in `inferredGenres` (not present in any track's `genres`):

Place this `useMemo` next to the existing `selection` `useMemo`:

```tsx
  const inferredOnlyGenres = useMemo(() => {
    const real = new Set<string>()
    const inferred = new Set<string>()
    for (const t of tracks) {
      for (const g of t.genres) real.add(g)
      for (const g of t.inferredGenres) inferred.add(g)
    }
    const out = new Set<string>()
    for (const g of inferred) if (!real.has(g)) out.add(g)
    return out
  }, [tracks])
```

Pass it to each `<FilterChip>`. Replace the chip render:

```tsx
          {state.filters.map((f) => (
            <FilterChip
              key={f.kind}
              filter={f}
              inferredOnlyValues={f.kind === 'genre' ? inferredOnlyGenres : EMPTY_SET}
              onSetMode={(kind, mode) => setState((p) => setMode(p, kind, mode))}
              onRemoveValue={(kind, v) => setState((p) => removeValue(p, kind, v))}
              onRemove={onRemoveFilter}
            />
          ))}
```

Add the `EMPTY_SET` constant near the top of the file (after the imports):

```tsx
const EMPTY_SET: ReadonlySet<string> = new Set()
```

- [ ] **Step 2: Render marker in FilterChip**

Edit `src/features/organize/FilterChip.tsx`.

Update the props type:

```tsx
type Props = {
  filter: Filter
  inferredOnlyValues: ReadonlySet<string>
  onSetMode: (kind: FilterKind, mode: FilterMode) => void
  onRemoveValue: (kind: FilterKind, value: string) => void
  onRemove: (kind: FilterKind) => void
}
```

Update the function signature:

```tsx
export function FilterChip({ filter, inferredOnlyValues, onSetMode, onRemoveValue, onRemove }: Props) {
```

Replace the `summary` calculation to append a marker when the chip's *displayed* values include any inferred-only:

```tsx
  const head = filter.values.slice(0, VISIBLE_VALUES).join(', ')
  const overflow = filter.values.length - VISIBLE_VALUES
  const summary = overflow > 0 ? `${head}, +${overflow}` : head
  const hasInferred = filter.values.some((v) => inferredOnlyValues.has(v))
  const sep = filter.mode === 'exclude' ? ' ≠ ' : ': '
  const variant = filter.mode === 'exclude' ? 'destructive' : 'secondary'
```

Update the chip badge rendering to show the marker:

```tsx
        <PopoverTrigger asChild>
          <Badge variant={variant} className="cursor-pointer rounded-r-none">
            {filter.kind}
            {sep}
            {summary}
            {hasInferred && <span className="ml-1" title="Includes inferred values">✨</span>}
          </Badge>
        </PopoverTrigger>
```

In the popover value list, mark each inferred-only value:

```tsx
        <ul className="max-h-48 space-y-1 overflow-auto">
          {filter.values.map((v) => (
            <li key={v} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">
                {v}
                {inferredOnlyValues.has(v) && (
                  <span className="ml-1" title="Inferred from Last.fm">✨</span>
                )}
              </span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onRemoveValue(filter.kind, v)}
                aria-label={`Remove value ${v}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
```

- [ ] **Step 3: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

After running inference, click on a chart bar for a genre that came purely from Last.fm (one that didn't appear in Spotify-side data). Confirm the resulting filter chip has a ✨ marker.

- [ ] **Step 5: Commit**

```bash
git add src/features/organize/FilterChip.tsx src/features/organize/OrganizeScreen.tsx
git commit -m "feat(genre): mark inferred-only values in filter chips"
```

---

## Task 10: Stripe pattern for inferred chart contributions

**Files:**
- Modify: `src/domain/bucketing.ts`
- Modify: `src/features/organize/Charts.tsx`

- [ ] **Step 1: Extend `bucketByGenre` to expose inferred-only count per bucket**

Edit `src/domain/bucketing.ts`. Replace the `Bucket` type and `bucketByGenre`:

```ts
export type Bucket = { label: string; count: number; inferredOnly?: number }

export function bucketByGenre(tracks: Track[], topN = 15): Bucket[] {
  const total = new Map<string, number>()
  const inferredOnly = new Map<string, number>()
  for (const t of tracks) {
    const real = t.genres
    const inferred = t.inferredGenres
    if (real.length === 0 && inferred.length === 0) {
      total.set('(no genre)', (total.get('(no genre)') ?? 0) + 1)
      continue
    }
    const seen = new Set<string>()
    for (const g of real) {
      if (seen.has(g)) continue
      seen.add(g)
      total.set(g, (total.get(g) ?? 0) + 1)
    }
    for (const g of inferred) {
      if (seen.has(g)) continue
      seen.add(g)
      total.set(g, (total.get(g) ?? 0) + 1)
      if (real.length === 0) {
        inferredOnly.set(g, (inferredOnly.get(g) ?? 0) + 1)
      }
    }
  }
  const sorted = Array.from(total.entries()).sort((a, b) => b[1] - a[1])
  const top: Bucket[] = sorted.slice(0, topN).map(([label, count]) => ({
    label,
    count,
    inferredOnly: inferredOnly.get(label) ?? 0,
  }))
  const restCount = sorted.slice(topN).reduce((sum, [, c]) => sum + c, 0)
  const restInferred = sorted.slice(topN).reduce(
    (sum, [label]) => sum + (inferredOnly.get(label) ?? 0),
    0
  )
  if (restCount > 0) top.push({ label: 'other', count: restCount, inferredOnly: restInferred })
  return top
}
```

- [ ] **Step 2: Render striped pattern in Charts**

Edit `src/features/organize/Charts.tsx`.

Update imports:

```tsx
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
```

Update the `Row` type to carry an inferred-ratio:

```tsx
type Row = { label: string; total: number; matched: number; fill: string; inferredRatio: number }
```

Update `withFills` to accept and pass through `inferredOnly`:

```tsx
function withFills(
  rows: { label: string; total: number; matched: number; inferredOnly?: number }[],
  selected: string[],
  baseFor: (r: { label: string }, i: number) => string
): Row[] {
  return rows.map((r, i) => {
    const base = baseFor(r, i)
    const fill = selected.length === 0 || selected.includes(r.label) ? base : UNSELECTED_FILL
    const inferredRatio = r.total > 0 ? Math.min(1, (r.inferredOnly ?? 0) / r.total) : 0
    return { ...r, fill, inferredRatio }
  })
}
```

Update `mergeGenreCounts` so the rows it returns include `inferredOnly`. Replace the function:

```tsx
function mergeGenreCounts(
  buckets: Bucket[],
  filtered: Track[]
): { label: string; total: number; matched: number; inferredOnly?: number }[] {
  const topLabels = new Set(
    buckets.map((b) => b.label).filter((l) => l !== 'other' && l !== '(no genre)')
  )
  const hasOther = buckets.some((b) => b.label === 'other')
  const matchedByLabel = new Map<string, number>()
  for (const t of filtered) {
    const merged = unionForChart(t)
    if (merged.length === 0) {
      matchedByLabel.set('(no genre)', (matchedByLabel.get('(no genre)') ?? 0) + 1)
      continue
    }
    let anyTop = false
    for (const g of merged) {
      if (topLabels.has(g)) {
        matchedByLabel.set(g, (matchedByLabel.get(g) ?? 0) + 1)
        anyTop = true
      }
    }
    if (!anyTop && hasOther) {
      matchedByLabel.set('other', (matchedByLabel.get('other') ?? 0) + 1)
    }
  }
  return buckets.map((b) => ({
    label: b.label,
    total: b.count,
    matched: matchedByLabel.get(b.label) ?? 0,
    inferredOnly: b.inferredOnly,
  }))
}

function unionForChart(t: Track): string[] {
  if (t.inferredGenres.length === 0) return t.genres
  if (t.genres.length === 0) return t.inferredGenres
  return Array.from(new Set([...t.genres, ...t.inferredGenres]))
}
```

Add a `Bucket` import at the top:

```tsx
import {
  bucketByDecade,
  bucketByDuration,
  bucketByGenre,
  bucketByPopularity,
  decadeForYear,
  durationBucketLabel,
  popularityBucketLabel,
  type Bucket,
} from '@/domain/bucketing'
```

Add a constant SVG `<defs>` for the stripe pattern at the top of the `Charts` return JSX, replacing the existing top wrapper. The simplest way: render a hidden `<svg>` once with the pattern definition that all charts can reference by `url(#oym-stripe)`:

Replace `return (` block opening:

```tsx
  return (
    <div className="grid grid-cols-1 gap-6">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <pattern
            id="oym-stripe"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="currentColor" opacity="0.0" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="2" strokeOpacity="0.55" />
          </pattern>
        </defs>
      </svg>
```

Replace each `<Bar dataKey="total" ... />` for the genres chart with one that renders Cells, conditionally striped:

```tsx
      <ChartCard title="Top genres">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={genreRows} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" />
            <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={tooltipFormatter} />
            <Bar
              dataKey="total"
              cursor="pointer"
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => onToggle('genre', (d as Row).label)}
            >
              {genreRows.map((row, i) => (
                <Cell
                  key={`g-${i}`}
                  fill={row.inferredRatio >= 0.5 ? 'url(#oym-stripe)' : row.fill}
                  stroke={row.inferredRatio >= 0.5 ? row.fill : undefined}
                  strokeWidth={row.inferredRatio >= 0.5 ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
```

(Threshold of 0.5: a bar is striped if at least half of its tracks contributed via inference. This avoids decoration noise for buckets that are mostly Spotify-sourced.)

- [ ] **Step 3: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Run inference, then verify in DevTools that bars whose underlying bucket is mostly inferred (e.g., a genre that appeared only after Last.fm tagging) render with diagonal stripes. Bars dominated by Spotify-sourced data render solid as before.

- [ ] **Step 5: Commit**

```bash
git add src/domain/bucketing.ts src/features/organize/Charts.tsx
git commit -m "feat(genre): mark inferred contributions in charts"
```

---

## Task 11: Add `VITE_LASTFM_API_KEY` to deploy workflow and docs

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Pass the secret to the build step**

Edit `.github/workflows/deploy.yml`. Replace the existing build run:

```yaml
      - run: npm run build
        env:
          VITE_SPOTIFY_CLIENT_ID: ${{ secrets.VITE_SPOTIFY_CLIENT_ID }}
```

with:

```yaml
      - run: npm run build
        env:
          VITE_SPOTIFY_CLIENT_ID: ${{ secrets.VITE_SPOTIFY_CLIENT_ID }}
          VITE_LASTFM_API_KEY: ${{ secrets.VITE_LASTFM_API_KEY }}
```

- [ ] **Step 2: Add the placeholder to `.env.example`**

Edit `.env.example` to:

```
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
VITE_LASTFM_API_KEY=your_lastfm_api_key_here
```

- [ ] **Step 3: Add the GitHub repo secret (manual operator step)**

In a browser, go to the repo Settings → Secrets and variables → Actions → New repository secret. Name `VITE_LASTFM_API_KEY`, value = a free Last.fm API key from https://www.last.fm/api/account/create. This step is performed by the human operator, not automated.

- [ ] **Step 4: Document in README**

Edit `README.md`. Replace the "Local development" section (the block from `## Local development` through the dev-server URL paragraph) with:

````markdown
## Local development

```bash
cp .env.example .env.local
# put your Spotify client_id in .env.local
# (optional) put your Last.fm api key for the "Fill missing genres" feature
npm install
npm run dev
```

The dev server runs on `http://127.0.0.1:8000/OrganizeYourMusic/`. Register that URL (with trailing slash) as a Redirect URI in the Spotify Developer Dashboard.

`VITE_LASTFM_API_KEY` is optional. When present, the organize screen exposes a **Fill missing genres** button that uses [Last.fm](https://www.last.fm/api/account/create) to infer genres for tracks Spotify left untagged. Without the key the button is disabled.
````

- [ ] **Step 5: Document in CLAUDE.md**

Edit `CLAUDE.md`. In the "Critical gotchas" section, after gotcha 5 (the `min-w-0` paragraph), append:

```
**6. `VITE_LASTFM_API_KEY` is optional but gates the Fill-missing-genres feature.**
The button reads `import.meta.env.VITE_LASTFM_API_KEY` at mount; if absent, it
renders disabled. Free key from https://www.last.fm/api/account/create. Repo
secret of the same name is consumed by `.github/workflows/deploy.yml`.
```

- [ ] **Step 6: Verify build and lint**

```bash
npm run build && npm run lint
```

Expected: succeeds (no source code changes).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy.yml .env.example README.md CLAUDE.md
git commit -m "chore(genre): wire VITE_LASTFM_API_KEY in deploy workflow and docs"
```

- [ ] **Step 8: Final smoke test against deployed environment**

After pushing to `master`, the GH Pages deploy workflow runs. Confirm:
- Workflow logs show `VITE_LASTFM_API_KEY` is present (not blank) in the Build step env.
- On the deployed site (https://odidukh.github.io/OrganizeYourMusic/), the Fill missing genres button is enabled.
- A run on a real library produces inferred genres and the toast / chart / chip markers behave as designed.
