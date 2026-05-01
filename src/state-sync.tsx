import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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

function parseSyncPayload(sync: TamerStateSync): unknown {
  try {
    return JSON.parse(sync.serialize() || '{}') as unknown
  } catch {
    return {}
  }
}

export function readActiveTamerStateJson(fallback = '{}'): string {
  const list = activeSyncs
  return list?.length ? aggregateStateJson(list) : fallback
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

export const createTamerProviderConnector = createTamerStateSync

export function useTamerStateSyncEngine(
  providerConnector?: TamerStateSync[],
  options: { dispatchConnectorMutations?: boolean } = {},
) {
  const [snap, setSnap] = useState<Record<string, unknown>>(() => ({}))
  const isHydrating = useRef(false)
  const syncList = useMemo(() => providerConnector ?? [], [providerConnector])
  const dispatchConnectorMutations = options.dispatchConnectorMutations === true

  const refresh = useCallback(() => {
    if (syncList.length === 0) {
      setSnap({})
      return
    }
    const next: Record<string, unknown> = {}
    for (const s of syncList) {
      next[s.key] = parseSyncPayload(s)
    }
    setSnap(next)
  }, [syncList])

  useEffect(() => {
    if (syncList.length === 0) {
      activeSyncs = null
      setSnap({})
      return
    }
    activeSyncs = syncList
    const unsubs: Array<() => void> = []
    for (const s of syncList) {
      unsubs.push(
        s.subscribe(() => {
          refresh()
          if (isHydrating.current) return
          if (dispatchConnectorMutations) {
            TamerNav.dispatch({
              type: 'shared-context-mutate',
              payloadJson: JSON.stringify({
                tamerSyncKey: s.key,
                type: '@@tamer/HYDRATE',
                payload: parseSyncPayload(s),
              }),
            })
            return
          }
          const stateJson = aggregateStateJson(syncList)
          TamerNav.update({ stateJson })
        }),
      )
    }
    return () => {
      activeSyncs = null
      for (const u of unsubs) u()
    }
  }, [dispatchConnectorMutations, syncList, refresh])

  useEffect(() => {
    'background only'
    if (syncList.length === 0) return
    const json = readHydratedStateJson('{}')
    isHydrating.current = true
    try {
      parseAggregateStateJson(json, syncList)
    } finally {
      isHydrating.current = false
    }
    refresh()
    return subscribeHydratedStateJson((j) => {
      isHydrating.current = true
      try {
        parseAggregateStateJson(j, syncList)
      } finally {
        isHydrating.current = false
      }
      refresh()
    })
  }, [syncList, refresh])

  const getSnapshot = useCallback(
    (k: string) => {
      return snap[k]
    },
    [snap],
  )

  return useMemo(() => ({ getSnapshot }), [getSnapshot])
}

export function TamerStateSyncEngineProvider({
  providerConnector,
  dispatchConnectorMutations,
  children,
}: {
  providerConnector?: TamerStateSync[]
  dispatchConnectorMutations?: boolean
  children: ReactNode
}) {
  const value = useTamerStateSyncEngine(providerConnector, { dispatchConnectorMutations })
  return (
    <StateSyncContext.Provider value={value}>{children as any}</StateSyncContext.Provider>
  )
}

/**
 * @deprecated Prefer <FileRouter providerConnector={...} /> for React-tree-bound state.
 * Module-level stores such as Redux, Zustand, and MobX should normally rely on the shared
 * LynxGroup singleton runtime and do not need this JSON bridge.
 */
export function TamerStateSyncProvider({ syncs, providers, children }: TamerStateSyncProviderProps) {
  const syncList = syncs && syncs.length > 0 ? syncs : providers
  return (
    <TamerStateSyncEngineProvider providerConnector={syncList}>
      {children as any}
    </TamerStateSyncEngineProvider>
  )
}

export function useTamerStateSnapshot(key: string): unknown {
  const ctx = useContext(StateSyncContext)
  return ctx?.getSnapshot(key)
}

function sendLocalTamerState(key: string, action: unknown): void {
  'background only'
  const list = activeSyncs
  if (!list) return
  const s = list.find((x) => x.key === key)
  s?.send?.(action)
}

function applyLocalTamerConnectorAction(key: string, action: Record<string, unknown>): void {
  'background only'
  const list = activeSyncs
  if (!list) return
  const s = list.find((x) => x.key === key)
  if (!s) return
  if (action.type === '@@tamer/HYDRATE' && 'payload' in action) {
    try {
      s.hydrate(JSON.stringify(action.payload))
    } catch {
      // ignore invalid connector payloads
    }
    return
  }
  s.send?.(action)
}

function createConnectorMutationPayload(key: string, action: unknown): Record<string, unknown> {
  if (action && typeof action === 'object' && !Array.isArray(action)) {
    return { tamerSyncKey: key, ...(action as Record<string, unknown>) }
  }
  return { tamerSyncKey: key, payload: action }
}

export function sendTamerState(key: string, action: unknown): void {
  'background only'
  try {
    TamerNav.dispatch({
      type: 'shared-context-mutate',
      payloadJson: JSON.stringify(createConnectorMutationPayload(key, action)),
    })
  } catch {
    sendLocalTamerState(key, action)
  }
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
    applyLocalTamerConnectorAction(key, rest)
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
