# Organize Your Music — React Rewrite Design

**Date**: 2026-05-05
**Status**: Approved (pending user review of this document)

## Goal

Finish the half-built React/TypeScript rewrite in `src/` to full feature parity with the legacy jQuery app in `web/`, minus features that depend on Spotify's deprecated `/v1/audio-features` endpoint. Delete the legacy app when done. Deploy to GitHub Pages.

## Constraints

- Spotify deprecated `/v1/audio-features` for new client_ids in November 2024. Bucketing by BPM, energy, danceability, valence, mood, key, acousticness, instrumentalness is no longer feasible going forward.
- Spotify deprecated implicit-grant auth (`response_type=token`); the existing `Hero.tsx` uses it.
- App must work as a static SPA on GitHub Pages — no backend.
- No automated tests in this iteration (added later).

## Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| UI | Existing shadcn/ui components + Tailwind |
| Auth | Authorization Code with PKCE |
| Server state | TanStack Query (`@tanstack/react-query`) |
| Charts | Recharts |
| Virtualization | `@tanstack/react-virtual` (for >500-row tables) |
| State | Discriminated union held in `App.tsx`; no global store |
| Deploy | GitHub Pages via GitHub Actions |

## File Structure

```
src/
  App.tsx                       — top-level state machine switch
  main.tsx
  index.css
  state/
    appState.ts                 — discriminated union: AppState
  auth/
    pkce.ts                     — code_verifier + challenge gen, base64url
    spotifyAuth.ts              — login redirect + token exchange + refresh
    useAuth.ts                  — hook: token, login, logout, isAuthed
  api/
    spotifyClient.ts            — fetch wrapper, bearer, JSON, retry on 429
    queries.ts                  — TanStack Query hooks (useUser, useTracks, useArtists)
    pagination.ts               — paginate /me/tracks etc. with concurrency cap
  domain/
    track.ts                    — Track type, normalizeTrack(rawSpotifyTrack)
    bucketing.ts                — bucket-by-decade, by-genre, by-duration, by-popularity
    sources.ts                  — fetch strategy per source
  features/
    login/LoginScreen.tsx
    pick/PickerScreen.tsx
    loading/LoadingScreen.tsx
    organize/OrganizeScreen.tsx
    organize/TrackTable.tsx
    organize/Charts.tsx
    organize/SavePlaylistDialog.tsx
  components/ui/                — kept (shadcn)
  lib/utils.ts                  — kept

# Deleted
src/components/Hero.tsx
src/config.js
src/utils/SpotifyApiContext.ts
src/utils/__tests__/
web/                            — legacy app (kept in git history)
```

`domain/` is pure-function only — no React, no fetch — so bucketing/normalization is reusable and trivially testable later. Feature folders keep related code together; deleting a feature = deleting a directory.

## Configuration

- `VITE_SPOTIFY_CLIENT_ID` — env var (public, fine for PKCE).
- `.env.example` checked in.
- Vite `base: '/OrganizeYourMusic/'` for GH Pages subpath.
- Spotify dashboard redirect URIs: `http://localhost:5173/` (dev) and `https://<user>.github.io/OrganizeYourMusic/` (prod). Trailing slash required.

## State Machine

```ts
type AppState =
  | { kind: 'unauth' }
  | { kind: 'authCallback'; code: string }
  | { kind: 'picking'; user: SpotifyUser }
  | { kind: 'loading'; source: Source; progress: { fetched: number; total: number } }
  | { kind: 'organizing'; source: Source; tracks: Track[] }
  | { kind: 'savingPlaylist'; tracks: Track[]; name: string }
  | { kind: 'error'; message: string; retry?: () => void }

type Source =
  | { type: 'saved' }
  | { type: 'added' }     // user-owned playlists
  | { type: 'follow' }    // playlists user follows but didn't create
  | { type: 'all' }       // saved + added + follow, deduped
  | { type: 'playlist'; uri: string }
```

**Transitions**:
- App mount: read `localStorage` for refresh_token. If valid → `picking`. Else `unauth`.
- If URL has `?code=...` on mount → `authCallback` → exchange tokens → strip `?code` from URL → `picking`.
- `unauth` → click Login → PKCE redirect to Spotify.
- `picking` → click Organize → `loading`.
- `loading` → fetch + enrich → `organizing`. Cancel button → `picking`.
- `organizing` → filter/sort/chart locally. Click Save → `savingPlaylist` → success → back to `organizing`.
- Any state → `error` on fatal failure (with retry callback when applicable).

A discriminated union enforces exhaustive narrowing — components in `organizing` cannot read fields that only exist in `loading`, eliminating spinner-over-stale-data bugs at compile time.

## Auth (PKCE)

