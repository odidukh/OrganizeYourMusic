import React, {useEffect, useState} from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useApiContext } from '@/utils/SpotifyApiContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function Hero() {
    const [collectionType, setCollectionType] = useState('saved');
    const [playlistUri, setPlaylistUri] = useState('');
    const [spotifyAccessToken, setSpotifyAccessToken] = useState('');
    const spotifyApi = useApiContext(spotifyAccessToken);
    const [user, setUser] = useState<SpotifyApi.CurrentUsersProfileResponse | null>(null);

    const authorizeUser = () => {
        const scopes = 'user-library-read playlist-modify-public';
        const url = 'https://accounts.spotify.com/authorize?client_id=' + '1c81d0d03de148c083744f5cce782ef7' +
            '&response_type=token' +
            '&scope=' + encodeURIComponent(scopes) +
            '&redirect_uri=' + encodeURIComponent('http://localhost:8000/');
        window.location.href = url;
    }

    function fetchCurrentUserProfile() {
        return spotifyApi.fetchCurrentUserProfile();
    }

    // mounted check for access_token in query params
    useEffect(() => {
        const params = new URLSearchParams(window.location.hash?.substring(1))

        if (params.has('error')) {
            console.warn('Sorry, cannot read your music collection from Spotify')
            return
        }

        if (params.has('access_token')) {
            const accessToken: string = params.get('access_token') || '';
            setSpotifyAccessToken(accessToken)
            spotifyApi.setAccessToken(accessToken);  // Set the access token immediately
        }
    }, [])

    useEffect(() => {
        if (!spotifyAccessToken) {
            return;
        }

        fetchCurrentUserProfile()
            .then(function(user) {
                if (!user) {
                    console.warn('Sorry could not load your Spotify account');
                    return;
                }
                console.log('User profile:', user);
                setUser(user);
            })
            .catch(error => {
                console.error('Error fetching user profile:', error);
            });
    }, [spotifyAccessToken]);

    return (
        <div className="container px-4 py-16 mx-auto">
            <h1 className="mb-4 text-4xl font-bold">Organize Your Music</h1>
            <p className="mb-8">
                Organize your Spotify music collection by any of a wide range of musical attributes including
                genre, mood, decade of release and more.
            </p>
            {user && (
                <div className="flex items-center mb-8 space-x-4">
                    <Avatar>
                        <AvatarImage src={user.images?.[0]?.url} alt={user.display_name || 'User'} />
                        <AvatarFallback>{user.display_name?.[0] || 'U'}</AvatarFallback>
                    </Avatar>
                    <span className="text-lg font-semibold">Welcome, {user.display_name}</span>
                </div>
            )}
            <div className="max-w-md mx-auto">
                <label htmlFor="collection-type" className="block mb-2">
                    What do you want to organize:
                </label>
                <Select onValueChange={(value) => setCollectionType(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select collection type" />
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
                        <label htmlFor="uri-text" className="block mb-2">
                            Enter the URI for your playlist:
                        </label>
                        <Input
                            id="uri-text"
                            type="text"
                            placeholder="spotify:user:spotify:playlist:5FJXhjdILmRA2z5bvz4nzf"
                            value={playlistUri}
                            onChange={(e) => setPlaylistUri(e.target.value)}
                        />
                    </div>
                )}
                <Button className="w-full mt-8" size="lg" onClick={authorizeUser}>
                    Organize your music
                </Button>
            </div>
        </div>
    );
}
