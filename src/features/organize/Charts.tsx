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
