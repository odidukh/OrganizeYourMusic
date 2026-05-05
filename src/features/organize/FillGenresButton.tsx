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

type Props = {
  tracks: Track[]
  onTracksUpdate: (next: Track[]) => void
}

type ButtonState =
  | { kind: 'idle' }
  | { kind: 'running'; controller: AbortController; progress: InferenceProgress }
  | { kind: 'done'; filled: number; remaining: number }

export function FillGenresButton({ tracks, onTracksUpdate }: Props) {
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
      toast.message('No artists to process')
      setState({ kind: 'done', filled: 0, remaining: 0 })
      return
    }

    const libraryGenres: string[] = []
    for (const t of current) for (const g of t.genres) libraryGenres.push(g)
    const whitelist = buildWhitelist(libraryGenres)

    try {
      const result = await inferGenres({
        tracks: current,
        candidateArtistIds: candidates,
        whitelist,
        signal: controller.signal,
        onProgress: (progress) =>
          setState((prev) =>
            prev.kind === 'running' ? { ...prev, progress } : prev
          ),
      })
      const next = applyInference(current, result.perArtist)
      onTracksUpdate(next)
      const filled = next.reduce(
        (n, t, i) =>
          t.inferredGenres.length > 0 && current[i].inferredGenres.length === 0
            ? n + 1
            : n,
        0
      )
      const remaining = next.reduce(
        (n, t) => (t.genres.length === 0 && t.inferredGenres.length === 0 ? n + 1 : n),
        0
      )
      setState({ kind: 'done', filled, remaining })
      toast.success(`Filled ${filled} tracks. ${remaining} still unknown.`)
    } catch (err) {
      const partial = applyInference(current, await readPerArtistFromCache(candidates))
      onTracksUpdate(partial)
      if (err instanceof LastfmAbortError) {
        toast.message('Cancelled. Saved partial progress.')
      } else if (err instanceof LastfmFatalError) {
        toast.error(err.message)
      } else {
        toast.error('Genre inference failed')
      }
      setState({ kind: 'idle' })
    }
  }
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
