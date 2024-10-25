import { useState, useCallback, useMemo } from 'react';

export function useApiContext(initialAccessToken: string) {
  const [accessToken, setAccessToken] = useState(initialAccessToken);

  const request = useCallback(async (url: string, data: any): Promise<string> => {
    if (accessToken === '') {
      console.warn('Spotify fetch failed: no bearer token');
      return '';
    }

    const options: RequestInit = {
      method: data ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    };

    try {
      const res = await fetch(url, options);
      const rawBody = await res.text();
      console.log('Raw response body:', rawBody);
      return rawBody;
    } catch (error) {
      console.log('request catch', error);
      throw new Error('Spotify fetch failed: ' + error);
    }
  }, [accessToken]);

  const fetchCurrentUserProfile = useCallback(() => {
    const url = 'https://api.spotify.com/v1/me';
    return request(url, null);
  }, [request]);

  return useMemo(() => ({
    accessToken,
    setAccessToken,
    request,
    fetchCurrentUserProfile,
  }), [accessToken, request, fetchCurrentUserProfile]);
}
