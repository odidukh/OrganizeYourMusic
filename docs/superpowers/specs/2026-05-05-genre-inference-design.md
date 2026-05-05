# Genre Inference Design

**Date:** 2026-05-05
**Status:** Approved (pending user review of spec)

## Goal

Let users fill in missing genres for tracks whose Spotify artists return no `genres` data. Many tracks land in the `(no genre)` chart bucket today because Spotify's `/artists?ids=...` endpoint returns empty arrays for less-tagged artists. Inference enriches these tracks using an external genre database, improving filter coverage and chart accuracy without modifying Spotify-sourced data.

## Non-goals

- **Writing inferred genres back to Spotify.** Spotify's API does not allow writing genres to tracks or playlists. Out of scope.
- **Replacing Spotify-sourced genres.** `Track.genres` is the source of truth and is never modified.
- **Audio-features-based classification.** Spotify deprecated the audio-features endpoint in late 2024.
- **Per-track UI display of genre origin in `TrackTable`.** The table does not currently show genres; provenance markers live on charts and filter chips only.

## Approach summary

1. **Source:** Last.fm `artist.getTopTags` only (v1).
2. **Trigger:** explicit on-demand button on the organize screen ("Fill missing genres").
3. **Persistence:** localStorage cache keyed by Spotify `artistId`, no TTL.
4. **Provenance:** new `Track.inferredGenres: string[]` field, separate from `Track.genres`.
5. **UI distinction:** charts and filter chips show a marker when their value comes only from inferred data.
6. **Whitelist:** static Spotify genre seeds ∪ user's library genres, used to filter Last.fm folksonomy tags down to real genres.
7. **API key:** build-time env var `VITE_LASTFM_API_KEY`, same trust model as `VITE_SPOTIFY_CLIENT_ID`.

## Architecture

### Data flow

```
[Spotify enrichment]  → Track.genres populated (some [])
[user clicks "Fill missing genres"]
  → identify unique artistIds appearing on at least one
    track that has empty genres
  → consult localStorage cache: artistId → string[] | absent
  → for uncached artists: fetch Last.fm artist.getTopTags
     - sequential, 200ms gap (5/sec cap)
     - filter response tags through whitelist
     - persist to localStorage (empty array if no whitelisted tags found)
  → build Map<artistId, string[]> for all candidate artists
  → produce new Track[] with inferredGenres patched immutably
  → setState in App.tsx, charts/filters re-render
```

### Invariants

- **Cache is keyed by Spotify `artistId`.** Stable across sessions, no fuzzy matching.
- **A cached `[]` is a real result**, not a miss. Means "asked Last.fm, nothing whitelisted came back." Avoids re-fetching artists with no usable tags.
- **`Track.genres` is never modified.** Only `inferredGenres` gets populated.
- **Whitelist is computed once per button click.** Library genres can change as the user navigates between sources.
- **Inference runs only within `AppState.organizing`.** No new state machine variant.

### External dependencies

- Last.fm API key via `import.meta.env.VITE_LASTFM_API_KEY` (publicly embedded in bundle, acceptable per Last.fm TOS for read-only methods).
- No new npm packages.

## Components

### New files

| Path | Responsibility |
|---|---|
| `src/api/lastfm.ts` | Single export `fetchArtistTags(name, signal)`. Owns URL construction, key reading, status-code handling. Returns raw tag strings (unfiltered). |
| `src/domain/genreInference.ts` | Orchestrator. `inferGenres({ tracks, candidateArtistIds, whitelist, signal, onProgress })`. Consults cache, throttles fetches, filters tags, persists. |
| `src/domain/genreWhitelist.ts` | `STATIC_GENRES: ReadonlySet<string>` (Spotify seed list, ~125 strings) and `buildWhitelist(libraryGenres)` helper. Pure. |
| `src/domain/inferenceCache.ts` | `read()`, `write()`, `merge()`. Wraps localStorage for key `oym:lastfm:v1`. Try/catch around storage operations. |
| `src/features/organize/FillGenresButton.tsx` | Button + progress UI. Owns `idle | running | done` state. AbortController for cancel. |

### Modified files

