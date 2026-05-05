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
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => onToggle('decade', (d as Row).label)}
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
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => onToggle('genre', (d as Row).label)}
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
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => onToggle('duration', (d as Row).label)}
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
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              onClick={(d: any) => onToggle('popularity', (d as Row).label)}
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

// recharts Formatter types are generic; payload shape is untyped — any is intentional
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tooltipFormatter(value: any, _name: any, item: any): [string, string] {
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
