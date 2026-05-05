import type { FilterKind, FilterMode, FilterState } from './filters'

const VERSION = 1

const KNOWN_KINDS: ReadonlySet<FilterKind> = new Set([
  'decade',
  'genre',
  'duration',
  'popularity',
  'search',
])

const KNOWN_MODES: ReadonlySet<FilterMode> = new Set(['include', 'exclude'])

type Encoded = {
  v: number
  source: string
  filters: { kind: FilterKind; mode: FilterMode; values: string[] }[]
}

export function encodeFilterState(sourceKey: string, state: FilterState): string {
  const payload: Encoded = {
    v: VERSION,
    source: sourceKey,
    filters: state.filters.map((f) => ({
      kind: f.kind,
      mode: f.mode,
      values: f.values,
    })),
  }
  const json = JSON.stringify(payload)
  return base64UrlEncode(json)
}

export type DecodedFilterUrl = { source: string; state: FilterState }

export function decodeFilterState(token: string): DecodedFilterUrl | null {
  try {
    const json = base64UrlDecode(token)
    const parsed = JSON.parse(json) as unknown
    if (!isEncoded(parsed)) return null
    if (parsed.v !== VERSION) return null
    return { source: parsed.source, state: { filters: parsed.filters } }
  } catch {
    return null
  }
}

function isEncoded(x: unknown): x is Encoded {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.v !== 'number') return false
  if (typeof o.source !== 'string') return false
  if (!Array.isArray(o.filters)) return false
  for (const f of o.filters) {
    if (!f || typeof f !== 'object') return false
    const fo = f as Record<string, unknown>
    if (typeof fo.kind !== 'string' || !KNOWN_KINDS.has(fo.kind as FilterKind)) return false
    if (typeof fo.mode !== 'string' || !KNOWN_MODES.has(fo.mode as FilterMode)) return false
    if (!Array.isArray(fo.values)) return false
    if (!fo.values.every((v) => typeof v === 'string')) return false
  }
  return true
}

function base64UrlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
