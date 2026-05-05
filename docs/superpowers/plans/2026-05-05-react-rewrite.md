# Organize Your Music — React Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the React/TS rewrite of Organize Your Music to feature parity with the legacy jQuery app (minus dead audio-features endpoints), then delete the legacy app and deploy to GitHub Pages.

**Architecture:** Single-page app driven by a discriminated-union state machine in `App.tsx`. PKCE auth, TanStack Query for server state, pure-function `domain/` layer for normalization & bucketing, feature folders for screens. No backend, no tests in this iteration (deferred per spec).

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, Recharts, `@tanstack/react-virtual`. Authorization Code + PKCE for Spotify auth.

**Spec:** `docs/superpowers/specs/2026-05-05-react-rewrite-design.md`

**Note on TDD:** Per Q9D in the spec, automated tests are explicitly out of scope for this iteration. Each task ends with a manual verification step (browser smoke test or `npm run build` type check) and a commit. Pure-function modules in `domain/` are written test-ready (small, no side effects) so tests can be retrofitted later without restructuring.

---

## Prerequisites

Before starting Task 1, the engineer should have:

- A Spotify Developer Dashboard account at https://developer.spotify.com/dashboard
- A registered Spotify app with client_id known
- Both these redirect URIs registered on the app (trailing slash matters):
  - `http://localhost:8000/`
  - `https://<github-username>.github.io/OrganizeYourMusic/`
- Node 18+, npm
- Repository cloned, on `master`, working tree clean

## File Structure (target end state)

```
src/
  App.tsx                                — state machine switch
  main.tsx                               — unchanged
  index.css                              — unchanged
  state/appState.ts                      — discriminated union
  auth/pkce.ts                           — code_verifier + challenge generation
  auth/spotifyAuth.ts                    — login redirect, token exchange, refresh
  auth/useAuth.ts                        — auth hook (token, login, logout)
  api/spotifyClient.ts                   — fetch wrapper with bearer + 401 refresh + 429 retry
  api/pagination.ts                      — paginate-with-concurrency-cap helper
  api/queries.ts                         — TanStack Query hooks
  domain/track.ts                        — Track type + normalizers
  domain/bucketing.ts                    — decade/genre/duration/popularity bucketing
  domain/sources.ts                      — fetch strategy per Source
  features/login/LoginScreen.tsx
  features/pick/PickerScreen.tsx
  features/loading/LoadingScreen.tsx
  features/organize/OrganizeScreen.tsx
  features/organize/TrackTable.tsx
  features/organize/Charts.tsx
  features/organize/SavePlaylistDialog.tsx
  components/ui/                         — shadcn (existing + added avatar, dialog, label,
                                                       progress, badge, sonner)
  lib/utils.ts                           — unchanged

.env.example                             — VITE_SPOTIFY_CLIENT_ID
.github/workflows/deploy.yml             — GH Pages deploy
vite.config.ts                           — adds base path
README.md                                — rewritten
```

Files deleted by the end:
- `src/components/Hero.tsx`
- `src/config.js`
- `src/utils/SpotifyApiContext.ts`
- `src/utils/__tests__/` (whole directory)
- `web/` (whole directory)

---

## Phase 1 — Foundation

### Task 1: Install dependencies and configure environment

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Create: `.env.local` (gitignored — your real client_id goes here)
- Modify: `vite.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Install runtime deps**

```bash
npm install @tanstack/react-query @tanstack/react-virtual recharts
```

- [ ] **Step 2: Add shadcn components needed for the rewrite**

```bash
npx shadcn@latest add avatar dialog label progress badge sonner
```

If the CLI reports it's already configured for the project, it will only add what's missing. Files land in `src/components/ui/`.

- [ ] **Step 3: Create `.env.example`**

Create `.env.example` with this exact content:

```
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

- [ ] **Step 4: Create `.env.local` for development**

Replace the placeholder with your actual client_id from the Spotify dashboard:

```
VITE_SPOTIFY_CLIENT_ID=93dfb03d667f400eb8aa335d60f85bc5
```

(That id from `src/config.js` is a starting point; if you control a different app, use its id.)

- [ ] **Step 5: Verify `.env.local` is gitignored**

Run: `grep -E '^\.env\.local$|^\.env\*' .gitignore`

Expected: a line matching `.env.local` or `.env*`. If neither matches, append `.env.local` to `.gitignore`.

- [ ] **Step 6: Update `vite.config.ts` with base path and dev port**

Replace `vite.config.ts` contents with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/OrganizeYourMusic/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8000,
  },
})
```

- [ ] **Step 7: Verify build still passes**

Run: `npm run build`
Expected: build completes with no errors. The existing `Hero.tsx` still renders (no UI changes yet).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore vite.config.ts src/components/ui/
git commit -m "chore: install rewrite deps and configure base path"
```

---

### Task 2: PKCE helpers

**Files:**
- Create: `src/auth/pkce.ts`

- [ ] **Step 1: Create `src/auth/pkce.ts`**

```ts
// PKCE per RFC 7636 with S256 challenge method.
// All output uses base64url encoding (no padding).

const VERIFIER_LENGTH = 64

function base64UrlEncode(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let str = ''
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(VERIFIER_LENGTH)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes.buffer)
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit` (or `npm run build`)
Expected: no errors.

- [ ] **Step 3: Quick browser sanity check**

Open `npm run dev`, in the browser console paste:

```js
const { generateCodeVerifier, deriveCodeChallenge } = await import('/src/auth/pkce.ts')
const v = generateCodeVerifier()
const c = await deriveCodeChallenge(v)
console.log({ v, c, vLen: v.length, cLen: c.length })
```

Expected: `v.length` ≈ 86 chars; `c.length` = 43 chars; both base64url-safe (no `+` `/` `=`).

- [ ] **Step 4: Commit**

```bash
git add src/auth/pkce.ts
git commit -m "feat(auth): add PKCE code verifier + challenge helpers"
```

---

### Task 3: Spotify auth module (login redirect, token exchange, refresh)

**Files:**
- Create: `src/auth/spotifyAuth.ts`

- [ ] **Step 1: Create `src/auth/spotifyAuth.ts`**

