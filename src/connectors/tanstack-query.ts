import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

interface QueryCacheLike {
  subscribe: (listener: () => void) => () => void
}

/**
 * Structural sliver of `QueryClient`. Real QueryClient has private fields, so
 * we use `unknown` for the public type and cast inside.
 */
export type QueryClientLike = unknown

export interface TanstackHydrationApi {
  dehydrate: (client: never) => unknown
  hydrate: (client: never, state: unknown) => void
}

interface QueryClientShape {
  getQueryCache: () => QueryCacheLike
  getMutationCache: () => QueryCacheLike
}

/**
 * Bridge a TanStack Query client across LynxView boundaries.
 *
 *   import { dehydrate, hydrate } from '@tanstack/react-query'
 *   createTanstackQuerySync('queries', queryClient, { dehydrate, hydrate })
 *
 * dehydrate/hydrate are passed in so tamer-router has no peer dep on
 * @tanstack/react-query.
 */
export function createTanstackQuerySync(
  key: string,
  queryClient: QueryClientLike,
  api: TanstackHydrationApi,
): TamerStateSync {
  const qc = queryClient as QueryClientShape
  const dehydrate = api.dehydrate as (c: unknown) => unknown
  const hydrate = api.hydrate as (c: unknown, s: unknown) => void
  return createTamerStateSync(key, {
    getState: () => dehydrate(qc),
    subscribe: (listener) => {
      const unsubQuery = qc.getQueryCache().subscribe(listener)
      const unsubMutation = qc.getMutationCache().subscribe(listener)
      return () => {
        unsubQuery()
        unsubMutation()
      }
    },
    hydrate: (json) => {
      try {
        hydrate(qc, JSON.parse(json))
      } catch {
        // ignore bad json
      }
    },
  })
}
