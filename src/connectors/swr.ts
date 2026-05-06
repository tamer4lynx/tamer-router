import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export interface SwrCacheLike {
  keys: () => IterableIterator<string>
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
  delete: (key: string) => void
}

export interface TrackedSwrCache extends SwrCacheLike {
  subscribe: (listener: () => void) => () => void
}

/**
 * Wraps a Map-like cache with subscribe/notify. Pass the result to <SWRConfig provider={...}>.
 *
 *   const cache = createTrackedSwrCache()
 *   <SWRConfig value={{ provider: () => cache }}>...
 *   const sync = createSwrSync('swr', cache)
 */
export function createTrackedSwrCache(initial?: Iterable<[string, unknown]>): TrackedSwrCache {
  const map = new Map<string, unknown>(initial)
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const l of listeners) l()
  }
  return {
    keys: () => map.keys(),
    get: (k) => map.get(k),
    set: (k, v) => {
      map.set(k, v)
      emit()
    },
    delete: (k) => {
      map.delete(k)
      emit()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function isTracked(cache: SwrCacheLike): cache is TrackedSwrCache {
  return typeof (cache as TrackedSwrCache).subscribe === 'function'
}

export function createSwrSync(key: string, cache: SwrCacheLike): TamerStateSync {
  return createTamerStateSync(key, {
    getState: () => {
      const out: Record<string, unknown> = {}
      for (const k of cache.keys()) {
        out[k] = cache.get(k)
      }
      return out
    },
    subscribe: (listener) => {
      if (isTracked(cache)) return cache.subscribe(listener)
      return () => {}
    },
    hydrate: (json) => {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>
        for (const [k, v] of Object.entries(parsed)) {
          cache.set(k, v)
        }
      } catch {
        // ignore bad json
      }
    },
  })
}
