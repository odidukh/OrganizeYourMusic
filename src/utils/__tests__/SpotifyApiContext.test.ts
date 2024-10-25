import { renderHook, act } from '@testing-library/react';
import { useApiContext } from '../SpotifyApiContext';

// Mock the fetch function
global.fetch = jest.fn();

const mockUserProfile = {
  "display_name": "Lennart",
  "external_urls": {
    "spotify": "https://open.spotify.com/user/mxizllzjja8ycwbfo90f0t20n"
  },
  "href": "https://api.spotify.com/v1/users/mxizllzjja8ycwbfo90f0t20n",
  "id": "mxizllzjja8ycwbfo90f0t20n",
  "images": [{
    "url": "https://i.scdn.co/image/ab67757000003b82ffaf46729b5c472e75c75f80",
    "height": 64,
    "width": 64
  }, {
    "url": "https://i.scdn.co/image/ab6775700000ee85ffaf46729b5c472e75c75f80",
    "height": 300,
    "width": 300
  }],
  "type": "user",
  "uri": "spotify:user:mxizllzjja8ycwbfo90f0t20n",
  "followers": {
    "href": null,
    "total": 12
  }
};

describe('useApiContext', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with the provided access token', () => {
    const { result } = renderHook(() => useApiContext('test-token'));
    expect(result.current.accessToken).toBe('test-token');
  });

  it('should update access token', () => {
    const { result } = renderHook(() => useApiContext('initial-token'));
    act(() => {
      result.current.setAccessToken('new-token');
    });
    expect(result.current.accessToken).toBe('new-token');
  });

  it('should fetch current user profile', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: jest.fn().mockResolvedValueOnce(JSON.stringify(mockUserProfile)),
    });

    const { result } = renderHook(() => useApiContext('test-token'));
    
    let profileResult;
    await act(async () => {
      profileResult = await result.current.fetchCurrentUserProfile();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://api.spotify.com/v1/me'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
        }),
      })
    );

    expect(profileResult).toEqual(JSON.stringify(mockUserProfile));
  });

  it('should throw an error when access token is empty', async () => {
    const { result } = renderHook(() => useApiContext(''));
    
    await expect(result.current.request('https://api.spotify.com/v1/test', null))
      .rejects.toThrow('Spotify fetch failed: no bearer token');
  });

  it('should throw an error when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useApiContext('test-token'));
    
    await expect(result.current.request('https://api.spotify.com/v1/test', null))
      .rejects.toThrow('Spotify fetch failed: Error: Network error');
  });
});
