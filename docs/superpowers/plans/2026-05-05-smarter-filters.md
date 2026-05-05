# Smarter Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat single-value filter model with a multi-select + exclude + URL-shareable filter system; make text search a first-class filter.

**Architecture:** Pure data-model change in `src/domain/filters.ts` (typed reducer + predicate). UI in `src/features/organize/` consumes the new state via thin hooks. URL state lives in the hash fragment to avoid colliding with Spotify PKCE query params. Charts switch baseline from filtered to full set with selection highlighting. No tests — project has no runner wired (CLAUDE.md). Verification = `tsc -b`, `npm run lint`, manual browser smoke at `http://127.0.0.1:8000/OrganizeYourMusic/`.

**Tech Stack:** React 18 + TypeScript, Vite 5, Tailwind 3, shadcn/ui (Radix), Recharts, sonner, `@tanstack/react-virtual`. Adds `@radix-ui/react-popover`.

**Spec:** `docs/superpowers/specs/2026-05-05-smarter-filters-design.md`

---

## File Map

**New:**
- `src/domain/filters.ts` — types, reducer ops, predicate
- `src/domain/filterUrl.ts` — encode/decode hash fragment with versioning + validation
- `src/features/organize/useFilterUrlSync.ts` — hook: read hash on mount, debounced `replaceState`
- `src/features/organize/FilterChip.tsx` — chip with popover (mode toggle, value list, clear)
- `src/components/ui/popover.tsx` — shadcn Popover wrapper

**Modified:**
- `src/features/organize/OrganizeScreen.tsx` — switch to `FilterState`, wire URL sync, lift search, copy-link button, empty-result state
- `src/features/organize/Charts.tsx` — accept full `tracks` + selection, render highlights, baseline switch, tooltip
- `src/features/organize/TrackTable.tsx` — drop internal debounce + filter; receive already-filtered tracks
- `package.json` — add `@radix-ui/react-popover`

---

## Task 1: Add filter domain module

**Files:**
- Create: `src/domain/filters.ts`

- [ ] **Step 1: Create `src/domain/filters.ts`**

