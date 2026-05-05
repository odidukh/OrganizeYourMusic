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

export async function createPlaylist(
  userId: string,
  name: string,
  isPublic: boolean
): Promise<{ id: string; external_urls: { spotify: string } }> {
  return spotifyFetch(`/users/${userId}/playlists`, {
    method: 'POST',
    body: { name, public: isPublic, description: 'Created with Organize Your Music' },
  })
}

export async function addTracksToPlaylist(playlistId: string, trackUris: string[]): Promise<void> {
  for (let i = 0; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100)
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: { uris: chunk },
    })
  }
}