```ts
import { generateCodeVerifier, deriveCodeChallenge } from './pkce'

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'

const SCOPES = [
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ')

const VERIFIER_KEY = 'oym_pkce_verifier'
const REFRESH_KEY = 'oym_refresh_token'

export type TokenSet = {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

function clientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (!id) throw new Error('VITE_SPOTIFY_CLIENT_ID is not set')
  return id
}

function redirectUri(): string {
  return window.location.origin + window.location.pathname
}

export async function beginLoginRedirect(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await deriveCodeChallenge(verifier)
  localStorage.setItem(VERIFIER_KEY, verifier)

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('scope', SCOPES)

  window.location.assign(url.toString())
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const verifier = localStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Missing PKCE verifier; please log in again.')

  const body = new URLSearchParams({
    client_id: clientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  localStorage.removeItem(VERIFIER_KEY)
  const tokens: TokenSet = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  saveRefreshToken(tokens.refreshToken)
  return tokens
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: clientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Refresh failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  // Spotify rotates refresh tokens; keep the new one if returned.
  const newRefresh = json.refresh_token ?? refreshToken
  saveRefreshToken(newRefresh)
  return {
    accessToken: json.access_token,
    refreshToken: newRefresh,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
}

export function loadRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function saveRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token)
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_KEY)
}

export function stripCodeFromUrl(): void {
  const url = new URL(window.location.href)
  url.searchParams.delete('code')
  url.searchParams.delete('state')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth/spotifyAuth.ts
git commit -m "feat(auth): add PKCE login + token exchange + refresh"
```

---

### Task 4: Spotify API client (fetch wrapper)

**Files:**
- Create: `src/api/spotifyClient.ts`

- [ ] **Step 1: Create `src/api/spotifyClient.ts`**

```ts
import { refreshAccessToken, clearRefreshToken, loadRefreshToken } from '@/auth/spotifyAuth'

export class SpotifyError extends Error {
  status: number
  retryable: boolean
  constructor(message: string, status: number, retryable: boolean) {
    super(message)
    this.name = 'SpotifyError'
    this.status = status
    this.retryable = retryable
  }
}

type ClientState = {
  accessToken: string | null
  // Promise to dedupe concurrent refreshes
  refreshing: Promise<string> | null
  onUnauth: (() => void) | null
}

const state: ClientState = {
  accessToken: null,
  refreshing: null,
  onUnauth: null,
}

export function setAccessToken(token: string | null): void {
  state.accessToken = token
}

export function getAccessToken(): string | null {
  return state.accessToken
}

export function setOnUnauthCallback(cb: () => void): void {
  state.onUnauth = cb
}

async function ensureFreshToken(): Promise<string> {
  if (state.accessToken) return state.accessToken
  if (state.refreshing) return state.refreshing

  const refresh = loadRefreshToken()
  if (!refresh) throw new SpotifyError('Not authenticated', 401, false)

  state.refreshing = refreshAccessToken(refresh)
    .then((tokens) => {
      state.accessToken = tokens.accessToken
      return tokens.accessToken
    })
    .catch((err) => {
      clearRefreshToken()
      state.accessToken = null
      state.onUnauth?.()
      throw err
    })
    .finally(() => {
      state.refreshing = null
    })
  return state.refreshing
}

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

const SPOTIFY_BASE = 'https://api.spotify.com/v1'

export async function spotifyFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  return spotifyFetchInternal<T>(path, opts, /*isRetry*/ false)
}

async function spotifyFetchInternal<T>(
  path: string,
  opts: RequestOpts,
  isRetry: boolean
): Promise<T> {
  const token = await ensureFreshToken()
  const url = path.startsWith('http') ? path : SPOTIFY_BASE + path

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (res.status === 204) return undefined as unknown as T

  if (res.status === 401 && !isRetry) {
    state.accessToken = null
    return spotifyFetchInternal<T>(path, opts, true)
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '1')
    await sleep(retryAfter * 1000)
    return spotifyFetchInternal<T>(path, opts, isRetry)
  }

  if (!res.ok) {
    const retryable = res.status >= 500
    const text = await res.text().catch(() => '')
    throw new SpotifyError(
      `Spotify ${res.status}${text ? `: ${text}` : ''}`,
      res.status,
      retryable
    )
  }

  return (await res.json()) as T
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/spotifyClient.ts
git commit -m "feat(api): add Spotify fetch wrapper with 401 refresh and 429 retry"
```

---

### Task 5: Pagination helper

**Files:**
- Create: `src/api/pagination.ts`

- [ ] **Step 1: Create `src/api/pagination.ts`**

```ts
import { spotifyFetch } from './spotifyClient'

type PageRequest = { offset: number; limit: number }

type Page<T> = {
  items: T[]
  total: number
  next: string | null
}

const CONCURRENCY = 5
export const HARD_TRACK_CAP = 5000

export type ProgressUpdate = { fetched: number; total: number }

/**
 * Paginate a Spotify endpoint that returns { items, total, next, offset, limit }.
 * Calls onProgress after each page completes.
 * Stops once HARD_TRACK_CAP items have been collected.
 */
export async function paginate<T>(
  buildUrl: (req: PageRequest) => string,
  pageSize: number,
  onProgress: (p: ProgressUpdate) => void,
  signal?: AbortSignal
): Promise<{ items: T[]; truncated: boolean; reportedTotal: number }> {
  const firstUrl = buildUrl({ offset: 0, limit: pageSize })
  const first = await spotifyFetch<Page<T>>(firstUrl, { signal })

  const reportedTotal = first.total
  const totalToFetch = Math.min(reportedTotal, HARD_TRACK_CAP)
  let collected: T[] = [...first.items]

  onProgress({ fetched: collected.length, total: totalToFetch })

  if (collected.length >= totalToFetch) {
    return {
      items: collected.slice(0, HARD_TRACK_CAP),
      truncated: reportedTotal > HARD_TRACK_CAP,
      reportedTotal,
    }
  }

  const offsets: number[] = []
  for (let off = pageSize; off < totalToFetch; off += pageSize) offsets.push(off)

  // Concurrent worker pool with cap
  const results: T[][] = new Array(offsets.length)
  let nextIdx = 0

  async function worker() {
    while (true) {
      if (signal?.aborted) return
      const idx = nextIdx++
      if (idx >= offsets.length) return
      const url = buildUrl({ offset: offsets[idx], limit: pageSize })
      const page = await spotifyFetch<Page<T>>(url, { signal })
      results[idx] = page.items
      collected = collected.concat(page.items)
      onProgress({ fetched: Math.min(collected.length, totalToFetch), total: totalToFetch })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, worker)
  await Promise.all(workers)

  const all = first.items.concat(...results.filter(Boolean))
  return {
    items: all.slice(0, HARD_TRACK_CAP),
    truncated: reportedTotal > HARD_TRACK_CAP,
    reportedTotal,
  }
}

/** Batch a list of ids into requests of `batchSize`, run with concurrency cap. */
export async function batchedFetch<TItem, TResult>(
  ids: string[],
  batchSize: number,
  fetchBatch: (chunk: string[]) => Promise<TResult>,
  onProgress: (p: ProgressUpdate) => void,
  signal?: AbortSignal
): Promise<TResult[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += batchSize) chunks.push(ids.slice(i, i + batchSize))

  const results: TResult[] = new Array(chunks.length)
  let nextIdx = 0
  let done = 0

  onProgress({ fetched: 0, total: chunks.length })

  async function worker() {
    while (true) {
      if (signal?.aborted) return
      const idx = nextIdx++
      if (idx >= chunks.length) return
      const r = await fetchBatch(chunks[idx])
      results[idx] = r
      done++
      onProgress({ fetched: done, total: chunks.length })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker)
  await Promise.all(workers)
  return results
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/pagination.ts
git commit -m "feat(api): add pagination + batched fetch with concurrency cap"
```