```
Login click:
  pkce.generate() → { verifier, challenge }
  localStorage.setItem('pkce_verifier', verifier)
  redirect to https://accounts.spotify.com/authorize?
    client_id=$ID
    &response_type=code
    &redirect_uri=$REDIRECT
    &code_challenge_method=S256
    &code_challenge=$challenge
    &scope=user-library-read+playlist-read-private+playlist-read-collaborative+playlist-modify-public+playlist-modify-private

Spotify → /?code=XYZ:
  exchangeCodeForTokens(code, verifier)
    POST https://accounts.spotify.com/api/token (grant_type=authorization_code)
  → { access_token, refresh_token, expires_in }
  store refresh_token in localStorage
  store access_token in memory only
  history.replaceState(null, '', '/') to clear ?code
  → picking

On 401 from any API call:
  refreshAccessToken(refresh_token)
    POST /api/token (grant_type=refresh_token)
  retry original request once
  if refresh fails → clear localStorage, → unauth
```

`access_token` lives in memory only; `refresh_token` persists in `localStorage`. App loads no third-party scripts and renders no user-generated HTML, so XSS surface is near-zero — acceptable risk profile for this storage choice.

Stripping `?code=` from the URL via `history.replaceState` before any state transition prevents the "refresh-replays-callback" bug where Spotify rejects an already-used code with `invalid_grant`.

## Track Fetching

| Source | Strategy |
|---|---|
| `saved` | paginate `GET /me/tracks` (50/page) |
| `added` | `GET /me/playlists` → filter `owner.id === user.id` → paginate `/playlists/{id}/tracks` for each |
| `follow` | `GET /me/playlists` → filter `owner.id !== user.id` → paginate `/playlists/{id}/tracks` for each |
| `all` | union of saved + added + follow, dedupe by `track.id` |
| `playlist` | parse URI/URL/ID → paginate `/playlists/{id}/tracks` |

After tracks load, collect unique `artist.id`s → batch `GET /artists?ids=...` (50/batch) → merge `genres` into each track.

**Concurrency**: cap 5 in-flight requests via custom limiter. On `429`, honor `Retry-After`; on 5xx, exponential backoff (1s, 2s, 4s) up to 3 attempts.

**Hard cap**: 5000 tracks per source. If exceeded, stop pagination and surface a banner: "Showing first 5000 of N tracks. Pick a smaller source for full coverage."

**Playlist URI parsing** accepts:
- `spotify:playlist:5FJXhjdILmRA2z5bvz4nzf`
- `https://open.spotify.com/playlist/5FJXhjdILmRA2z5bvz4nzf?si=...`
- bare ID `5FJXhjdILmRA2z5bvz4nzf`

## Track Type

```ts
type Track = {
  id: string
  name: string
  artistNames: string[]
  artistIds: string[]
  album: { name: string; releaseYear: number; releaseDate: string }
  durationMs: number
  popularity: number
  explicit: boolean
  previewUrl: string | null
  genres: string[]            // populated post artist enrichment
  addedAt: string | null      // only for /me/tracks
}
```

## Bucketing (replaces audio-features buckets)

| Bucket | Source field |
|---|---|
| Decade | `album.releaseYear` → 1960s/70s/80s/90s/2000s/2010s/2020s/unknown |
| Genre (top 15) | `genres[]` (from artist enrichment); rest grouped as "other" |
| Duration | <2min / 2–3 / 3–4 / 4–5 / 5–7 / 7+ min |
| Popularity | bins of 10 (0-9, 10-19, …, 90-100) |

## Components

### `LoginScreen`
Title + subtitle preserved from current `Hero.tsx`. Single "Log in with Spotify" button.

### `PickerScreen`
Avatar + welcome, source dropdown (5 options), conditional playlist URI input when `source === 'playlist'` (validated inline), "Organize your music" button.

### `LoadingScreen`
Centered card with progress bar. Two-phase label: "Fetching tracks (1240/5000)…" then "Loading artist genres (45/100 batches)…". Cancel button aborts in-flight requests via `AbortController` and transitions to `picking`.

### `OrganizeScreen`
Two-column desktop, stacked mobile.

**Charts column** (`Charts.tsx`):
- Decade pie
- Genre bar (top 15 + other)
- Duration histogram
- Popularity histogram
- **Click any chart segment** → applies as a filter; chips at top show active filters with × to clear.

**Table column** (`TrackTable.tsx`):
- Columns: # / Title / Artist / Album / Year / Duration / Popularity / Explicit
- Header click → sort asc/desc/none
- Search input (200ms debounce) filters title/artist
- Active filter chips above table
- Footer: "Showing 432 of 5000 tracks" + "Save filtered view as playlist"
- Virtualized via `@tanstack/react-virtual` when row count > 500

