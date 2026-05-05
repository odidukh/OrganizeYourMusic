const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/'

type RawTag = { name: string; count?: number | string }
type RawTopTagsResponse = {
  toptags?: { tag?: RawTag[] | RawTag }
  error?: number
  message?: string
}

export function isConfigured(): boolean {
  return Boolean(getKey())
}

function getKey(): string | undefined {
  const raw = (import.meta.env.VITE_LASTFM_API_KEY as string | undefined)?.trim()
  return raw && raw.length > 0 ? raw : undefined
}

export class LastfmAbortError extends Error {
  constructor() {
    super('aborted')
    this.name = 'LastfmAbortError'
  }
}

export class LastfmFatalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LastfmFatalError'
  }
}

// Returns [] when the artist is unknown, has no tags, or returns only transient
// failures we can't recover from. Throws LastfmAbortError on abort or
// LastfmFatalError on unrecoverable conditions (rate limit exceeded twice,
// network failure on a retry).
export async function fetchArtistTags(
  artistName: string,
  signal: AbortSignal
): Promise<string[]> {
  const key = getKey()
  if (!key) throw new LastfmFatalError('VITE_LASTFM_API_KEY not configured')

  const url = new URL(ENDPOINT)
  url.searchParams.set('method', 'artist.getTopTags')
  url.searchParams.set('artist', artistName)
  url.searchParams.set('api_key', key)
  url.searchParams.set('format', 'json')
  url.searchParams.set('autocorrect', '1')

  return await fetchWithRetry(url.toString(), signal)
}

async function fetchWithRetry(url: string, signal: AbortSignal): Promise<string[]> {
  // First attempt
  const first = await attempt(url, signal)
  if (first.kind === 'ok') return first.tags
  if (first.kind === 'empty') return []
  if (first.kind === 'fatal') throw new LastfmFatalError(first.message)

  // Retry once for transient (5xx, network, 429, error:8)
  await sleep(first.kind === 'rateLimited' ? 5000 : 1000, signal)

  const second = await attempt(url, signal)
  if (second.kind === 'ok') return second.tags
  if (second.kind === 'empty') return []
  if (second.kind === 'fatal') throw new LastfmFatalError(second.message)
  if (second.kind === 'rateLimited') {
    throw new LastfmFatalError('Last.fm rate limit exceeded')
  }
  // Second 5xx / network: skip this artist (caller treats as no cache write)
  throw new LastfmFatalError(second.message ?? 'Last.fm transient failure')
}

type AttemptResult =
  | { kind: 'ok'; tags: string[] }
  | { kind: 'empty' } // artist not found or no tags returned
  | { kind: 'transient'; message: string } // 5xx, network error, error:8
  | { kind: 'rateLimited' }
  | { kind: 'fatal'; message: string }

async function attempt(url: string, signal: AbortSignal): Promise<AttemptResult> {
  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch (err) {
    if (signal.aborted || (err as Error).name === 'AbortError') {
      throw new LastfmAbortError()
    }
    return { kind: 'transient', message: 'network error' }
  }

  if (res.status === 429) return { kind: 'rateLimited' }
  if (res.status >= 500) return { kind: 'transient', message: `HTTP ${res.status}` }
  if (!res.ok) return { kind: 'fatal', message: `HTTP ${res.status}` }

  let json: RawTopTagsResponse
  try {
    json = await res.json()
  } catch (err) {
    if (signal.aborted || (err as Error)?.name === 'AbortError') {
      throw new LastfmAbortError()
    }
    return { kind: 'transient', message: 'invalid JSON' }
  }

  if (json.error === 6) return { kind: 'empty' } // artist not found
  if (json.error === 8) return { kind: 'transient', message: 'operation failed' }
  if (typeof json.error === 'number') {
    return { kind: 'fatal', message: json.message ?? `Last.fm error ${json.error}` }
  }

  const raw = json.toptags?.tag
  if (!raw) return { kind: 'empty' }
  const list = Array.isArray(raw) ? raw : [raw]
  const tags = list.map((t) => t.name).filter((s): s is string => typeof s === 'string' && s.length > 0)
  return { kind: 'ok', tags }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new LastfmAbortError())
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      reject(new LastfmAbortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
