import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export interface ZustandLikeStore<T> {
  getState: () => T
  // Loose signature so both vanilla and react Zustand stores satisfy structurally
  // (their `replace` overload narrows to `false`/`true` literals).
  setState: (partial: never, replace?: never) => void
  subscribe: (listener: (state: T, prev: T) => void) => () => void
}

export function createZustandSync<T extends object>(
  key: string,
  store: ZustandLikeStore<T>,
): TamerStateSync {
  return createTamerStateSync(key, {
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(() => listener()),
    hydrate: (json) => {
      try {
        const next = JSON.parse(json) as Partial<T>
        ;(store.setState as (p: Partial<T>, r?: boolean) => void)(next, false)
      } catch {
        // ignore bad json
      }
    },
  })
}
