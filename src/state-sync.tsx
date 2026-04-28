import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from '@lynx-js/react'
import { TamerNav, readHydratedStateJson, subscribeHydratedStateJson } from '@tamer4lynx/tamer-navigation'
import type { CoordinatorNavDispatchAction, TamerStateSync, TamerStateSyncProviderProps } from './types.js'

let activeSyncs: TamerStateSync[] | null = null

const StateSyncContext = createContext<{
  getSnapshot: (key: string) => unknown
} | null>(null)

function aggregateStateJson(syncs: TamerStateSync[]): string {
  const o: Record<string, unknown> = {}
  for (const s of syncs) {
    try {
      o[s.key] = JSON.parse(s.serialize() || '{}') as unknown
    } catch {
      o[s.key] = {}
    }
  }
  return JSON.stringify(o)
}

function parseAggregateStateJson(json: string, syncs: TamerStateSync[]): void {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(json || '{}') as Record<string, unknown>
  } catch {
    return
  }
  for (const s of syncs) {
    const slice = parsed[s.key]
    if (typeof slice === 'object' && slice !== null) {
      s.hydrate(JSON.stringify(slice))
    }
  }
}

/**
 * Build a `TamerStateSync` for any store that exposes getState, subscribe, hydrate, and optional send.
 */
export function createTamerStateSync(
  key: string,
  api: {
    getState: () => unknown
    subscribe: (listener: () => void) => () => void
    hydrate: (json: string) => void
    send?: (action: unknown) => void
  },
): TamerStateSync {
  return {
    key,
    serialize: () => {
      try {
        return JSON.stringify(api.getState() ?? null)
      } catch {
        return '{}'
      }
    },
    hydrate: (json) => api.hydrate(json),
    subscribe: api.subscribe,
    send: api.send,
  }
}

/**
 * Wires `stateJson` ↔ host for named slices. Wrap your app’s own provider tree as `children`
 * (e.g. React context, hand-rolled store); this component only syncs the slices you pass in `syncs`.
 */
export function TamerStateSyncProvider({ syncs, providers, children }: TamerStateSyncProviderProps) {
  const [snap, setSnap] = useState<Record<string, unknown>>(() => ({}))
  const syncList = useMemo(
    () => (syncs && syncs.length > 0 ? syncs : (providers ?? [])),
    [syncs, providers],
  )

  const refresh = useCallback(() => {
    const next: Record<string, unknown> = {}
    for (const s of syncList) {
      try {
        next[s.key] = JSON.parse(s.serialize() || '{}') as unknown
      } catch {
        next[s.key] = {}
      }
    }
    setSnap(next)
  }, [syncList])

  useEffect(() => {
    activeSyncs = syncList
    const unsubs: Array<() => void> = []
    for (const s of syncList) {
      unsubs.push(
        s.subscribe(() => {
          refresh()
          const stateJson = aggregateStateJson(syncList)
          TamerNav.update({ stateJson })
        }),
      )
    }
    return () => {
      activeSyncs = null
      for (const u of unsubs) u()
    }
  }, [syncList, refresh])

  useEffect(() => {
    'background only'
    const json = readHydratedStateJson('{}')
    parseAggregateStateJson(json, syncList)
    refresh()
    return subscribeHydratedStateJson((j) => {
      parseAggregateStateJson(j, syncList)
      refresh()
    })
  }, [syncList, refresh])

  const getSnapshot = useCallback(
    (k: string) => {
      return snap[k]
    },
    [snap],
  )

  return (
    <StateSyncContext.Provider value={{ getSnapshot }}>{children as any}</StateSyncContext.Provider>
  )
}

export function useTamerStateSnapshot(key: string): unknown {
  const ctx = useContext(StateSyncContext)
  return ctx?.getSnapshot(key)
}

export function sendTamerState(key: string, action: unknown): void {
  'background only'
  const list = activeSyncs
  if (!list) return
  const s = list.find((x) => x.key === key)
  s?.send?.(action)
}

export function applyDefaultCoordinatorNavDispatch(action: CoordinatorNavDispatchAction): void {
  'background only'
  if (action.type !== 'shared-context-mutate' || typeof action.payloadJson !== 'string') return
  const list = activeSyncs
  if (!list?.length) return
  let data: Record<string, unknown>
  try {
    data = JSON.parse(action.payloadJson) as Record<string, unknown>
  } catch {
    return
  }
  const key = data.tamerSyncKey
  if (typeof key === 'string') {
    const { tamerSyncKey: _k, ...rest } = data
    sendTamerState(key, rest)
    return
  }
  if (list.length === 1) {
    list[0].send?.(data)
  }
}

/** @deprecated use `TamerStateSyncProvider` */
export const FileRouterBridgesProvider = TamerStateSyncProvider

/** @deprecated use `useTamerStateSnapshot` */
export const useTamerProviderSnapshot = useTamerStateSnapshot

/** @deprecated use `sendTamerState` */
export const dispatchProviderMutation = sendTamerState