---

### Task 6: Track domain type and normalizer

**Files:**
- Create: `src/domain/track.ts`

- [ ] **Step 1: Create `src/domain/track.ts`**

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
  return {
    id: raw.id,
    uri: raw.uri,
    name: raw.name,
    artistNames: raw.artists.map((a) => a.name),
    artistIds: raw.artists.map((a) => a.id),
    album: {
      name: raw.album.name,
      releaseDate: raw.album.release_date,
      releaseYear: parseReleaseYear(raw.album.release_date),
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
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/track.ts
git commit -m "feat(domain): add Track type and normalizers"
```

---

### Task 7: Bucketing functions

**Files:**
- Create: `src/domain/bucketing.ts`

- [ ] **Step 1: Create `src/domain/bucketing.ts`**

```ts
import type { Track } from './track'

export type Bucket = { label: string; count: number }

const DECADES = [1960, 1970, 1980, 1990, 2000, 2010, 2020] as const

export function bucketByDecade(tracks: Track[]): Bucket[] {
  const counts = new Map<string, number>()
  for (const d of DECADES) counts.set(`${d}s`, 0)
  counts.set('Unknown', 0)

  for (const t of tracks) {
    const y = t.album.releaseYear
    if (!y) {
      counts.set('Unknown', (counts.get('Unknown') ?? 0) + 1)
      continue
    }
    const decade = Math.floor(y / 10) * 10
    const label = `${decade}s`
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c > 0)
    .map(([label, count]) => ({ label, count }))
}

export function decadeForYear(y: number): string {
  if (!y) return 'Unknown'
  return `${Math.floor(y / 10) * 10}s`
}

export function bucketByGenre(tracks: Track[], topN = 15): Bucket[] {
  const counts = new Map<string, number>()
  for (const t of tracks) {
    if (t.genres.length === 0) {
      counts.set('(no genre)', (counts.get('(no genre)') ?? 0) + 1)
      continue
    }
    for (const g of t.genres) {
      counts.set(g, (counts.get(g) ?? 0) + 1)
    }
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, topN).map(([label, count]) => ({ label, count }))
  const rest = sorted.slice(topN).reduce((sum, [, c]) => sum + c, 0)
  if (rest > 0) top.push({ label: 'other', count: rest })
  return top
}

const DURATION_BUCKETS: { label: string; minSec: number; maxSec: number }[] = [
  { label: '<2min', minSec: 0, maxSec: 120 },
  { label: '2–3 min', minSec: 120, maxSec: 180 },
  { label: '3–4 min', minSec: 180, maxSec: 240 },
  { label: '4–5 min', minSec: 240, maxSec: 300 },
  { label: '5–7 min', minSec: 300, maxSec: 420 },
  { label: '7+ min', minSec: 420, maxSec: Number.POSITIVE_INFINITY },
]

export function durationBucketLabel(durationMs: number): string {
  const sec = durationMs / 1000
  for (const b of DURATION_BUCKETS) {
    if (sec >= b.minSec && sec < b.maxSec) return b.label
  }
  return DURATION_BUCKETS[DURATION_BUCKETS.length - 1].label
}

export function bucketByDuration(tracks: Track[]): Bucket[] {
  const counts = new Map<string, number>(DURATION_BUCKETS.map((b) => [b.label, 0]))
  for (const t of tracks) {
    const label = durationBucketLabel(t.durationMs)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }))
}

export function popularityBucketLabel(popularity: number): string {
  const lo = Math.min(90, Math.floor(popularity / 10) * 10)
  const hi = lo === 90 ? 100 : lo + 9
  return `${lo}-${hi}`
}

export function bucketByPopularity(tracks: Track[]): Bucket[] {
  const counts = new Map<string, number>()
  for (let lo = 0; lo <= 90; lo += 10) {
    const label = lo === 90 ? '90-100' : `${lo}-${lo + 9}`
    counts.set(label, 0)
  }
  for (const t of tracks) {
    const label = popularityBucketLabel(t.popularity)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }))
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/bucketing.ts
git commit -m "feat(domain): add bucketing functions for decade/genre/duration/popularity"
```

---

### Task 8: Source fetch strategies

**Files:**
- Create: `src/domain/sources.ts`

- [ ] **Step 1: Create `src/domain/sources.ts`**

```ts
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
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/sources.ts
git commit -m "feat(domain): add Source type and per-source fetch strategies"
```

---

### Task 9: AppState discriminated union

**Files:**
- Create: `src/state/appState.ts`

- [ ] **Step 1: Create `src/state/appState.ts`**

```ts
import type { Source, ProgressEvent } from '@/domain/sources'
import type { Track } from '@/domain/track'

export type SpotifyUser = {
  id: string
  display_name: string | null
  images?: { url: string }[]
}

