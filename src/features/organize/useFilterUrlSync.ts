import { useEffect, useRef } from 'react'
import { decodeFilterState, encodeFilterState } from '@/domain/filterUrl'
import type { FilterState } from '@/domain/filters'

const HASH_PREFIX = '#f='
const WRITE_DEBOUNCE_MS = 250

type Args = {
  sourceKey: string
  state: FilterState
  onRestore: (state: FilterState) => void
  onRestoreFailure: () => void
}

export function useFilterUrlSync({ sourceKey, state, onRestore, onRestoreFailure }: Args): void {
  const initialReadDone = useRef(false)

  useEffect(() => {
    if (initialReadDone.current) return
    initialReadDone.current = true
    const hash = window.location.hash
    if (!hash.startsWith(HASH_PREFIX)) return
    const token = hash.slice(HASH_PREFIX.length)
    const decoded = decodeFilterState(token)
    if (!decoded) {
      stripHash()
      onRestoreFailure()
      return
    }
    if (decoded.source !== sourceKey) {
      stripHash()
      return
    }
    onRestore(decoded.state)
  }, [sourceKey, onRestore, onRestoreFailure])

  useEffect(() => {
    const t = setTimeout(() => {
      if (state.filters.length === 0) {
        stripHash()
        return
      }
      const token = encodeFilterState(sourceKey, state)
      const next = `${window.location.pathname}${window.location.search}${HASH_PREFIX}${token}`
      window.history.replaceState(null, '', next)
    }, WRITE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [sourceKey, state])
}

function stripHash(): void {
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search
  )
}