```ts
import type { Track } from './track'
import {
  decadeForYear,
  durationBucketLabel,
  popularityBucketLabel,
} from './bucketing'

export type FilterKind = 'decade' | 'genre' | 'duration' | 'popularity' | 'search'
export type FilterMode = 'include' | 'exclude'

export type Filter = {
  kind: FilterKind
  mode: FilterMode
  values: string[]
}

export type FilterState = {
  filters: Filter[]
}

export const emptyFilterState: FilterState = { filters: [] }

export function getFilter(state: FilterState, kind: FilterKind): Filter | undefined {
  return state.filters.find((f) => f.kind === kind)
}

export function selectedValues(state: FilterState, kind: FilterKind): string[] {
  return getFilter(state, kind)?.values ?? []
}

export function getMode(state: FilterState, kind: FilterKind): FilterMode {
  return getFilter(state, kind)?.mode ?? 'include'
}

export function toggleValue(
  state: FilterState,
  kind: FilterKind,
  value: string
): FilterState {
  const existing = getFilter(state, kind)
  if (!existing) {
    return {
      filters: [...state.filters, { kind, mode: 'include', values: [value] }],
    }
  }
  const has = existing.values.includes(value)
  const nextValues = has
    ? existing.values.filter((v) => v !== value)
    : [...existing.values, value]
  if (nextValues.length === 0) {
    return { filters: state.filters.filter((f) => f.kind !== kind) }
  }
  return {
    filters: state.filters.map((f) =>
      f.kind === kind ? { ...f, values: nextValues } : f
    ),
  }
}

export function setMode(
  state: FilterState,
  kind: FilterKind,
  mode: FilterMode
): FilterState {
  return {
    filters: state.filters.map((f) => (f.kind === kind ? { ...f, mode } : f)),
  }
}

export function removeValue(
  state: FilterState,
  kind: FilterKind,
  value: string
): FilterState {
  const existing = getFilter(state, kind)
  if (!existing) return state
  const nextValues = existing.values.filter((v) => v !== value)
  if (nextValues.length === 0) {
    return { filters: state.filters.filter((f) => f.kind !== kind) }
  }
  return {
    filters: state.filters.map((f) =>
      f.kind === kind ? { ...f, values: nextValues } : f
    ),
  }
}

export function removeFilter(state: FilterState, kind: FilterKind): FilterState {
  return { filters: state.filters.filter((f) => f.kind !== kind) }
}

export function clearAll(): FilterState {
  return emptyFilterState
}

export function upsertSearch(state: FilterState, query: string): FilterState {
  const trimmed = query.trim()
  if (trimmed.length === 0) return removeFilter(state, 'search')
  const existing = getFilter(state, 'search')
  if (!existing) {
    return {
      filters: [
        ...state.filters,
        { kind: 'search', mode: 'include', values: [trimmed] },
      ],
    }
  }
  return {
    filters: state.filters.map((f) =>
      f.kind === 'search' ? { ...f, values: [trimmed] } : f
    ),
  }
}

export function matchesFilters(track: Track, filters: Filter[]): boolean {
  return filters.every((f) => matchesFilter(track, f))
}

function matchesFilter(track: Track, filter: Filter): boolean {
  const matched = matchValue(track, filter)
  return filter.mode === 'include' ? matched : !matched
}

function matchValue(track: Track, filter: Filter): boolean {
  switch (filter.kind) {
    case 'decade':
      return filter.values.includes(decadeForYear(track.album.releaseYear))
    case 'genre':
      return filter.values.some((v) =>
        v === 'other' ? track.genres.length === 0 : track.genres.includes(v)
      )
    case 'duration':
      return filter.values.includes(durationBucketLabel(track.durationMs))
    case 'popularity':
      return filter.values.includes(popularityBucketLabel(track.popularity))
    case 'search': {
      const q = (filter.values[0] ?? '').toLowerCase()
      if (!q) return true
      if (track.name.toLowerCase().includes(q)) return true
      return track.artistNames.some((a) => a.toLowerCase().includes(q))
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0, no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint -- src/domain/filters.ts`
Expected: no warnings or errors.

- [ ] **Step 4: Commit**

```bash
git add src/domain/filters.ts
git commit -m "feat(filters): add filter domain module"
```

---

## Task 2: Wire OrganizeScreen to FilterState (multi-select via reducer)

**Files:**
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Replace `OrganizeScreen.tsx` contents**

```tsx
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Charts } from './Charts'
import { TrackTable } from './TrackTable'
import { SavePlaylistDialog } from './SavePlaylistDialog'
import { sourceLabel, type Source } from '@/domain/sources'
import {
  emptyFilterState,
  matchesFilters,
  removeFilter,
  toggleValue,
  type FilterKind,
  type FilterState,
} from '@/domain/filters'
import type { Track } from '@/domain/track'
import type { SpotifyUser } from '@/state/appState'

type Props = {
  user: SpotifyUser
  source: Source
  tracks: Track[]
  truncated: boolean
  onBack: () => void
}

export function OrganizeScreen({ user, source, tracks, truncated, onBack }: Props) {
  const [state, setState] = useState<FilterState>(emptyFilterState)
  const [search, setSearch] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)

  const filteredTracks = useMemo(
    () => (state.filters.length === 0 ? tracks : tracks.filter((t) => matchesFilters(t, state.filters))),
    [tracks, state]
  )

  function onToggle(kind: FilterKind, value: string) {
    setState((prev) => toggleValue(prev, kind, value))
  }

  function onRemoveFilter(kind: FilterKind) {
    setState((prev) => removeFilter(prev, kind))
  }

  const summary =
    state.filters.length === 0
      ? ''
      : ' — ' +
        state.filters
          .map((f) => `${f.kind}${f.mode === 'exclude' ? '≠' : ':'}${f.values.join('/')}`)
          .join(', ')
  const defaultName = `Organized: ${sourceLabel(source)}${summary}`

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

      {state.filters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {state.filters.map((f) => (
            <Badge
              key={f.kind}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => onRemoveFilter(f.kind)}
            >
              {f.kind}
              {f.mode === 'exclude' ? ' ≠ ' : ': '}
              {f.values.join(', ')} ×
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0">
          <Charts tracks={filteredTracks} onSelect={onToggle} />
        </div>
        <div className="flex flex-col h-[70vh] min-w-0">
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0. Any error about `FilterKind` import in `Charts.tsx` is OK — Charts still re-exports its own `FilterKind` and `onSelect` signature is unchanged so it still typechecks.

- [ ] **Step 3: Run dev server and smoke test**

Run: `npm run dev`
Open: `http://127.0.0.1:8000/OrganizeYourMusic/`
- Log in, pick any source, wait for load.
- Click a decade slice, click another decade slice → both should be selected (chip shows `decade: 1970s, 1980s ×`).
- Click an already-selected decade → it leaves the chip.
- Click `×` on chip → filter clears.
- Confirm table count updates.

