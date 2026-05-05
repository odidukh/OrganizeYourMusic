import { spotifyFetch } from './spotifyClient'

type PageRequest = { offset: number; limit: number }

type Page<T> = {
  items: T[]
  total: number
  next: string | null
}

const CONCURRENCY = 5
export const HARD_TRACK_CAP = 5000

export type ProgressUpdate = { fetched: number; total: number }

/**
 * Paginate a Spotify endpoint that returns { items, total, next, offset, limit }.
 * Calls onProgress after each page completes.
 * Stops once HARD_TRACK_CAP items have been collected.
 */
export async function paginate<T>(
  buildUrl: (req: PageRequest) => string,
  pageSize: number,
  onProgress: (p: ProgressUpdate) => void,
  signal?: AbortSignal
): Promise<{ items: T[]; truncated: boolean; reportedTotal: number }> {
  const firstUrl = buildUrl({ offset: 0, limit: pageSize })
  const first = await spotifyFetch<Page<T>>(firstUrl, { signal })

  const reportedTotal = first.total
  const totalToFetch = Math.min(reportedTotal, HARD_TRACK_CAP)
  let collected: T[] = [...first.items]

  onProgress({ fetched: collected.length, total: totalToFetch })

  if (collected.length >= totalToFetch) {
    return {
      items: collected.slice(0, HARD_TRACK_CAP),
      truncated: reportedTotal > HARD_TRACK_CAP,
      reportedTotal,
    }
  }

  const offsets: number[] = []
  for (let off = pageSize; off < totalToFetch; off += pageSize) offsets.push(off)

  // Concurrent worker pool with cap
  const results: T[][] = new Array(offsets.length)
  let nextIdx = 0

  async function worker() {
    while (true) {
      if (signal?.aborted) return
      const idx = nextIdx++
      if (idx >= offsets.length) return
      const url = buildUrl({ offset: offsets[idx], limit: pageSize })
      const page = await spotifyFetch<Page<T>>(url, { signal })
      results[idx] = page.items
      collected = collected.concat(page.items)
      onProgress({ fetched: Math.min(collected.length, totalToFetch), total: totalToFetch })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, worker)
  await Promise.all(workers)

  const all = first.items.concat(...results.filter(Boolean))
  return {
    items: all.slice(0, HARD_TRACK_CAP),
    truncated: reportedTotal > HARD_TRACK_CAP,
    reportedTotal,
  }
}

/** Batch a list of ids into requests of `batchSize`, run with concurrency cap. */
export async function batchedFetch<TResult>(
  ids: string[],
  batchSize: number,
  fetchBatch: (chunk: string[]) => Promise<TResult>,
  onProgress: (p: ProgressUpdate) => void,
  signal?: AbortSignal
): Promise<TResult[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += batchSize) chunks.push(ids.slice(i, i + batchSize))

  const results: TResult[] = new Array(chunks.length)
  let nextIdx = 0
  let done = 0

  onProgress({ fetched: 0, total: chunks.length })

  async function worker() {
    while (true) {
      if (signal?.aborted) return
      const idx = nextIdx++
      if (idx >= chunks.length) return
      const r = await fetchBatch(chunks[idx])
      results[idx] = r
      done++
      onProgress({ fetched: done, total: chunks.length })
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker)
  await Promise.all(workers)
  return results
}
