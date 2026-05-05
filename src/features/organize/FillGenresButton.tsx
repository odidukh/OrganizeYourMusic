import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { isConfigured, LastfmAbortError, LastfmFatalError } from '@/api/lastfm'
import {
  applyInference,
  candidateArtistIds,
  inferGenres,
  type InferenceProgress,
} from '@/domain/genreInference'
import { buildWhitelist } from '@/domain/genreWhitelist'
import type { Track } from '@/domain/track'

export type LastRun = {
  tracks: Track[]
  previousByTrackId: Map<string, Set<string>>
  running: InferenceProgress | null
}

type Props = {
  tracks: Track[]
  onTracksUpdate: (next: Track[]) => void
  onLastRunChange?: (run: LastRun | null) => void
}

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'running'; controller: AbortController; progress: InferenceProgress }
  | { kind: 'done'; filled: number; remaining: number }

export function FillGenresButton({ tracks, onTracksUpdate, onLastRunChange }: Props) {
  const [state, setState] = useState<ButtonState>({ kind: 'idle' })
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  useEffect(() => {
    if (state.kind !== 'done') return
    const t = setTimeout(() => setState({ kind: 'idle' }), 4000)
    return () => clearTimeout(t)
  }, [state])

  if (!isConfigured()) {
    return (
      <Button variant="outline" disabled title="Genre inference not configured">
        Fill missing genres
      </Button>
    )
  }

  if (state.kind === 'running') {
    return (
      <Button
        variant="outline"
        onClick={() => state.controller.abort()}
      >
        Cancel ({state.progress.done}/{state.progress.total})
      </Button>
    )
  }

  if (state.kind === 'done') {
    return (
      <Button variant="outline" disabled>
        Filled {state.filled} ✓
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      onClick={() => start()}
      title="Enrich genres via Last.fm"
    >
      Fill missing genres
    </Button>
  )

  async function start() {
    const controller = new AbortController()
    const initial: InferenceProgress = { done: 0, total: 0 }
    setState({ kind: 'running', controller, progress: initial })

    const current = tracksRef.current
    const candidates = candidateArtistIds(current)
    if (candidates.length === 0) {
      onLastRunChange?.(null)
      toast.message('No artists to process')
      setState({ kind: 'done', filled: 0, remaining: 0 })
      return
    }

    const previousByTrackId = new Map<string, Set<string>>()
    for (const t of current) previousByTrackId.set(t.id, new Set(t.inferredGenres))

    const libraryGenres: string[] = []
    for (const t of current) for (const g of t.genres) libraryGenres.push(g)
    const whitelist = buildWhitelist(libraryGenres)

    let liveProgress: InferenceProgress = { done: 0, total: candidates.length }
    let liveFilled: Track[] = []
    let stillRunning = true

    const emit = () =>
      onLastRunChange?.({
        tracks: liveFilled,
        previousByTrackId,
        running: stillRunning ? liveProgress : null,
      })

    emit()

    try {
      const result = await inferGenres({
        tracks: current,
        candidateArtistIds: candidates,
        whitelist,
        signal: controller.signal,
        onProgress: (progress) => {
          liveProgress = progress
          setState((prev) =>
            prev.kind === 'running' ? { ...prev, progress } : prev
          )
          emit()
        },
        onPartial: (perArtist) => {
          const partial = applyInference(current, perArtist)
          liveFilled = diffFilled(partial, previousByTrackId)
          emit()
        },
      })
      const next = applyInference(current, result.perArtist)
      onTracksUpdate(next)
      const filledTracks = diffFilled(next, previousByTrackId)
      const remaining = next.reduce(
        (n, t) => (t.genres.length === 0 && t.inferredGenres.length === 0 ? n + 1 : n),
        0
      )
      setState({ kind: 'done', filled: filledTracks.length, remaining })
      liveFilled = filledTracks
      stillRunning = false
      emit()
      toast.success(`Filled ${filledTracks.length} tracks. ${remaining} still unknown.`)
    } catch (err) {
      const partial = applyInference(current, await readPerArtistFromCache(candidates))
      onTracksUpdate(partial)
      const filledTracks = diffFilled(partial, previousByTrackId)
      liveFilled = filledTracks
      stillRunning = false
      emit()
      if (err instanceof LastfmAbortError) {
        toast.message(`Cancelled. ${filledTracks.length} tracks enriched before stop.`)
      } else if (err instanceof LastfmFatalError) {
        toast.error(err.message)
      } else {
        toast.error('Genre inference failed')
      }
      setState({ kind: 'idle' })
    }
  }
}

function diffFilled(
  next: Track[],
  previousByTrackId: ReadonlyMap<string, ReadonlySet<string>>
): Track[] {
  return next.filter((t) => {
    const prev = previousByTrackId.get(t.id) ?? new Set<string>()
    return t.inferredGenres.some((g) => !prev.has(g))
  })
}

async function readPerArtistFromCache(
  candidateIds: string[]
): Promise<Map<string, string[]>> {
  const { read } = await import('@/domain/inferenceCache')
  const cached = read()
  const out = new Map<string, string[]>()
  for (const id of candidateIds) {
    const v = cached[id]
    if (v) out.set(id, v)
  }
  return out
}
