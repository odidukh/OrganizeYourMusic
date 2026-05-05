# OrganizeYourMusic

React/TS SPA. Spotify library organizer (decade/genre/duration/popularity). Filter, then save as playlist. Deployed to GitHub Pages.

**Live:** https://odidukh.github.io/OrganizeYourMusic/

## Stack

- React 18 + TypeScript, Vite 5
- Tailwind 3 + shadcn/ui (Radix primitives)
- TanStack Query for server state
- Recharts for charts, `@tanstack/react-virtual` for table
- Spotify Web API via Authorization Code + PKCE
- Sonner for toasts
- No test runner wired in this codebase (jest config exists but unused). Don't add tests unless asked.

## Commands

```bash
npm run dev      # dev server on http://127.0.0.1:8000/OrganizeYourMusic/
npm run build    # tsc -b && vite build
npm run lint
```

Push to `master` → `.github/workflows/deploy.yml` builds and deploys to GH Pages.

## Project layout

```
src/
  api/         spotifyFetch + queries (createPlaylist, addTracksToPlaylist, useCurrentUser)
  auth/        PKCE helpers, useAuth hook, token storage
  components/  shadcn ui primitives + ErrorBoundary
  domain/      track normalization, bucketing, source strategies
  features/
    login/     LoginScreen
    pick/      PickerScreen (5 sources + URI input)
    loading/   LoadingScreen (progress + cancel)
    organize/  OrganizeScreen, Charts, TrackTable, SavePlaylistDialog
  state/       AppState discriminated union
  App.tsx      single-page state machine
```

## Critical gotchas

These bit us during smoke testing. Don't undo them.

**1. Spotify redirect_uri must be `127.0.0.1`, not `localhost`.**
Spotify's 2025 policy rejects `localhost` over HTTP. Loopback IP is the only HTTP exception. `vite.config.ts` binds `host: '127.0.0.1'` for this reason. Don't change it.

**2. PKCE code exchange must dedupe across StrictMode double-mount.**
React 18 StrictMode invokes mount effects twice in dev. Spotify auth codes are single-use, so the second call fails with `invalid_grant`. `src/auth/useAuth.ts` uses a module-level promise cache (`exchangeOnce(code)`) keyed by code string. Both mounts share one in-flight promise. Don't replace this with a `useRef` — refs are per-component-instance and StrictMode creates two.

**3. Tailwind `content` glob must include `./src/**/*.{js,jsx,ts,tsx}`.**
JIT silently produces zero CSS if globs miss source files. If utilities stop generating, check `tailwind.config.js` first.

**4. Vite `base: '/OrganizeYourMusic/'` is required for GH Pages.**
Asset paths are subpath-relative on the deployed site. Don't remove the base.

**5. Charts column needs `min-w-0` on its grid track.**
Outer layout is `md:grid-cols-[320px_minmax(0,1fr)]`. Without `min-w-0` on the table column, content with intrinsic width pushes the grid past its container and crops the right edge.

**6. `VITE_LASTFM_API_KEY` is optional but gates the Fill-missing-genres feature.**
The button reads `import.meta.env.VITE_LASTFM_API_KEY` at mount; if absent, it
renders disabled. Free key from https://www.last.fm/api/account/create. Repo
secret of the same name is consumed by `.github/workflows/deploy.yml`.

## Domain rules

- **5,000-track cap** per source. Truncation flagged on the organize screen.
- **Audio features API is deprecated** as of late 2024. Bucket on metadata only: `track.album.release_date` year → decade, `track.duration_ms` → duration bucket, `track.popularity` → popularity bucket, artist genres (merged across track artists, deduped).
- **Genre "other" filter** = `track.genres.length === 0`.
- **Pagination concurrency cap = 5** (`src/domain/pagination.ts`). Don't raise without considering Spotify's 429 behavior.
- **API client** retries 401 once after token refresh, retries 429 honoring `Retry-After`, retries 5xx with backoff.
- **Playlist creation** is two calls: `POST /users/{id}/playlists` then `POST /playlists/{id}/tracks` chunked at 100 URIs per request.

## State machine

`AppState` is a discriminated union: `unauth | authCallback | picking | loading | organizing | error`. Transitions live in `App.tsx`. Loading carries an `AbortController` so Cancel can interrupt mid-fetch. Error carries an optional `retry` callback that captures `(source, user)` so retry doesn't depend on current state.

## Coding conventions

- Immutable updates everywhere. No mutation of props/state.
- Functional setState updaters when next state depends on previous (`setState(prev => ...)`).
- One feature per folder under `features/`. Components co-located with their feature.
- shadcn primitives in `components/ui/`. Don't reach for new UI libs — extend shadcn.
- No comments unless the *why* is non-obvious.
- TypeScript strict. No `any` without a comment justifying it.

## Deploy

`master` → GH Pages via `.github/workflows/deploy.yml`. The workflow needs the `VITE_SPOTIFY_CLIENT_ID` repo secret. If you change the production redirect URI, update the Spotify Developer Dashboard redirect list to match exactly (trailing slash matters).

## Out of scope (don't add unless asked)

- Tests (no runner wired)
- Code splitting (bundle is ~770 KB, acceptable for this app)
- Backend (PKCE + GH Pages = no server)
- Audio-features-based organization (API deprecated)