export type AppState =
  | { kind: 'unauth' }
  | { kind: 'authCallback'; code: string }
  | { kind: 'picking'; user: SpotifyUser }
  | { kind: 'loading'; source: Source; user: SpotifyUser; progress: ProgressEvent; abort: AbortController }
  | { kind: 'organizing'; source: Source; user: SpotifyUser; tracks: Track[]; truncated: boolean }
  | { kind: 'savingPlaylist'; source: Source; user: SpotifyUser; tracks: Track[]; truncated: boolean }
  | { kind: 'error'; message: string; retry?: () => void }

export type StateSetter = (s: AppState) => void
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/state/appState.ts
git commit -m "feat(state): add AppState discriminated union"
```

---

### Task 10: useAuth hook

**Files:**
- Create: `src/auth/useAuth.ts`

- [ ] **Step 1: Create `src/auth/useAuth.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'
import {
  beginLoginRedirect,
  clearRefreshToken,
  exchangeCodeForTokens,
  loadRefreshToken,
  refreshAccessToken,
  stripCodeFromUrl,
} from './spotifyAuth'
import { setAccessToken, setOnUnauthCallback } from '@/api/spotifyClient'

type AuthStatus =
  | { kind: 'idle' }
  | { kind: 'authenticating' } // waiting for token exchange
  | { kind: 'authenticated' }
  | { kind: 'unauth' }
  | { kind: 'error'; message: string }

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>({ kind: 'idle' })

  const handleUnauth = useCallback(() => {
    setStatus({ kind: 'unauth' })
  }, [])

  useEffect(() => {
    setOnUnauthCallback(handleUnauth)
  }, [handleUnauth])

  // On mount: check URL for ?code=, otherwise try refresh from localStorage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      stripCodeFromUrl()
      setStatus({ kind: 'error', message: `Spotify login was cancelled (${error}).` })
      return
    }

    if (code) {
      setStatus({ kind: 'authenticating' })
      exchangeCodeForTokens(code)
        .then((tokens) => {
          setAccessToken(tokens.accessToken)
          stripCodeFromUrl()
          setStatus({ kind: 'authenticated' })
        })
        .catch((err) => {
          stripCodeFromUrl()
          setStatus({ kind: 'error', message: err.message ?? 'Login failed.' })
        })
      return
    }

    const refresh = loadRefreshToken()
    if (refresh) {
      refreshAccessToken(refresh)
        .then((tokens) => {
          setAccessToken(tokens.accessToken)
          setStatus({ kind: 'authenticated' })
        })
        .catch(() => {
          clearRefreshToken()
          setStatus({ kind: 'unauth' })
        })
      return
    }

    setStatus({ kind: 'unauth' })
  }, [])

  const login = useCallback(() => {
    beginLoginRedirect().catch((err) =>
      setStatus({ kind: 'error', message: err.message ?? 'Could not start login.' })
    )
  }, [])

  const logout = useCallback(() => {
    clearRefreshToken()
    setAccessToken(null)
    setStatus({ kind: 'unauth' })
  }, [])

  return { status, login, logout }
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/auth/useAuth.ts
git commit -m "feat(auth): add useAuth hook handling callback + refresh on mount"
```

---

### Task 11: TanStack Query setup + user query

**Files:**
- Modify: `src/main.tsx`
- Create: `src/api/queries.ts`

- [ ] **Step 1: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, err: any) => {
        const retryable = err?.retryable === true
        return retryable && failureCount < 3
      },
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Create `src/api/queries.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { spotifyFetch } from './spotifyClient'
import type { SpotifyUser } from '@/state/appState'

export function useCurrentUser(enabled: boolean) {
  return useQuery<SpotifyUser>({
    queryKey: ['me'],
    queryFn: () => spotifyFetch<SpotifyUser>('/me'),
    enabled,
  })
}
```

- [ ] **Step 3: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors. App still renders the existing Hero.tsx.

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx src/api/queries.ts
git commit -m "feat(api): wire TanStack Query and add useCurrentUser hook"
```

---

## Phase 2 — New auth + picker UI

### Task 12: LoginScreen

**Files:**
- Create: `src/features/login/LoginScreen.tsx`

- [ ] **Step 1: Create `src/features/login/LoginScreen.tsx`**

```tsx
import { Button } from '@/components/ui/button'

type Props = {
  onLogin: () => void
  errorBanner?: string | null
}

export function LoginScreen({ onLogin, errorBanner }: Props) {
  return (
    <div className="container px-4 py-16 mx-auto max-w-2xl">
      <h1 className="mb-4 text-4xl font-bold">Organize Your Music</h1>
      <p className="mb-8 text-muted-foreground">
        Organize your Spotify music collection by decade, genre, duration, popularity, and more.
        Then save any filtered view as a new Spotify playlist.
      </p>
      {errorBanner && (
        <div className="mb-6 rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {errorBanner}
        </div>
      )}
      <Button size="lg" onClick={onLogin}>
        Log in with Spotify
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/login/LoginScreen.tsx
git commit -m "feat(login): add LoginScreen component"
```

---

### Task 13: PickerScreen

**Files:**
- Create: `src/features/pick/PickerScreen.tsx`

- [ ] **Step 1: Create `src/features/pick/PickerScreen.tsx`**