| Path | Change |
|---|---|
| `src/domain/track.ts` | Add `inferredGenres: string[]` to `Track`. Update `mergeArtistGenres` to initialize `inferredGenres: []`. |
| `src/domain/bucketing.ts` | `bucketByGenre` unions `genres` ∪ `inferredGenres` for counts; tracks `inferredOnlyCount` per bucket so charts can render the inferred contribution. |
| `src/domain/filters.ts` | `matchGenreValue` checks both arrays. `(no genre)` predicate now means `genres.length === 0 && inferredGenres.length === 0`. |
| `src/domain/sources.ts` | `mergeArtistGenres` initializes `inferredGenres: []` on every track. |
| `src/features/organize/Charts.tsx` | Render stripe pattern (SVG `<pattern>`) on bars/slices proportional to `inferredOnlyCount`. |
| `src/features/organize/FilterChip.tsx` | Show ✨ marker next to a value when that value appears in `inferredGenres` only (not in any track's `genres`). |
| `src/features/organize/OrganizeScreen.tsx` | Wire `<FillGenresButton>` into the action bar next to Copy link / Save. Pass `onTracksUpdate` callback. |
| `src/App.tsx` | Pass `setTracks` (or equivalent) down to `OrganizeScreen` so inference can patch state. |

### Why separate `genreInference.ts` from `lastfm.ts`

`lastfm.ts` is a transport — one artist → tags. `genreInference.ts` is the workflow — N tracks → patched tracks. Separation lets the workflow stay testable with a fake fetcher and keeps the transport free of business logic.

## Data flow detail

### Trigger sequence

1. User clicks `FillGenresButton`.
2. Button computes:
   - `candidateArtistIds`: unique artistIds drawn from tracks where `genres.length === 0`. (An artist that appears on at least one no-genre track is worth asking about, even if other tracks of that artist already have genres via co-artists.)
   - `libraryGenres`: union of all `t.genres` across tracks.
   - `whitelist`: `STATIC_GENRES ∪ libraryGenres`.
3. Button transitions to `running`, creates an `AbortController`.
4. Calls `inferGenres({ tracks, candidateArtistIds, whitelist, signal, onProgress })`.
5. `inferGenres`:
   - `cache = inferenceCache.read()`
   - `uncached = candidateArtistIds.filter(id => !(id in cache))`
   - For each uncached id, sequentially with 200ms gap:
     - Throw `AbortError` if `signal.aborted`.
     - Look up artist name from a `Map<artistId, artistName>` built once at the start of the run.
     - `rawTags = await fetchArtistTags(artistName, signal)`
     - `kept = rawTags.filter(t => whitelist.has(normalize(t)))`
     - `cache[id] = kept`
     - `onProgress({ done: ++n, total: uncached.length })`
   - `inferenceCache.write(cache)`
   - Returns `Map<artistId, string[]>` covering all candidate artists.
6. Button receives the result map.
7. Patch tracks: for each track, `inferredGenres = unique union of cache[id] for id in t.artistIds where id is in the map`.
8. Calls `onTracksUpdate(patchedTracks)` → `App.tsx setState`.
9. Button transitions to `done`. Toast: "Filled X tracks. Y still unknown."

### Re-renders

- `setTracks` in `App.tsx` cascades to `OrganizeScreen` → `Charts` + `TrackTable`.
- `topGenres(tracks)` and bucket recomputes happen via existing `useMemo` deps on `tracks`.
- `matchCtx` deps stay `[tracks]`. No additional dependency tracking.

### Concurrency

Sequential with a 200ms gap between fetches. Simplest, deterministic, comfortably under Last.fm's 5/sec cap. 5,000 tracks ≈ 500–1500 unique artists ≈ 100–300 sec for a cold cache. Acceptable for an explicit on-demand action with a progress bar.

### Whitelist normalization

Last.fm returns mixed-case multi-word tags (`"Indie Rock"`, `"alt rock"`). Spotify's seed list uses dashes (`"indie-rock"`, `"alt-rock"`). Normalize both sides: lowercase, replace dashes and spaces with a single space, trim. Match on the normalized form.

## Error handling

### Last.fm response handling

| Status | Body | Action |
|---|---|---|
| 200 | normal `toptags.tag[]` | Parse names, return raw tags |
| 200 | `{error: 6}` (artist not found) | Cache `[]`, treat as empty result |
| 200 | `{error: 8}` (operation failed) | Retry once after 1s; if still failing, cache `[]` and continue |
| 429 | rate limited | Retry once after 5s; if still 429, abort the run with a toast |
| 5xx | server error | Retry once after 1s; if still failing, skip artist (do not cache), continue |
| network error | offline / DNS | Abort the run with a toast |

### Cache write semantics

- `cache[id] = []` means "we asked Last.fm, nothing usable came back" — never re-ask.
- Skip (no cache entry) means "we couldn't ask cleanly, try again next session."
- 5xx errors and one-shot transient failures get the skip. "Not found" and "no whitelisted tags" get the empty cache entry.

### Cancel path

- The button shows a Cancel button while running. Clicking it calls `controller.abort()`.
- `inferGenres` checks `signal.aborted` between requests; in-flight `fetch` aborts via the signal.
- On `AbortError`: write the in-memory cache to localStorage (don't lose work), apply partial patch to tracks, transition button to `idle`. Toast: "Cancelled. Filled X of Y so far."
- No state machine change. User stays in `organizing`.

### Missing API key

- `lastfm.ts` exports `isConfigured(): boolean` checking the env var.
- Button reads this at mount; if false, renders disabled with tooltip "Genre inference not configured."
- `fetchArtistTags` also throws a clear error if called without a key, defending against devtools tampering.

### localStorage failures

- `inferenceCache.read()` returns `{}` on JSON parse failure or quota error.
- `inferenceCache.write()` catches quota errors and surfaces a single `toast.warning` per session ("Couldn't save inference cache").
- Cache miss only causes extra Last.fm calls; no data corruption.

### Empty whitelist intersection

If Last.fm returns 30 tags and none pass the whitelist (all folksonomy junk like `"favorites"`, `"seen live"`), `cache[id] = []`. Track stays in `(no genre)`. Counts as "still unknown" in the final toast.

### Multiple artists per track

A track with `artistIds: ['A', 'B']` where A enriches to `['rock']` and B to `['jazz']` ends up with `inferredGenres: ['rock', 'jazz']`. Both contribute to charts and filters. Same merge rule as Spotify-side `mergeArtistGenres`.

### Final summary toast

```
Filled 487 of 612 tracks with inferred genres.
125 still unknown.
```

- "Filled" = tracks where `inferredGenres.length > 0` after the run.
- "Still unknown" = tracks where both `genres` and `inferredGenres` are empty.

## UI surface

### FillGenresButton states

| State | Render | Action on click |
|---|---|---|
| disabled (no key) | grey button, tooltip | none |
| idle | "Fill missing genres" | start inference |
| running | progress bar + "Cancel" + "X / Y artists" | abort |
| done | "Filled X tracks ✓" → fades to idle after 3s | restart |

### Chart marker

For chart bars/slices that include inferred contributions: render a striped overlay using an SVG `<pattern>` definition in Recharts, with stripe density proportional to `inferredOnlyCount / count`. A small legend entry explains the marker.

### FilterChip marker

A filter value appears with a ✨ suffix when no track has that value in its `Track.genres` — only in `inferredGenres`. Mixed case (some real, some inferred) shows no marker.

## Storage schema

```
key: oym:lastfm:v1
value: JSON-encoded Record<artistId, string[]>
```

Example:

```json
{
  "4tZwfgrHOc3mvqYlEYSvVi": ["alternative rock", "indie rock"],
  "1dfeR4HaWDbWqFHLkxsg1d": [],
  "0LcJLqbBmaGUft1e9Mm8HV": ["jazz", "soul"]
}
```

The `:v1` suffix in the key reserves the option of a future incompatible format without migration code.

## Out of scope (deferred)

- **MusicBrainz fallback** for artists Last.fm can't tag. Adds CORS-friendly free coverage but adds complexity. Revisit if Last.fm coverage proves insufficient (<70% of no-genre tracks filled).
- **Per-track inference UI in `TrackTable`** — not currently displaying genres; would require a column.
- **Auto-run on library load** — explicit button preferred for v1.
- **Tag confidence weighting** — Last.fm returns counts, but v1 ignores them and accepts any whitelisted tag.
- **TTL on cache** — genre tags shift slowly; revisit only if reports of stale data emerge.
