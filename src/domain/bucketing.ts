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

export function topGenres(tracks: Track[], topN = 15): Set<string> {
  return new Set(
    bucketByGenre(tracks, topN)
      .filter((b) => b.label !== 'other' && b.label !== '(no genre)')
      .map((b) => b.label)
  )
}

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