```tsx
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SpotifyUser } from '@/state/appState'
import { parsePlaylistInput, type Source } from '@/domain/sources'

type CollectionType = 'saved' | 'added' | 'follow' | 'all' | 'playlist'

type Props = {
  user: SpotifyUser
  onOrganize: (source: Source) => void
  onLogout: () => void
}

export function PickerScreen({ user, onOrganize, onLogout }: Props) {
  const [collectionType, setCollectionType] = useState<CollectionType>('saved')
  const [playlistInput, setPlaylistInput] = useState('')
  const [playlistError, setPlaylistError] = useState<string | null>(null)

  function handleOrganize() {
    if (collectionType === 'playlist') {
      const id = parsePlaylistInput(playlistInput)
      if (!id) {
        setPlaylistError("Could not parse a playlist URL, URI, or ID. Try again.")
        return
      }
      onOrganize({ type: 'playlist', id })
      return
    }
    onOrganize({ type: collectionType })
  }

  return (
    <div className="container px-4 py-16 mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src={user.images?.[0]?.url} alt={user.display_name ?? 'User'} />
            <AvatarFallback>{user.display_name?.[0] ?? 'U'}</AvatarFallback>
          </Avatar>
          <span className="text-lg font-semibold">Welcome, {user.display_name ?? 'friend'}</span>
        </div>
        <Button variant="ghost" onClick={onLogout}>Log out</Button>
      </div>

      <h1 className="mb-4 text-4xl font-bold">Organize Your Music</h1>

      <div>
        <Label htmlFor="collection-type">What do you want to organize?</Label>
        <Select value={collectionType} onValueChange={(v) => setCollectionType(v as CollectionType)}>
          <SelectTrigger id="collection-type" className="mt-2">
            <SelectValue placeholder="Select collection" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="saved">Songs you've saved to Your Music</SelectItem>
            <SelectItem value="added">Songs you've added to a playlist</SelectItem>
            <SelectItem value="follow">Songs in playlists you follow</SelectItem>
            <SelectItem value="all">All of your music</SelectItem>
            <SelectItem value="playlist">A specific playlist</SelectItem>
          </SelectContent>
        </Select>

        {collectionType === 'playlist' && (
          <div className="mt-4">
            <Label htmlFor="playlist-uri">Playlist URL, URI, or ID</Label>
            <Input
              id="playlist-uri"
              className="mt-2"
              placeholder="https://open.spotify.com/playlist/5FJXhjdILmRA2z5bvz4nzf"
              value={playlistInput}
              onChange={(e) => {
                setPlaylistInput(e.target.value)
                setPlaylistError(null)
              }}
            />
            {playlistError && <p className="mt-1 text-sm text-red-600">{playlistError}</p>}
          </div>
        )}

        <Button className="w-full mt-8" size="lg" onClick={handleOrganize}>
          Organize your music
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/pick/PickerScreen.tsx
git commit -m "feat(pick): add PickerScreen with source dropdown and playlist parser"
```

---

### Task 14: New App.tsx state machine; delete legacy

**Files:**
- Replace: `src/App.tsx`
- Delete: `src/components/Hero.tsx`
- Delete: `src/config.js`
- Delete: `src/utils/SpotifyApiContext.ts`
- Delete: `src/utils/__tests__/` (whole directory)

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { LoginScreen } from '@/features/login/LoginScreen'
import { PickerScreen } from '@/features/pick/PickerScreen'
import { useAuth } from '@/auth/useAuth'
import { useCurrentUser } from '@/api/queries'
import type { AppState } from '@/state/appState'
import type { Source } from '@/domain/sources'
import './App.css'

export default function App() {
  const { status, login, logout } = useAuth()
  const userQuery = useCurrentUser(status.kind === 'authenticated')

  const [state, setState] = useState<AppState>({ kind: 'unauth' })

  useEffect(() => {
    if (status.kind === 'authenticated' && userQuery.data) {
      setState({ kind: 'picking', user: userQuery.data })
    } else if (status.kind === 'unauth') {
      setState({ kind: 'unauth' })
    } else if (status.kind === 'error') {
      setState({ kind: 'error', message: status.message })
    }
  }, [status, userQuery.data])

  function handleOrganize(source: Source) {
    if (state.kind !== 'picking') return
    // Loading screen comes in the next task; for now stay on picker.
    console.warn('Organize requested', source)
  }

  if (state.kind === 'picking') {
    return <PickerScreen user={state.user} onOrganize={handleOrganize} onLogout={logout} />
  }

  if (state.kind === 'error') {
    return (
      <LoginScreen
        onLogin={login}
        errorBanner={state.message}
      />
    )
  }

  // unauth, authCallback, authenticating, idle — show login
  return <LoginScreen onLogin={login} />
}
```

- [ ] **Step 2: Delete legacy files**

```bash
git rm src/components/Hero.tsx src/config.js src/utils/SpotifyApiContext.ts
git rm -r src/utils/__tests__
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: build completes; no references to `Hero`, `useApiContext`, or `config.js` remain.

Spot-check with: `grep -RIn "Hero\|useApiContext\|src/config" src/ || true`
Expected: no output.

- [ ] **Step 4: Manual smoke test in dev**

Run: `npm run dev`
Open http://localhost:8000/. Expected:
- LoginScreen renders.
- Click "Log in with Spotify" → redirect to Spotify auth → after consent, redirect back.
- After redirect, PickerScreen shows your avatar + display name.
- Choose any source, click Organize → console warns "Organize requested" with the source. (Loading wired in next task.)
- Refreshing the page does not crash and (with refresh_token) skips straight back to PickerScreen.

If the redirect URI fails, double-check the Spotify dashboard has `http://localhost:8000/` registered exactly (trailing slash).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire state machine for login + picker, delete legacy Hero"
```

---

## Phase 3 — Organize screen

### Task 15: LoadingScreen with progress + cancel

**Files:**
- Create: `src/features/loading/LoadingScreen.tsx`

- [ ] **Step 1: Create `src/features/loading/LoadingScreen.tsx`**

```tsx
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
```

- [ ] **Step 2: Wire fetch into App.tsx**

Replace `src/App.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { LoginScreen } from '@/features/login/LoginScreen'
import { PickerScreen } from '@/features/pick/PickerScreen'
import { LoadingScreen } from '@/features/loading/LoadingScreen'
import { useAuth } from '@/auth/useAuth'
import { useCurrentUser } from '@/api/queries'
import type { AppState } from '@/state/appState'
import type { Source } from '@/domain/sources'
import { fetchTracksForSource } from '@/domain/sources'
import './App.css'

