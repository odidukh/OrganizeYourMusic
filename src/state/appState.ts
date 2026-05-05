import type { Source, ProgressEvent } from '@/domain/sources'
import type { Track } from '@/domain/track'

export type SpotifyUser = {
  id: string
  display_name: string | null
  images?: { url: string }[]
}

export type AppState =
  | { kind: 'unauth' }
  | { kind: 'authCallback'; code: string }
  | { kind: 'picking'; user: SpotifyUser }
  | { kind: 'loading'; source: Source; user: SpotifyUser; progress: ProgressEvent; abort: AbortController }
  | { kind: 'organizing'; source: Source; user: SpotifyUser; tracks: Track[]; truncated: boolean }
  | { kind: 'savingPlaylist'; source: Source; user: SpotifyUser; tracks: Track[]; truncated: boolean }
  | { kind: 'error'; message: string; retry?: () => void }

export type StateSetter = (s: AppState) => void
