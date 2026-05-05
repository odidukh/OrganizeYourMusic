# Smarter Filters — Design

**Date:** 2026-05-05
**Status:** Approved (pending user review of written spec)
**Scope:** Replace flat single-value filter model with multi-select + exclude + URL-shareable state. Make text search a first-class filter.

## Motivation

The current filter model in `src/features/organize/OrganizeScreen.tsx` is `Filter = { kind, label }` with one filter per kind, AND across kinds. This makes common queries impossible to express:

- Multi-select within a kind (e.g. "70s OR 80s OR 90s")
- Exclude (e.g. "everything except christmas/holiday genre")
- Sharing a filter set via URL or recovering it on refresh
- Treating text search as part of the filter chain (today it's a separate post-filter on the table)

This spec covers all four limitations as one cohesive change.

## Non-goals

- Saved-named-presets ("My Workout Mix" filter set) — deferred
- Multi-select on table rows — deferred (separate UX polish spec)
- Keyboard shortcuts — deferred
- Boolean trees / nested OR across different kinds — explicit YAGNI
- localStorage persistence — URL is the persistence + share medium
- Routing-by-URL navigation (recipient lands on the right source automatically) — deferred; documented as known limitation

## Approach

Flat per-kind groups: each filter is one kind, mode (include/exclude), and a list of values that OR within. Filters AND across kinds. This covers multi-select, exclude, search-as-filter, and serializes cleanly. Boolean trees and predicate DSLs were rejected as overkill for a chart-click-driven UI.

## Section 1 — Data model

```ts
type FilterKind = 'decade' | 'genre' | 'duration' | 'popularity' | 'search'
type FilterMode = 'include' | 'exclude'

type Filter = {
  kind: FilterKind
  mode: FilterMode
  values: string[]   // OR within. For 'search', values.length === 1.
}

type FilterState = {
  filters: Filter[]   // AND across, max one entry per kind.
}
```

### Semantics

- Within a filter:
  - `mode: 'include'` matches when ≥1 value matches.
  - `mode: 'exclude'` matches when 0 values match.
- Across filters: AND (`every`).
- Invariant: at most one filter per kind. Adding a same-kind value merges into the existing filter's `values`.
- Invariant: `values.length === 0` filters are dropped. The reducer never produces an empty-value filter.

### Reducer operations (pure, immutable)

Located in `src/domain/filters.ts`:

- `toggleValue(state, kind, value)` — adds value to existing kind's `values`, or removes if present, or creates a new filter with `[value]`. Drops the filter when `values` becomes empty.
- `setMode(state, kind, mode)` — flips include/exclude on existing filter; no-op if no filter for kind.
- `removeFilter(state, kind)` — drops entire filter for that kind.
- `clearAll(state)` — returns empty `FilterState`.
- `upsertSearch(state, query)` — sets `kind: 'search'`, `values: [query]`. Empty/whitespace `query` removes the filter.

### Predicate

- `matchesFilters(track, filters)` — `filters.every(f => matchesFilter(track, f))`.
- `matchesFilter(track, filter)`:
  - `decade`: `decadeForYear(track.album.releaseYear)` ∈ `values` (XOR mode).
  - `genre`: any of `values` is in `track.genres`; `'other'` matches when `track.genres.length === 0`.
  - `duration`: `durationBucketLabel(track.durationMs)` ∈ `values`.
  - `popularity`: `popularityBucketLabel(track.popularity)` ∈ `values`.
  - `search`: case-insensitive substring of `values[0]` matches `track.name` or any artist `name`.
  - Wrap with mode: include = match, exclude = `!match`.

## Section 2 — UI interactions

### Chart bar clicks

- Click bucket → `toggleValue(kind, label)`. Same-kind clicks stack instead of replacing.
- Selected buckets render with accent fill; non-selected with default fill (Recharts `Cell` per bar/slice, branch on `selectedValues.includes(label)`).
- Charts read `selectedValues(kind)` from `FilterState` directly, not just `filteredTracks`.

### Charts baseline (behavioral change)

- Bars/slices show counts over the full `tracks` set, not `filteredTracks`. This keeps bars stable as the user filters, so "what's available" stays visible and selection is the diff.
- Tooltip on hover shows `filteredCount / totalCount` for the bucket.
- Implication: Charts component now receives both `tracks` (full) and a precomputed `filteredCountsByKind` map.

### Chip row (one chip per filter)

- Format: `genre: rock, jazz, +2 [×]` — truncate at 2 values, show `+N` overflow.
- Click chip body → opens shadcn `Popover` containing:
  - Mode toggle pill (Include / Exclude).
  - Full value list with individual value remove buttons.
  - "Clear" button (drops the whole filter).
- Click `×` directly on chip → drops whole filter.
- Exclude filters render visually distinct (strikethrough or different accent): `genre ≠ christmas, holiday [×]`.

### Search

- Existing search input stays in `TrackTable` header (familiar location).
- Typing creates/updates `kind: 'search'` filter live (debounced ~150 ms).
- Once search has text, also renders as a chip in the chip row, so user can flip exclude mode and clear it consistently with other filters.
- Empty input → search filter is dropped.

## Section 3 — URL state & sharing

### Storage location: hash fragment

- `#f=<encoded>` — hash never collides with PKCE `?code=...&state=...` from Spotify auth.
- Hash is not sent to server (good hygiene; not strictly relevant since we deploy static).
- Survives Spotify redirect because PKCE only consumes query params.

### Encoding

```
#f=<base64url(JSON.stringify({ v: 1, source, filters }))>
```

- `v: 1` — schema version. Future migrations branch on it.
- Include `source` so a shared link reproduces the exact view (e.g. `liked`, `top-50`, playlist URI). Without source, a recipient sees their own library filtered, which is wrong.

### Write strategy

- Debounced `history.replaceState` at ~250 ms. `replaceState` (not `pushState`) — back button must not step through every filter toggle.
- Empty `filters` array → strip the hash entirely: `history.replaceState(null, '', location.pathname + location.search)`.

### Read strategy

- Read once on `OrganizeScreen` mount via `useFilterUrlSync`.
- Validate: kind in known enum, mode in `include|exclude`, values is `string[]`.
- Source mismatch (URL says `liked`, app state is on `top-50`) → drop filters, keep source from app state. Do not auto-navigate. (Routing-by-URL is deferred.)

### Copy link button

- Small "Copy link" button next to "Save filtered view as playlist".
- Copies `location.href` to clipboard, sonner toast confirms.

## Section 4 — Component changes

### New files

| File | Purpose |
|---|---|
| `src/domain/filters.ts` | Types (`Filter`, `FilterKind`, `FilterMode`, `FilterState`). Pure reducer ops: `toggleValue`, `setMode`, `removeFilter`, `clearAll`, `upsertSearch`. Predicate: `matchesFilters`. |
| `src/domain/filterUrl.ts` | `encodeFilterState(state)`, `decodeFilterState(hashFragment)` with versioning + validation. Returns `null` on invalid input. |
| `src/features/organize/useFilterUrlSync.ts` | Hook: reads hash on mount once, debounced `replaceState` on filter changes, strips hash when filters empty. |
| `src/features/organize/FilterChip.tsx` | One chip + popover (mode toggle pill, value list with remove, clear). Uses shadcn `Popover` + `Badge`. |

### Modified files

| File | Changes |
|---|---|
| `src/features/organize/OrganizeScreen.tsx` | Replace `Filter[]` flat state with `FilterState`. Wire `useFilterUrlSync`. Replace inline chip rendering with `FilterChip`. Pass full `tracks` + selection to Charts. Add "Copy link" button. Lift search state into filters via `upsertSearch`. |
| `src/features/organize/Charts.tsx` | Export expanded `FilterKind` (adds `'search'`, though search has no chart). Accept `tracks` (full) + `selection: Record<FilterKind, string[]>` + `filteredCountsByKind`. Replace `onSelect` with `onToggle(kind, label)`. Render selected `Cell`s with accent fill; non-selected with default. Tooltip shows `filtered/total`. |
| `src/features/organize/TrackTable.tsx` | Search input remains, but `onSearchChange` now upserts a search filter upstream. Internal table filtering removed — receives already-filtered tracks. (Existing prop signature largely preserved.) |
| `src/domain/bucketing.ts` | No change expected. Pure utilities reused as-is. |

### Removed

- `matchesFilter` private helper inside `OrganizeScreen.tsx` — moves to `src/domain/filters.ts` as `matchesFilters` (plural, takes the filters array).

## Section 5 — Edge cases & error handling

### Empty filtered result

- `filteredTracks.length === 0` → table renders empty state: "No tracks match these filters" with a `[Clear all filters]` button.
- Save button stays disabled (existing behavior).
- Charts still render bars from full `tracks` with zero highlights — user can see what's available.

### Malformed URL hash

- `decodeFilterState` returns `null` on: invalid base64, JSON parse error, unknown `v`, kind not in enum, mode not in enum, values not `string[]`.
- On `null` → start with empty filters, fire `toast.warning("Couldn't restore filters from link")`, strip hash. App loads normally.

### Source mismatch on shared link

- URL hash carries `source`. If recipient is on a different source, `OrganizeScreen` only sees its own source. Decision: drop filters, keep current source. Documented limitation; routing-by-URL is a separate spec.

### Search debounce + race

- Typing → debounced `upsertSearch(query)` at ~150 ms.
- No async work; filter computation is synchronous over in-memory tracks (≤5,000). No race conditions.

### Exclude with no values

- Reducer invariant prevents this: filters with `values.length === 0` are dropped. Mode toggle on a single-value filter just flips include↔exclude on that one value.

### Genre "other"

- Existing rule preserved: `label === 'other'` ⇒ `track.genres.length === 0`. Implemented inside `matchesFilter` for `kind === 'genre'`. Multi-select with `'other'` works correctly (e.g. include `['rock', 'other']` = "rock OR no genres").

### Search semantics

- Match against `track.name` and every artist `name`, case-insensitive substring (preserves existing `TrackTable` behavior).
- Exclude mode = no field contains the substring.

### URL length

- Browsers safely accept ~2 kB. Worst realistic case: 15 genre values ≈ ~400 chars encoded. Well under. No truncation logic needed.

### StrictMode double-mount

- `useFilterUrlSync` mount effect reads the hash twice in dev. Read is idempotent (sets state to the same value). No PKCE-style dedupe needed.

## Open questions

None — all design decisions resolved during brainstorming.

## Implementation order (preview, finalized in plan)

1. `src/domain/filters.ts` — types + reducer + predicate. Pure, no UI.
2. Refactor `OrganizeScreen.tsx` to use new state shape (still single-value semantics initially, to keep change reviewable).
3. Enable multi-select via reducer, update `Charts.tsx` selection rendering.
4. Add `FilterChip.tsx` with mode toggle + popover.
5. Lift search into filters (modify `TrackTable.tsx` contract).
6. `src/domain/filterUrl.ts` + `useFilterUrlSync.ts`.
7. "Copy link" button + sonner toast.
8. Empty-result UX polish + clear-all button.

The implementation plan (separate doc) breaks these into reviewable steps with verification gates.