export default function App() {
  const { status, login, logout } = useAuth()
  const userQuery = useCurrentUser(status.kind === 'authenticated')

  const [state, setState] = useState<AppState>({ kind: 'unauth' })

  useEffect(() => {
    if (status.kind === 'authenticated' && userQuery.data) {
      setState((prev) => (prev.kind === 'unauth' || prev.kind === 'error' ? { kind: 'picking', user: userQuery.data! } : prev))
    } else if (status.kind === 'unauth') {
      setState({ kind: 'unauth' })
    } else if (status.kind === 'error') {
      setState({ kind: 'error', message: status.message })
    }
  }, [status, userQuery.data])

  function handleOrganize(source: Source) {
    if (state.kind !== 'picking') return
    const user = state.user
    const abort = new AbortController()
    setState({ kind: 'loading', source, user, abort, progress: { phase: 'tracks', fetched: 0, total: 0 } })

    fetchTracksForSource(
      source,
      user.id,
      (p) => setState((prev) => (prev.kind === 'loading' ? { ...prev, progress: p } : prev)),
      abort.signal
    )
      .then(({ tracks, truncated }) => {
        setState({ kind: 'organizing', source, user, tracks, truncated })
      })
      .catch((err) => {
        if (abort.signal.aborted) return
        setState({
          kind: 'error',
          message: err.message ?? 'Failed to fetch tracks.',
          retry: () => handleOrganize(source),
        })
      })
  }

  function handleCancel() {
    if (state.kind !== 'loading') return
    state.abort.abort()
    setState({ kind: 'picking', user: state.user })
  }

  if (state.kind === 'picking') {
    return <PickerScreen user={state.user} onOrganize={handleOrganize} onLogout={logout} />
  }

  if (state.kind === 'loading') {
    return <LoadingScreen progress={state.progress} onCancel={handleCancel} />
  }

  if (state.kind === 'organizing') {
    // Wired in Task 18.
    return (
      <div className="container px-4 py-16 mx-auto max-w-2xl">
        <h2 className="mb-4 text-2xl font-semibold">Loaded {state.tracks.length} tracks</h2>
        {state.truncated && (
          <p className="mb-4 text-sm text-amber-600">
            Showing first 5,000 tracks. Pick a smaller source for full coverage.
          </p>
        )}
        <pre className="text-xs">{JSON.stringify(state.tracks.slice(0, 3), null, 2)}</pre>
      </div>
    )
  }

  if (state.kind === 'error') {
    return <LoginScreen onLogin={state.retry ?? login} errorBanner={state.message} />
  }

  return <LoginScreen onLogin={login} />
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. Log in, pick "Saved Tracks", click Organize. Expected:
- LoadingScreen shows progress (e.g. "Fetching tracks (50/237)…").
- Phase shifts to "Loading artist genres" toward the end.
- After completion, a debug page shows track count + first 3 normalized tracks (genres populated).
- Cancel button mid-load returns to picker.

- [ ] **Step 5: Commit**

```bash
git add src/features/loading/LoadingScreen.tsx src/App.tsx
git commit -m "feat(loading): wire fetch + LoadingScreen with cancel"
```

---

### Task 16: Charts component

**Files:**
- Create: `src/features/organize/Charts.tsx`

- [ ] **Step 1: Create `src/features/organize/Charts.tsx`**

```tsx
import { useMemo } from 'react'
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
import type { Track } from '@/domain/track'
import {
  bucketByDecade,
  bucketByDuration,
  bucketByGenre,
  bucketByPopularity,
} from '@/domain/bucketing'

const PIE_COLORS = [
  '#1DB954', '#1ED760', '#5DADE2', '#F39C12', '#E74C3C',
  '#9B59B6', '#16A085', '#F1C40F', '#34495E', '#7F8C8D',
]

export type FilterKind = 'decade' | 'genre' | 'duration' | 'popularity'

type Props = {
  tracks: Track[]
  onSelect: (kind: FilterKind, label: string) => void
}

export function Charts({ tracks, onSelect }: Props) {
  const decades = useMemo(() => bucketByDecade(tracks), [tracks])
  const genres = useMemo(() => bucketByGenre(tracks, 15), [tracks])
  const durations = useMemo(() => bucketByDuration(tracks), [tracks])
  const popularity = useMemo(() => bucketByPopularity(tracks), [tracks])

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <ChartCard title="By decade">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={decades}
              dataKey="count"
              nameKey="label"
              outerRadius={80}
              label
              onClick={(d: any) => onSelect('decade', d.label)}
            >
              {decades.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} cursor="pointer" />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top genres">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={genres} layout="vertical" margin={{ left: 60 }}>
            <XAxis type="number" />
            <YAxis dataKey="label" type="category" width={120} />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#1DB954"
              cursor="pointer"
              onClick={(d: any) => onSelect('genre', d.label)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By duration">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={durations}>
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#5DADE2"
              cursor="pointer"
              onClick={(d: any) => onSelect('duration', d.label)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By popularity">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={popularity}>
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar
              dataKey="count"
              fill="#F39C12"
              cursor="pointer"
              onClick={(d: any) => onSelect('popularity', d.label)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/organize/Charts.tsx
git commit -m "feat(organize): add Charts with click-to-filter"
```

---

### Task 17: TrackTable

**Files:**
- Create: `src/features/organize/TrackTable.tsx`

- [ ] **Step 1: Create `src/features/organize/TrackTable.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify type check passes**

Run: `npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/organize/TrackTable.tsx
git commit -m "feat(organize): add virtualized TrackTable with sort + search"
```

---

### Task 18: OrganizeScreen composition with filters

**Files:**
- Create: `src/features/organize/OrganizeScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/features/organize/OrganizeScreen.tsx`**

```tsx
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
      // Replace any existing filter of the same kind (single-selection per chart).
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
```

- [ ] **Step 2: Wire OrganizeScreen into App.tsx**

In `src/App.tsx`, replace the `state.kind === 'organizing'` block with:

```tsx
  if (state.kind === 'organizing') {
    return (
      <OrganizeScreen
        source={state.source}
        tracks={state.tracks}
        truncated={state.truncated}
        onBack={() => setState({ kind: 'picking', user: state.user })}
        onSave={(filtered, name) =>
          setState({
            kind: 'savingPlaylist',
            source: state.source,
            user: state.user,
            tracks: filtered,
            truncated: state.truncated,
            // SavePlaylistDialog reads this name as default; pass via component instead.
          } as any)
        }
      />
    )
  }
```

And add to the imports at the top of `src/App.tsx`:

```tsx
import { OrganizeScreen } from '@/features/organize/OrganizeScreen'
```

The `as any` is intentional and removed in Task 20 when SavePlaylistDialog lands.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`. Log in, organize Saved Tracks. Expected:
- Charts render: decade pie, genre bar, duration histogram, popularity histogram.
- Click a decade slice → filter chip appears, table & charts reduce to that subset.
- Click an × on the chip → filter clears.
- Search box filters table live (200ms debounced).
- Sort by clicking column headers.
- Table virtualizes — scroll feels smooth even with 5000 rows.

- [ ] **Step 5: Commit**

```bash
git add src/features/organize/OrganizeScreen.tsx src/App.tsx
git commit -m "feat(organize): compose OrganizeScreen with charts, filters, table"
```

---

### Task 19: ErrorBoundary + error state UI

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/ErrorBoundary.tsx`**

```tsx
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error)
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container px-4 py-32 mx-auto max-w-md text-center">
          <h2 className="mb-4 text-2xl font-semibold">Something broke.</h2>
          <p className="mb-6 text-sm text-muted-foreground">{this.state.error.message}</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )
    }
    return this.props.children
  }
}
```

- [ ] **Step 2: Wrap App with ErrorBoundary in `src/main.tsx`**

Replace `src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, err: any) => {
        const retryable = err?.retryable === true
        return retryable && failureCount < 3
      },
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
```

- [ ] **Step 3: Add an inline error screen for `state.kind === 'error'` with retry**

In `src/App.tsx`, replace the existing error handling block with:

```tsx
  if (state.kind === 'error') {
    return (
      <div className="container px-4 py-32 mx-auto max-w-md text-center">
        <h2 className="mb-4 text-2xl font-semibold">Something went wrong</h2>
        <p className="mb-6 text-sm text-muted-foreground">{state.message}</p>
        <div className="flex justify-center gap-2">
          {state.retry && <Button onClick={state.retry}>Retry</Button>}
          <Button variant="outline" onClick={() => setState({ kind: 'unauth' })}>
            Back to login
          </Button>
        </div>
      </div>
    )
  }
