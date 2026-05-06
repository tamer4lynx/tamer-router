import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export interface RecoilAtomEffectParam<T> {
  setSelf: (value: T) => void
  onSet: (cb: (newValue: T) => void) => void
  trigger: 'get' | 'set'
}

export interface RecoilSyncBundle<T> {
  connector: TamerStateSync
  /** Attach to your atom's `effects` array. */
  effect: (param: RecoilAtomEffectParam<T>) => void
  /** Read the current bridged value. */
  getValue: () => T
  /** Subscribe to value changes (from Recoil onSet, hydration, or set()). */
  subscribe: (listener: () => void) => () => void
  /** Imperatively set the value. Pushes through any registered atom effects. */
  set: (next: T | ((prev: T) => T)) => void
}

/**
 * Bridge a Recoil atom across LynxView boundaries.
 *
 *   const recoilSync = createRecoilSync<MyT>('myKey', { count: 0 })
 *   const myAtom = atom<MyT>({ key: 'my', default: ..., effects: [recoilSync.effect] })
 *   <FileRouter providerConnector={[recoilSync.connector, ...]} />
 *
 * Hydration that arrives before RecoilRoot mounts is queued and applied to
 * the first effect that registers. Environments without Recoil hooks (e.g.
 * Lynx React) can read/write directly via `getValue` / `subscribe` / `set`.
 */
export function createRecoilSync<T>(key: string, initial: T): RecoilSyncBundle<T> {
  let current: T = initial
  let pendingHydrate: T | undefined
  let hasPending = false
  const listeners = new Set<() => void>()
  const setters = new Set<(value: T) => void>()

  const emit = () => {
    for (const l of listeners) l()
  }

  const effect = (param: RecoilAtomEffectParam<T>) => {
    setters.add(param.setSelf)
    if (hasPending) {
      param.setSelf(pendingHydrate as T)
      hasPending = false
    } else {
      param.setSelf(current)
    }
    param.onSet((next) => {
      current = next
      emit()
    })
  }

  const set: RecoilSyncBundle<T>['set'] = (next) => {
    const resolved =
      typeof next === 'function' ? (next as (prev: T) => T)(current) : next
    current = resolved
    if (setters.size > 0) {
      for (const s of setters) s(resolved)
    }
    emit()
  }

  const connector = createTamerStateSync(key, {
    getState: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    hydrate: (json) => {
      try {
        const next = JSON.parse(json) as T
        current = next
        if (setters.size === 0) {
          pendingHydrate = next
          hasPending = true
        } else {
          for (const s of setters) s(next)
        }
        emit()
      } catch {
        // ignore bad json
      }
    },
  })

  return {
    connector,
    effect,
    getValue: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set,
  }
}
