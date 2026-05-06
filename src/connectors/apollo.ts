import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

/**
 * Structural sliver of ApolloClient. Real ApolloClient has private fields,
 * so we use `unknown` for the public type and cast inside.
 */
export type ApolloClientLike = unknown

interface ApolloClientShape {
  extract: () => unknown
  cache: { restore: (data: never) => unknown }
}

/**
 * Hydrates Apollo's normalized cache across LynxView boundaries.
 *
 * Note: subscribe is a no-op. Apollo's InMemoryCache lacks a public global
 * subscribe API, so live mutation propagation is not bridged — only the
 * snapshot at push/dispatch time. This is the right behavior for the common
 * cross-bundle hydration use case.
 */
export function createApolloSync(key: string, client: ApolloClientLike): TamerStateSync {
  const c = client as ApolloClientShape
  return createTamerStateSync(key, {
    getState: () => c.extract(),
    subscribe: () => () => {},
    hydrate: (json) => {
      try {
        ;(c.cache.restore as (data: unknown) => unknown)(JSON.parse(json))
      } catch {
        // ignore bad json
      }
    },
  })
}
