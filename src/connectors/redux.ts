import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export interface ReduxLikeStore<S = unknown, A = unknown> {
  getState: () => S
  subscribe: (listener: () => void) => () => void
  dispatch: (action: A) => unknown
  replaceReducer: (next: (state: S | undefined, action: A) => S) => void
}

export type ReduxRootReducer<S, A> = (state: S | undefined, action: A) => S

export const TAMER_HYDRATE_ACTION = '@@tamer/HYDRATE' as const

interface HydrateAction<S> {
  type: typeof TAMER_HYDRATE_ACTION
  payload: S
}

export function createReduxSync<S, A extends { type: string } = { type: string }>(
  key: string,
  store: ReduxLikeStore<S, A | HydrateAction<S>>,
  rootReducer: ReduxRootReducer<S, A>,
): TamerStateSync {
  store.replaceReducer((state, action) => {
    if ((action as HydrateAction<S>).type === TAMER_HYDRATE_ACTION) {
      return (action as HydrateAction<S>).payload
    }
    return rootReducer(state, action as A)
  })

  return createTamerStateSync(key, {
    getState: () => store.getState(),
    subscribe: (listener) => store.subscribe(listener),
    hydrate: (json) => {
      try {
        const payload = JSON.parse(json) as S
        store.dispatch({ type: TAMER_HYDRATE_ACTION, payload })
      } catch {
        // ignore bad json
      }
    },
    send: (action) => {
      store.dispatch(action as A)
    },
  })
}
