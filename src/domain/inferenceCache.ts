const STORAGE_KEY = 'oym:lastfm:v1'

export type InferenceCache = Record<string, string[]>

export function read(): InferenceCache {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: InferenceCache = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out[k] = v as string[]
      }
    }
    return out
  } catch {
    return {}
  }
}

export function write(cache: InferenceCache): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    return true
  } catch {
    return false
  }
}

export function merge(cache: InferenceCache, updates: InferenceCache): InferenceCache {
  return { ...cache, ...updates }
}