Stop dev server with Ctrl+C when done.

- [ ] **Step 4: Lint**

Run: `npm run lint -- src/features/organize/OrganizeScreen.tsx`
Expected: no warnings or errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): switch OrganizeScreen to FilterState with multi-select"
```

---

## Task 3: Charts baseline switch + selection highlighting + tooltip

**Files:**
- Modify: `src/features/organize/Charts.tsx`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Replace `Charts.tsx` contents**

This rewrite uses recharts v3's per-datum `fill` pattern (each row carries its own `fill` field) rather than `<Cell>` children. `<Cell>` is `@deprecated` in recharts 3 — embedding `fill` per row eliminates the warning and is also cleaner.

```tsx
import { useMemo } from 'react'
import {
  Bar,
  BarChart,
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
  decadeForYear,
  durationBucketLabel,
  popularityBucketLabel,
} from '@/domain/bucketing'
import type { FilterKind } from '@/domain/filters'

const PIE_COLORS = [
  '#1DB954', '#1ED760', '#5DADE2', '#F39C12', '#E74C3C',
  '#9B59B6', '#16A085', '#F1C40F', '#34495E', '#7F8C8D',
]
const UNSELECTED_FILL = '#1f2937'
const GENRE_FILL = '#1DB954'
const DURATION_FILL = '#5DADE2'
const POPULARITY_FILL = '#F39C12'

type ChartKind = Exclude<FilterKind, 'search'>

type Props = {
  tracks: Track[]
  filtered: Track[]
  selection: Partial<Record<ChartKind, string[]>>
  onToggle: (kind: ChartKind, label: string) => void
}

type Row = { label: string; total: number; matched: number; fill: string }

