import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export interface JotaiAtomLike<T> {
  // Marker only; structural to Jotai's WritableAtom.
  readonly __atomBrand?: T
}

export interface JotaiStoreLike {
  get: <T>(atom: JotaiAtomLike<T>) => T
  set: <T>(atom: JotaiAtomLike<T>, value: T) => void
  sub: (atom: JotaiAtomLike<unknown>, listener: () => void) => () => void
}

export type JotaiAtomMap = Record<string, JotaiAtomLike<unknown>>

export function createJotaiSync(
  key: string,
  store: JotaiStoreLike,
  atoms: JotaiAtomMap,
): TamerStateSync {
  return createTamerStateSync(key, {
    getState: () => {
      const out: Record<string, unknown> = {}
      for (const [k, atom] of Object.entries(atoms)) {
        out[k] = store.get(atom)
      }
      return out
    },
    subscribe: (listener) => {
      const unsubs: Array<() => void> = []
      for (const atom of Object.values(atoms)) {
        unsubs.push(store.sub(atom, listener))
      }
      return () => {
        for (const u of unsubs) u()
      }
    },
    hydrate: (json) => {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>
        for (const [k, v] of Object.entries(parsed)) {
          const atom = atoms[k]
          if (atom) store.set(atom, v)
        }
      } catch {
        // ignore bad json
      }
    },
  })
}
