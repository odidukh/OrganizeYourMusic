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

export type MatchContext = {
  topGenres: ReadonlySet<string>
}

export function matchesFilters(
  track: Track,
  filters: Filter[],
  ctx?: MatchContext
): boolean {
  return filters.every((f) => matchesFilter(track, f, ctx))
}

function matchesFilter(track: Track, filter: Filter, ctx?: MatchContext): boolean {
  const matched = matchValue(track, filter, ctx)
  return filter.mode === 'include' ? matched : !matched
}

function matchValue(track: Track, filter: Filter, ctx?: MatchContext): boolean {
  switch (filter.kind) {
    case 'decade':
      return filter.values.includes(decadeForYear(track.album.releaseYear))
    case 'genre':
      return filter.values.some((v) => matchGenreValue(track, v, ctx))
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
