import { useQuery } from '@tanstack/react-query'
import { spotifyFetch } from './spotifyClient'
import type { SpotifyUser } from '@/state/appState'

export function useCurrentUser(enabled: boolean) {
  return useQuery<SpotifyUser>({
    queryKey: ['me'],
    queryFn: () => spotifyFetch<SpotifyUser>('/me'),
    enabled,
  })
}