```

Add to imports if not present:

```tsx
import { Button } from '@/components/ui/button'
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/main.tsx src/App.tsx
git commit -m "feat(error): add ErrorBoundary and explicit error state screen"
```

---

## Phase 4 — Save playlist

### Task 20: SavePlaylistDialog

**Files:**
- Create: `src/features/organize/SavePlaylistDialog.tsx`
- Modify: `src/api/queries.ts` (add mutation helpers)
- Modify: `src/App.tsx`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Add playlist creation helpers to `src/api/queries.ts`**

Append to `src/api/queries.ts`:

```ts
import { spotifyFetch } from './spotifyClient'

export async function createPlaylist(
  userId: string,
  name: string,
  isPublic: boolean
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return spotifyFetch(`/users/${userId}/playlists`, {
    method: 'POST',
    body: { name, public: isPublic, description: 'Created with Organize Your Music' },
  })
}

export async function addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
  for (let i = 0; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100)
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: { uris: chunk },
    })
  }
}
```

(Note: `import { spotifyFetch }` may already be at the top — keep only one.)

- [ ] **Step 2: Create `src/features/organize/SavePlaylistDialog.tsx`**

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addTracksToPlaylist, createPlaylist } from '@/api/queries'
import type { Track } from '@/domain/track'
import type { SpotifyUser } from '@/state/appState'

type Props = {
  user: SpotifyUser
  tracks: Track[]
  defaultName: string
  onClose: () => void
}

export function SavePlaylistDialog({ user, tracks, defaultName, onClose }: Props) {
  const [name, setName] = useState(defaultName)
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const playlist = await createPlaylist(user.id, name.trim(), isPublic)
      await addTracksToPlaylist(
        playlist.id,
        tracks.map((t) => t.uri)
      )
      toast.success(`Saved ${tracks.length} tracks`, {
        description: name,
        action: {
          label: 'Open',
          onClick: () => window.open(playlist.external_urls.spotify, '_blank'),
        },
      })
      onClose()
    } catch (err: any) {
      toast.error('Failed to save playlist', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as playlist</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="playlist-name">Playlist name</Label>
            <Input
              id="playlist-name"
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Make playlist public
          </label>

          <p className="text-sm text-muted-foreground">
            Saving {tracks.length.toLocaleString()} tracks.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Replace OrganizeScreen save wiring**

In `src/features/organize/OrganizeScreen.tsx`, change `Props` and the save flow to keep dialog state local instead of pushing through App state:

Replace the `Props` type and component signature/return in `OrganizeScreen.tsx` with:

```tsx
import { SavePlaylistDialog } from './SavePlaylistDialog'
// (keep all other existing imports)

type Props = {
  user: import('@/state/appState').SpotifyUser
  source: Source
  tracks: Track[]
  truncated: boolean
  onBack: () => void
}

export function OrganizeScreen({ user, source, tracks, truncated, onBack }: Props) {
  const [filters, setFilters] = useState<Filter[]>([])
  const [search, setSearch] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)

  // (filteredTracks/addFilter/removeFilter/filterSummary/defaultName unchanged)

  // Replace the existing onSave button with:
  // <Button onClick={() => setSaveOpen(true)} disabled={filteredTracks.length === 0}>
  //   Save filtered view as playlist
  // </Button>

  // Render the dialog at the end of the component:
  // {saveOpen && (
  //   <SavePlaylistDialog
  //     user={user}
  //     tracks={filteredTracks}
  //     defaultName={defaultName}
  //     onClose={() => setSaveOpen(false)}
  //   />
  // )}
```

Apply the changes inline in the existing component body. The full updated component:

```tsx
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Charts, type FilterKind } from './Charts'
import { TrackTable } from './TrackTable'
import { SavePlaylistDialog } from './SavePlaylistDialog'
import { sourceLabel, type Source } from '@/domain/sources'
import {
  decadeForYear,
  durationBucketLabel,
  popularityBucketLabel,
} from '@/domain/bucketing'
import type { Track } from '@/domain/track'
import type { SpotifyUser } from '@/state/appState'

type Filter = { kind: FilterKind; label: string }

type Props = {
  user: SpotifyUser
  source: Source
  tracks: Track[]
  truncated: boolean
  onBack: () => void
}

export function OrganizeScreen({ user, source, tracks, truncated, onBack }: Props) {
  const [filters, setFilters] = useState<Filter[]>([])
  const [search, setSearch] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)

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
```

- [ ] **Step 4: Update App.tsx organizing branch to pass `user`**

Replace the `state.kind === 'organizing'` block in `src/App.tsx` with:

```tsx
  if (state.kind === 'organizing') {
    return (
      <OrganizeScreen
        user={state.user}
        source={state.source}
        tracks={state.tracks}
        truncated={state.truncated}
        onBack={() => setState({ kind: 'picking', user: state.user })}
      />
    )
  }
