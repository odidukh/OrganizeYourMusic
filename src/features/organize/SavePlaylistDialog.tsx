import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addTracksToPlaylist, createPlaylist } from '@/api/queries'
import type { Track } from '@/domain/track'
import type { SpotifyUser } from '@/state/appState'

type Props = {
  user: SpotifyUser
  tracks: Track[]
  defaultName: string
  onClose: () => void
}

export function SavePlaylistDialog({ user, tracks, defaultName, onClose }: Props) {
  const [name, setName] = useState(defaultName)
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const playlist = await createPlaylist(user.id, name.trim(), isPublic)
      await addTracksToPlaylist(
        playlist.id,
        tracks.map((t) => t.uri)
      )
      toast.success(`Saved ${tracks.length} tracks`, {
        description: name,
        action: {
          label: 'Open',
          onClick: () => window.open(playlist.external_urls.spotify, '_blank'),
        },
      })
      onClose()
    } catch (err: any) {
      toast.error('Failed to save playlist', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as playlist</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="playlist-name">Playlist name</Label>
            <Input
              id="playlist-name"
              className="mt-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Make playlist public
          </label>

          <p className="text-sm text-muted-foreground">
            Saving {tracks.length.toLocaleString()} tracks.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
