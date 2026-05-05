import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SpotifyUser } from '@/state/appState'
import { parsePlaylistInput, type Source } from '@/domain/sources'

type CollectionType = 'saved' | 'added' | 'follow' | 'all' | 'playlist'

type Props = {
  user: SpotifyUser
  onOrganize: (source: Source) => void
  onLogout: () => void
}

export function PickerScreen({ user, onOrganize, onLogout }: Props) {
  const [collectionType, setCollectionType] = useState<CollectionType>('saved')
  const [playlistInput, setPlaylistInput] = useState('')
  const [playlistError, setPlaylistError] = useState<string | null>(null)

  function handleOrganize() {
    if (collectionType === 'playlist') {
      const id = parsePlaylistInput(playlistInput)
      if (!id) {
        setPlaylistError("Could not parse a playlist URL, URI, or ID. Try again.")
        return
      }
      onOrganize({ type: 'playlist', id })
      return
    }
    onOrganize({ type: collectionType })
  }

  return (
    <div className="container px-4 py-16 mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Avatar>
            <AvatarImage src={user.images?.[0]?.url} alt={user.display_name ?? 'User'} />
            <AvatarFallback>{user.display_name?.[0] ?? 'U'}</AvatarFallback>
          </Avatar>
          <span className="text-lg font-semibold">Welcome, {user.display_name ?? 'friend'}</span>
        </div>
        <Button variant="ghost" onClick={onLogout}>Log out</Button>
      </div>

      <h1 className="mb-4 text-4xl font-bold">Organize Your Music</h1>

      <div>
        <Label htmlFor="collection-type">What do you want to organize?</Label>
        <Select value={collectionType} onValueChange={(v) => setCollectionType(v as CollectionType)}>
          <SelectTrigger id="collection-type" className="mt-2">
            <SelectValue placeholder="Select collection" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="saved">Songs you've saved to Your Music</SelectItem>
            <SelectItem value="added">Songs you've added to a playlist</SelectItem>
            <SelectItem value="follow">Songs in playlists you follow</SelectItem>
            <SelectItem value="all">All of your music</SelectItem>
            <SelectItem value="playlist">A specific playlist</SelectItem>
          </SelectContent>
        </Select>

        {collectionType === 'playlist' && (
          <div className="mt-4">
            <Label htmlFor="playlist-uri">Playlist URL, URI, or ID</Label>
            <Input
              id="playlist-uri"
              className="mt-2"
              placeholder="https://open.spotify.com/playlist/5FJXhjdILmRA2z5bvz4nzf"
              value={playlistInput}
              onChange={(e) => {
                setPlaylistInput(e.target.value)
                setPlaylistError(null)
              }}
            />
            {playlistError && <p className="mt-1 text-sm text-red-600">{playlistError}</p>}
          </div>
        )}

        <Button className="w-full mt-8" size="lg" onClick={handleOrganize}>
          Organize your music
        </Button>
      </div>
    </div>
  )
}