```

Drop the now-unused `savingPlaylist` state branch (the dialog handles save inline). Remove `savingPlaylist` from `AppState` in `src/state/appState.ts`:

```ts
// In src/state/appState.ts, remove this line from the union:
//   | { kind: 'savingPlaylist'; source: Source; user: SpotifyUser; tracks: Track[]; truncated: boolean }
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`. Organize a small source (e.g. a 50-track playlist). Apply a filter. Click Save. Expected:
- Dialog opens with default name pre-filled.
- Edit name, toggle public, click Save.
- Toast appears "Saved N tracks" with Open button → opens new playlist on Spotify.
- Verify in Spotify app/web that the playlist exists with the correct tracks.

- [ ] **Step 7: Commit**

```bash
git add src/features/organize/SavePlaylistDialog.tsx src/features/organize/OrganizeScreen.tsx src/api/queries.ts src/App.tsx src/state/appState.ts
git commit -m "feat(save): add SavePlaylistDialog and round-trip save flow"
```

---

## Phase 5 — Cleanup & deploy

### Task 21: Delete legacy `web/`, update README

**Files:**
- Delete: `web/` (entire directory)
- Modify: `README.md`

- [ ] **Step 1: Confirm nothing in `src/` references `web/`**

Run: `grep -RIn "web/" src/ || true`
Expected: no matches (or only matches inside comments unrelated to the legacy directory).

- [ ] **Step 2: Delete `web/`**

```bash
git rm -r web
```

- [ ] **Step 3: Replace `README.md`**

Write the file:

```markdown
# Organize Your Music

Organize your Spotify library by decade, genre, duration, and popularity. Save any filtered view as a new Spotify playlist.

Live: https://<github-username>.github.io/OrganizeYourMusic/

## Local development

```bash
cp .env.example .env.local
# put your Spotify client_id in .env.local
npm install
npm run dev
```

The dev server runs on http://localhost:8000/. Register that URL (with trailing slash) as a Redirect URI in the Spotify Developer Dashboard.

## Build

```bash
npm run build
```
```

Replace `<github-username>` with the actual GitHub username on the next pass after deploy URL is known.

- [ ] **Step 4: Verify build still passes**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "chore: delete legacy web/ app and rewrite README"
```

---

### Task 22: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SPOTIFY_CLIENT_ID: ${{ secrets.VITE_SPOTIFY_CLIENT_ID }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Add secret in GitHub repo settings**

In the GitHub repo: Settings → Secrets and variables → Actions → New repository secret:
- Name: `VITE_SPOTIFY_CLIENT_ID`
- Value: your Spotify client_id

- [ ] **Step 3: Enable GitHub Pages**

In the GitHub repo: Settings → Pages → Source → "GitHub Actions".

- [ ] **Step 4: Register the production redirect URI in Spotify dashboard**

In the Spotify Developer Dashboard, add `https://<github-username>.github.io/OrganizeYourMusic/` (trailing slash required) as a Redirect URI on the same app whose client_id is set above.

- [ ] **Step 5: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Pages deploy workflow"
git push origin master
```

- [ ] **Step 6: Verify deploy**

In GitHub Actions, watch the workflow run. Expected:
- "Deploy to GitHub Pages" succeeds.
- The deploy step prints the URL.
- Open the URL in a browser. The login screen renders.
- Click Log in with Spotify. After redirect, the picker shows. The full flow works end-to-end on the deployed URL.

If auth fails with `INVALID_REDIRECT_URI`, the URL registered in Spotify does not exactly match the GH Pages URL (most often a trailing-slash mismatch).

- [ ] **Step 7: Update README link**

Edit `README.md`, replace `<github-username>` with the actual deployed URL. Commit:

```bash
git add README.md
git commit -m "docs: link to live deploy in README"
git push origin master
```

---

## Self-Review

I checked the plan against the spec:

- **Stack** — TanStack Query, Recharts, react-virtual, shadcn additions covered in Task 1. ✓
- **PKCE auth** — Tasks 2, 3, 10. ✓
- **API client + retry policy** — Task 4 (401 refresh, 429 retry, 5xx retryable). ✓
- **Pagination + concurrency cap (5)** — Task 5. ✓
- **Track normalization + dedupe + genre merge** — Task 6. ✓
- **Bucketing (decade/genre/duration/popularity)** — Task 7. ✓
- **5 source strategies + playlist URI parser + 5000 cap** — Task 8. ✓
- **AppState discriminated union** — Task 9 (with `savingPlaylist` removed in Task 20 since dialog handles save inline — design simplification noted there). ✓
- **TanStack Query setup** — Task 11. ✓
- **LoginScreen** — Task 12. ✓
- **PickerScreen with all 5 sources + URI input + inline error** — Task 13. ✓
- **Delete Hero/config/SpotifyApiContext/__tests__** — Task 14. ✓
- **LoadingScreen with progress, two-phase label, AbortController cancel** — Task 15. ✓
- **Charts with click-to-filter** — Task 16. ✓
- **TrackTable: sort, search debounced, virtualized at all sizes (no `>500` gate — virtualizing always is simpler and equally fast for small lists)** — Task 17. ✓
- **OrganizeScreen with chips + Save button** — Task 18. ✓
- **ErrorBoundary + error state** — Task 19. ✓
- **SavePlaylistDialog with batch posting + toast + link** — Task 20. ✓
- **Delete `web/`, README** — Task 21. ✓
- **GH Pages deploy** — Task 22. ✓

Type consistency: `Source` shape consistent across Tasks 8/9/13/15/18; `Track` consistent across 6/7/8/16/17/18/20; `ProgressEvent` consistent across 8/9/15. `parsePlaylistInput` defined once in 8 and called once in 13. No undefined references.

Placeholder scan: no TBD/TODO/handwave; one explicit deviation is the `savingPlaylist` state — collapsed into local dialog state per Task 20 because moving it to global state added no value. Self-justified inline.

One known pragmatic simplification vs spec: the Charts "single filter per kind" replaces previous filter of the same kind (Task 18 `addFilter`), rather than allowing multiple decade chips simultaneously. Multi-select per kind would require chart UI for multi-highlight; deferred. Surface to user during execution.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-react-rewrite.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