export function Charts({ tracks, filtered, selection, onToggle }: Props) {
  const decadeRows = useMemo(
    () =>
      withFills(
        mergeCounts(bucketByDecade(tracks), filtered, (t) => decadeForYear(t.album.releaseYear)),
        selection.decade ?? [],
        (_r, i) => PIE_COLORS[i % PIE_COLORS.length]
      ),
    [tracks, filtered, selection.decade]
  )
  const genreRows = useMemo(
    () =>
      withFills(
        mergeGenreCounts(bucketByGenre(tracks, 15), filtered),
        selection.genre ?? [],
        () => GENRE_FILL
      ),
    [tracks, filtered, selection.genre]
  )
  const durationRows = useMemo(
    () =>
      withFills(
        mergeCounts(bucketByDuration(tracks), filtered, (t) => durationBucketLabel(t.durationMs)),
        selection.duration ?? [],
        () => DURATION_FILL
      ),
    [tracks, filtered, selection.duration]
  )
  const popularityRows = useMemo(
    () =>
      withFills(
        mergeCounts(bucketByPopularity(tracks), filtered, (t) => popularityBucketLabel(t.popularity)),
        selection.popularity ?? [],
        () => POPULARITY_FILL
      ),
    [tracks, filtered, selection.popularity]
  )

  return (
    <div className="grid grid-cols-1 gap-6">
      <ChartCard title="By decade">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={decadeRows}
              dataKey="total"
              nameKey="label"
              outerRadius={80}
              label
              cursor="pointer"
              onClick={(d: any) => onToggle('decade', d.label)}
            />
            <Tooltip formatter={tooltipFormatter} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top genres">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={genreRows} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" />
            <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11 }} />
            <Tooltip formatter={tooltipFormatter} />
            <Bar
              dataKey="total"
              cursor="pointer"
              onClick={(d: any) => onToggle('genre', d.label)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By duration">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={durationRows}>
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={tooltipFormatter} />
            <Bar
              dataKey="total"
              cursor="pointer"
              onClick={(d: any) => onToggle('duration', d.label)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="By popularity">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={popularityRows}>
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip formatter={tooltipFormatter} />
            <Bar
              dataKey="total"
              cursor="pointer"
              onClick={(d: any) => onToggle('popularity', d.label)}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

function withFills(
  rows: { label: string; total: number; matched: number }[],
  selected: string[],
  baseFor: (r: { label: string }, i: number) => string
): Row[] {
  return rows.map((r, i) => {
    const base = baseFor(r, i)
    const fill = selected.length === 0 || selected.includes(r.label) ? base : UNSELECTED_FILL
    return { ...r, fill }
  })
}

function tooltipFormatter(value: any, _name: string, item: any): [string, string] {
  const matched = item?.payload?.matched ?? value
  return [`${matched} / ${value}`, 'matched / total']
}

function mergeCounts(
  buckets: { label: string; count: number }[],
  filtered: Track[],
  pickLabel: (t: Track) => string
): { label: string; total: number; matched: number }[] {
  const matchedByLabel = new Map<string, number>()
  for (const t of filtered) {
    const lbl = pickLabel(t)
    matchedByLabel.set(lbl, (matchedByLabel.get(lbl) ?? 0) + 1)
  }
  return buckets.map((b) => ({
    label: b.label,
    total: b.count,
    matched: matchedByLabel.get(b.label) ?? 0,
  }))
}

function mergeGenreCounts(
  buckets: { label: string; count: number }[],
  filtered: Track[]
): { label: string; total: number; matched: number }[] {
  const matchedByLabel = new Map<string, number>()
  for (const t of filtered) {
    if (t.genres.length === 0) {
      matchedByLabel.set('(no genre)', (matchedByLabel.get('(no genre)') ?? 0) + 1)
      continue
    }
    for (const g of t.genres) {
      matchedByLabel.set(g, (matchedByLabel.get(g) ?? 0) + 1)
    }
  }
  return buckets.map((b) => ({
    label: b.label,
    total: b.count,
    matched: matchedByLabel.get(b.label) ?? 0,
  }))
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

- [ ] **Step 2: Update OrganizeScreen to pass new props**

Edit `src/features/organize/OrganizeScreen.tsx`. Replace this line:

```tsx
        <div className="min-w-0">
          <Charts tracks={filteredTracks} onSelect={onToggle} />
        </div>
```

With:

```tsx
        <div className="min-w-0">
          <Charts
            tracks={tracks}
            filtered={filteredTracks}
            selection={{
              decade: selectedFor(state, 'decade'),
              genre: selectedFor(state, 'genre'),
              duration: selectedFor(state, 'duration'),
              popularity: selectedFor(state, 'popularity'),
            }}
            onToggle={onToggle}
          />
        </div>
```

And add this helper at the top of the file (under existing imports):

```tsx
import { selectedValues as selectedFor } from '@/domain/filters'
```

(Replace the existing `import { ..., selectedValues, ... }` if you need the alias; otherwise add the named import. The remaining imports from `@/domain/filters` stay as-is.)

Also update the `import { Charts } from './Charts'` line — no change needed; the import is unchanged. Remove the `FilterKind` re-import from `./Charts` if any other file pulled it from there (none currently do).

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`
Open: `http://127.0.0.1:8000/OrganizeYourMusic/`
- Bars/slices should keep their full-set heights when filtering. Selected bars are colored, unselected dim grey.
- Hover a bar → tooltip shows `matched / total`.
- With no filter, all bars show their original color.

Stop dev server.

- [ ] **Step 5: Lint**

Run: `npm run lint -- src/features/organize/Charts.tsx src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/features/organize/Charts.tsx src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): chart baseline switch + selection highlight + tooltip"
```

---

## Task 4: Add @radix-ui/react-popover dependency and shadcn wrapper

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/ui/popover.tsx`

- [ ] **Step 1: Install Popover primitive**

Run: `npm install @radix-ui/react-popover@^1.1.2`
Expected: package added, lockfile updated.

- [ ] **Step 2: Create `src/components/ui/popover.tsx`**

```tsx
import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'

import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/ui/popover.tsx
git commit -m "feat(ui): add Popover primitive"
```

---

## Task 5: FilterChip component (mode toggle + value list + clear)

**Files:**
- Create: `src/features/organize/FilterChip.tsx`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Create `src/features/organize/FilterChip.tsx`**

```tsx
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Filter, FilterKind, FilterMode } from '@/domain/filters'

const VISIBLE_VALUES = 2

type Props = {
  filter: Filter
  onSetMode: (kind: FilterKind, mode: FilterMode) => void
  onRemoveValue: (kind: FilterKind, value: string) => void
  onRemove: (kind: FilterKind) => void
}

export function FilterChip({ filter, onSetMode, onRemoveValue, onRemove }: Props) {
  const head = filter.values.slice(0, VISIBLE_VALUES).join(', ')
  const overflow = filter.values.length - VISIBLE_VALUES
  const summary = overflow > 0 ? `${head}, +${overflow}` : head
  const sep = filter.mode === 'exclude' ? ' ≠ ' : ': '
  const variant = filter.mode === 'exclude' ? 'destructive' : 'secondary'

  return (
    <Popover>
      <div className="flex items-center gap-0">
        <PopoverTrigger asChild>
          <Badge variant={variant} className="cursor-pointer rounded-r-none">
            {filter.kind}
            {sep}
            {summary}
          </Badge>
        </PopoverTrigger>
        <Badge
          variant={variant}
          className="cursor-pointer rounded-l-none border-l border-background/40"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(filter.kind)
          }}
          aria-label={`Remove ${filter.kind} filter`}
        >
          ×
        </Badge>
      </div>
      <PopoverContent align="start" className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize">{filter.kind}</span>
          <div className="flex rounded-md border text-xs">
            <button
              className={`px-2 py-1 ${filter.mode === 'include' ? 'bg-secondary' : ''}`}
              onClick={() => onSetMode(filter.kind, 'include')}
            >
              Include
            </button>
            <button
              className={`px-2 py-1 ${filter.mode === 'exclude' ? 'bg-secondary' : ''}`}
              onClick={() => onSetMode(filter.kind, 'exclude')}
            >
              Exclude
            </button>
          </div>
        </div>
        <ul className="max-h-48 space-y-1 overflow-auto">
          {filter.values.map((v) => (
            <li key={v} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{v}</span>
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
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onRemove(filter.kind)}
        >
          Clear filter
        </Button>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Update OrganizeScreen to render `FilterChip` and pass new handlers**

Edit `src/features/organize/OrganizeScreen.tsx`.

Update the imports from `@/domain/filters`:

```tsx
import {
  emptyFilterState,
  matchesFilters,
  removeFilter,
  removeValue,
  selectedValues as selectedFor,
  setMode,
  toggleValue,
  type FilterKind,
  type FilterMode,
  type FilterState,
} from '@/domain/filters'
```

Add `FilterChip` import:

```tsx
import { FilterChip } from './FilterChip'
```

Replace the chip-rendering block:

```tsx
      {state.filters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {state.filters.map((f) => (
            <Badge ... />
          ))}
        </div>
      )}
```

With:

```tsx
      {state.filters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {state.filters.map((f) => (
            <FilterChip
              key={f.kind}
              filter={f}
              onSetMode={(kind, mode) => setState((p) => setMode(p, kind, mode))}
              onRemoveValue={(kind, v) => setState((p) => removeValue(p, kind, v))}
              onRemove={onRemoveFilter}
            />
          ))}
        </div>
      )}
```

Remove the now-unused `Badge` import from `OrganizeScreen.tsx`:

```tsx
// delete this line:
import { Badge } from '@/components/ui/badge'
```

(`Badge` is still used inside `FilterChip.tsx` — that import already exists there.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`
- Click chip body → popover opens with mode toggle, value list, clear button.
- Toggle Exclude → chip changes color/symbol; track count updates correctly (excluded values now removed from results).
- Click `×` next to a value in popover → that value drops; if last value, whole chip disappears.
- Click chip's right `×` → whole filter removed.

- [ ] **Step 5: Lint**

Run: `npm run lint -- src/features/organize/FilterChip.tsx src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/features/organize/FilterChip.tsx src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): FilterChip with mode toggle and value popover"
```

---

## Task 6: Lift search into FilterState

**Files:**
- Modify: `src/features/organize/TrackTable.tsx`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Simplify `TrackTable.tsx` — drop internal debounce + filter**

Replace the contents of `src/features/organize/TrackTable.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
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

  const sorted = useMemo(() => {
    if (!sortKey) return tracks
    const arr = [...tracks]
    arr.sort((a, b) => {
      const av = pickSortValue(a, sortKey)
      const bv = pickSortValue(b, sortKey)
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return arr
  }, [tracks, sortKey, sortDir])

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

- [ ] **Step 2: Move debounce + upsertSearch into OrganizeScreen**

Edit `src/features/organize/OrganizeScreen.tsx`.

Add to the imports from `@/domain/filters`:

```tsx
import {
  // … existing imports
  upsertSearch,
} from '@/domain/filters'
```

Add `useEffect` to React imports:

```tsx
import { useEffect, useMemo, useState } from 'react'
```

After the `const [search, setSearch] = useState('')` line, add a debounce effect:

```tsx
  useEffect(() => {
    const t = setTimeout(() => {
      setState((prev) => upsertSearch(prev, search))
    }, 150)
    return () => clearTimeout(t)
  }, [search])
```

Note: `search` is the input's controlled value (immediate). The `state` carries the debounced version as a `kind: 'search'` filter. `filteredTracks` uses `state` already, so no other change to the filtering pipeline.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`
- Type in search box → after ~150 ms, a `search: <term>` chip appears in the chip row, and table count drops.
- Open the search chip's popover → toggle Exclude → only tracks NOT containing the term remain.
- Clear the input → search chip disappears.
- Combine with a decade filter → AND semantics: tracks must match decade AND search.

- [ ] **Step 5: Lint**

Run: `npm run lint -- src/features/organize/TrackTable.tsx src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/features/organize/TrackTable.tsx src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): lift search into FilterState"
```

---

## Task 7: URL state — encode/decode + sync hook

**Files:**
- Create: `src/domain/filterUrl.ts`
- Create: `src/features/organize/useFilterUrlSync.ts`
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Create `src/domain/filterUrl.ts`**

```ts
import type { FilterKind, FilterMode, FilterState } from './filters'

const VERSION = 1

const KNOWN_KINDS: ReadonlySet<FilterKind> = new Set([
  'decade',
  'genre',
  'duration',
  'popularity',
  'search',
])

const KNOWN_MODES: ReadonlySet<FilterMode> = new Set(['include', 'exclude'])

type Encoded = {
  v: number
  source: string
  filters: { kind: FilterKind; mode: FilterMode; values: string[] }[]
}

export function encodeFilterState(sourceKey: string, state: FilterState): string {
  const payload: Encoded = {
    v: VERSION,
    source: sourceKey,
    filters: state.filters.map((f) => ({
      kind: f.kind,
      mode: f.mode,
      values: f.values,
    })),
  }
  const json = JSON.stringify(payload)
  return base64UrlEncode(json)
}

export type DecodedFilterUrl = { source: string; state: FilterState }

export function decodeFilterState(token: string): DecodedFilterUrl | null {
  try {
    const json = base64UrlDecode(token)
    const parsed = JSON.parse(json) as unknown
    if (!isEncoded(parsed)) return null
    if (parsed.v !== VERSION) return null
    return { source: parsed.source, state: { filters: parsed.filters } }
  } catch {
    return null
  }
}

function isEncoded(x: unknown): x is Encoded {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.v !== 'number') return false
  if (typeof o.source !== 'string') return false
  if (!Array.isArray(o.filters)) return false
  for (const f of o.filters) {
    if (!f || typeof f !== 'object') return false
    const fo = f as Record<string, unknown>
    if (typeof fo.kind !== 'string' || !KNOWN_KINDS.has(fo.kind as FilterKind)) return false
    if (typeof fo.mode !== 'string' || !KNOWN_MODES.has(fo.mode as FilterMode)) return false
    if (!Array.isArray(fo.values)) return false
    if (!fo.values.every((v) => typeof v === 'string')) return false
  }
  return true
}

function base64UrlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return decodeURIComponent(escape(atob(padded)))
}
```

- [ ] **Step 2: Create `src/features/organize/useFilterUrlSync.ts`**

```ts
import { useEffect, useRef } from 'react'
import { decodeFilterState, encodeFilterState } from '@/domain/filterUrl'
import { emptyFilterState, type FilterState } from '@/domain/filters'

const HASH_PREFIX = '#f='
const WRITE_DEBOUNCE_MS = 250

type Args = {
  sourceKey: string
  state: FilterState
  onRestore: (state: FilterState) => void
  onRestoreFailure: () => void
}

export function useFilterUrlSync({ sourceKey, state, onRestore, onRestoreFailure }: Args): void {
  const initialReadDone = useRef(false)

  useEffect(() => {
    if (initialReadDone.current) return
    initialReadDone.current = true
    const hash = window.location.hash
    if (!hash.startsWith(HASH_PREFIX)) return
    const token = hash.slice(HASH_PREFIX.length)
    const decoded = decodeFilterState(token)
    if (!decoded) {
      stripHash()
      onRestoreFailure()
      return
    }
    if (decoded.source !== sourceKey) {
      stripHash()
      return
    }
    onRestore(decoded.state)
  }, [sourceKey, onRestore, onRestoreFailure])

  useEffect(() => {
    const t = setTimeout(() => {
      if (state.filters.length === 0) {
        stripHash()
        return
      }
      const token = encodeFilterState(sourceKey, state)
      const next = `${window.location.pathname}${window.location.search}${HASH_PREFIX}${token}`
      window.history.replaceState(null, '', next)
    }, WRITE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [sourceKey, state])
}

function stripHash(): void {
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  )
}
```

- [ ] **Step 3: Wire `useFilterUrlSync` into OrganizeScreen**

Edit `src/features/organize/OrganizeScreen.tsx`.

Add imports:

```tsx
import { toast } from 'sonner'
import { useFilterUrlSync } from './useFilterUrlSync'
```

Add a stable `sourceKey` derivation. Place this right after the `Props` destructuring inside the component:

```tsx
  const sourceKey = useMemo(() => sourceKeyOf(source), [source])
```

Add this helper at the bottom of the file (outside the component):

```tsx
function sourceKeyOf(source: Source): string {
  switch (source.type) {
    case 'saved':
      return 'saved'
    case 'added':
      return 'added'
    case 'follow':
      return 'follow'
    case 'all':
      return 'all'
    case 'playlist':
      return `playlist:${source.id}`
  }
}
```

The `Source` discriminator is `type` (see `src/domain/sources.ts`). The switch is exhaustive — TypeScript will flag it if a new source variant is added later.

Wire the hook (place inside the component, after `setState` is declared):

```tsx
  useFilterUrlSync({
    sourceKey,
    state,
    onRestore: setState,
    onRestoreFailure: () =>
      toast.warning("Couldn't restore filters from link"),
  })
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: exit 0. If the `sourceKeyOf` switch is non-exhaustive for your `Source` union, TypeScript will tell you which case is missing — fix accordingly.

- [ ] **Step 5: Smoke test**

Run: `npm run dev`
- Apply some filters (e.g. decade=80s, genre=rock). Watch the URL hash update to `#f=...` after ~250 ms.
- Reload the page → filters restore.
- Clear all filters → hash disappears from URL.
- Manually edit hash to junk (e.g. `#f=garbage`) and reload → filters empty, sonner warning toast appears.
- Switch to a different source (e.g. liked → recently-played) with a hash from the previous source → filters drop, no toast.

- [ ] **Step 6: Lint**

Run: `npm run lint -- src/domain/filterUrl.ts src/features/organize/useFilterUrlSync.ts src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/domain/filterUrl.ts src/features/organize/useFilterUrlSync.ts src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): URL hash sync with versioning + validation"
```

---

## Task 8: Copy-link button

**Files:**
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Add Copy link button next to Save button**

Edit `src/features/organize/OrganizeScreen.tsx`. Replace this block:

```tsx
          <div className="flex items-center justify-between pt-3 mt-3 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()}
            </span>
            <Button onClick={() => setSaveOpen(true)} disabled={filteredTracks.length === 0}>
              Save filtered view as playlist
            </Button>
          </div>
```

With:

```tsx
          <div className="flex items-center justify-between pt-3 mt-3 border-t gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()}
            </span>
            <div className="flex gap-2">
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
          </div>
```

(`toast` is already imported from Task 7. If somehow not, add `import { toast } from 'sonner'`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
- Apply a filter, click Copy link → toast confirms. Paste in a new tab → loads same view.
- With no filters, button is disabled.

- [ ] **Step 4: Lint**

Run: `npm run lint -- src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): copy shareable link button"
```

---

## Task 9: Empty result state + clear-all button

**Files:**
- Modify: `src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 1: Render an empty-state when no tracks match**

Edit `src/features/organize/OrganizeScreen.tsx`.

Add `clearAll` to the imports from `@/domain/filters`:

```tsx
import {
  // … existing
  clearAll,
} from '@/domain/filters'
```

Replace the `<TrackTable ... />` line and its surrounding container with a conditional:

```tsx
        <div className="flex flex-col h-[70vh] min-w-0">
          {filteredTracks.length === 0 && state.filters.length > 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded border border-dashed text-center p-6">
              <p className="text-sm text-muted-foreground">
                No tracks match these filters.
              </p>
              <Button variant="outline" onClick={() => setState(clearAll())}>
                Clear all filters
              </Button>
            </div>
          ) : (
            <TrackTable tracks={filteredTracks} search={search} onSearchChange={setSearch} />
          )}
          <div className="flex items-center justify-between pt-3 mt-3 border-t gap-2">
            <span className="text-sm text-muted-foreground">
              Showing {filteredTracks.length.toLocaleString()} of {tracks.length.toLocaleString()}
            </span>
            <div className="flex gap-2">
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
          </div>
        </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
- Apply filters that match nothing (e.g. exclude every genre). Empty state appears with Clear button. Save button stays disabled.
- Click Clear all filters → state resets, table reappears.

- [ ] **Step 4: Lint**

Run: `npm run lint -- src/features/organize/OrganizeScreen.tsx`

- [ ] **Step 5: Final full build**

Run: `npm run build`
Expected: exit 0. tsc + vite both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/features/organize/OrganizeScreen.tsx
git commit -m "feat(filters): empty result state with clear-all"
```

---

## Final verification

- [ ] **Run full lint**

```bash
npm run lint
```

- [ ] **Run full build**

```bash
npm run build
```

- [ ] **End-to-end smoke**

Run `npm run dev`. With a real Spotify account, walk through the spec scenarios:

1. Multi-select a kind (decade=70s+80s).
2. Toggle exclude on genre filter.
3. Type a search term — verify search chip appears and combines correctly.
4. Use Copy link → open in incognito or new tab → verify view restores.
5. Apply impossible filter set → empty state + Clear all works.
6. Save the filtered set as a playlist (existing flow) → works as before.

If all six pass, the feature is done.