### `SavePlaylistDialog`
Modal: name input, public/private toggle, Save.

Default name:
- With active filters: `"Organized: {source label} — {filter summary}"` where `{filter summary}` joins active filters (e.g. `"1980s rock"`).
- No active filters: `"Organized: {source label}"` (e.g. `"Organized: Saved Tracks"`).

Save flow:
1. `POST /users/{user_id}/playlists`
2. `POST /playlists/{id}/tracks` in batches of 100 URIs
3. Toast with link to playlist on Spotify

## Error Handling

| Failure | UX | Recovery |
|---|---|---|
| User denies auth (`?error=access_denied`) | `LoginScreen` with red banner | Click Login again |
| PKCE token exchange fails | `error` state | Retry → re-redirect |
| Refresh rejected (`invalid_grant`) | Silent: clear storage, → `unauth` | User logs in again |
| 401 on API call | Auto-refresh + retry once. If refresh fails → `unauth` | — |
| 429 | Honor `Retry-After`, retry. Surface only after 3 retries fail | — |
| 5xx / network | Exp. backoff (1s/2s/4s), 3 attempts, then `error` with retry callback | — |
| Empty result | OrganizeScreen empty-state illustration "No tracks found." | Back → `picking` |
| Invalid playlist URI | Inline error in `PickerScreen` | User edits |
| Partial save (some tracks rejected) | Toast "Saved 487/500 tracks. 13 unavailable in your region." | — |
| `all` exceeds 5000 cap | Banner; show first 5000 | — |

**Implementation**:
- All API errors → `class SpotifyError extends Error { status: number; retryable: boolean }`.
- TanStack Query `retry: (failureCount, err) => err.retryable && failureCount < 3`.
- One `<ErrorBoundary>` at `App` level for React render errors → "Something broke" + reload.
- No `console.log` in production; `console.error` only for unexpected exceptions; noisy DEV logs guarded by `import.meta.env.DEV`.
- The current `SpotifyApiContext.ts:24` `console.log('Raw response body:', rawBody)` is a token-payload leak and is removed by deletion of that file.

## Migration Phases

### Phase 1 — Foundation (no UI change)
1. Add `VITE_SPOTIFY_CLIENT_ID` env var; create `.env.example`. Set Vite `base: '/OrganizeYourMusic/'`.
2. Install: `@tanstack/react-query`, `recharts`, `@tanstack/react-virtual`.
3. Add `auth/pkce.ts`, `auth/spotifyAuth.ts` (pure).
4. Add `api/spotifyClient.ts`, `api/pagination.ts` (pure).
5. Add `domain/track.ts`, `domain/bucketing.ts`, `domain/sources.ts` (pure).

End-of-phase: `Hero.tsx` still renders; new modules compile.

### Phase 2 — New auth + picker
6. Replace `Hero.tsx` with `App.tsx` state machine + `LoginScreen` + `PickerScreen`.
7. Delete `src/utils/SpotifyApiContext.ts`, `src/utils/__tests__/`, `src/config.js`, `src/components/Hero.tsx`.
8. Verify: login → callback → picker shows user avatar.

### Phase 3 — Organize screen
9. Add `LoadingScreen`, `OrganizeScreen`, `TrackTable`, `Charts` (with click-to-filter), filter chips, search.
10. Verify each of the 5 sources fetches and displays.

### Phase 4 — Save playlist
11. Add `SavePlaylistDialog`. Verify round-trip and that the new playlist appears in the user's Spotify.

### Phase 5 — Cleanup & deploy
12. `git rm -r web/`. Update `README.md` (one paragraph: what it does, link to live URL, dev quickstart).
13. Add GitHub Action: on push to `master`, build + deploy `dist/` to GH Pages.
14. Register the GH Pages URL as a Redirect URI in the Spotify dashboard.

Each phase ends in a buildable, deployable state.

## Out of Scope

- Automated tests (deferred — see Q9D).
- Audio-features buckets (BPM, mood, energy, etc.) — endpoint unavailable.
- Mobile-native polish beyond responsive stacking.
- Internationalization.
- Server-side caching or any backend.
- Sentry or remote error reporting.

## Open Decisions Resolved

| # | Question | Choice |
|---|---|---|
| 1 | Goal | Finish React rewrite, delete `web/` |
| 2 | audio-features handling | Replace with metadata-only buckets |
| 3 | MVP feature set | Table + charts + playlist creation |
| 4 | Auth flow | Authorization Code + PKCE |
| 5 | Deployment | GitHub Pages |
| 6 | Sources | All 5 (saved/added/follow/all/playlist) |
| 7 | Charts library | Recharts |
| 8 | State management | TanStack Query + local component state |
| 9 | Testing | Defer; add later |
| 10 | Architecture | Single-page state machine |
