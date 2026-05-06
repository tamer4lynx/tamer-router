export { createZustandSync } from './zustand.js'
export type { ZustandLikeStore } from './zustand.js'

export {
  createReduxSync,
  TAMER_HYDRATE_ACTION,
} from './redux.js'
export type { ReduxLikeStore, ReduxRootReducer } from './redux.js'

export { createTanstackQuerySync } from './tanstack-query.js'
export type { QueryClientLike, TanstackHydrationApi } from './tanstack-query.js'

export { createApolloSync } from './apollo.js'
export type { ApolloClientLike } from './apollo.js'

export { createSwrSync, createTrackedSwrCache } from './swr.js'
export type { SwrCacheLike, TrackedSwrCache } from './swr.js'

export { createJotaiSync } from './jotai.js'
export type { JotaiAtomLike, JotaiAtomMap, JotaiStoreLike } from './jotai.js'

export { createI18nextSync } from './i18next.js'
export type { I18nextLike } from './i18next.js'

export { createThemeSync } from './theme.js'
export type { ThemeApi, ThemeValue } from './theme.js'

export { createRecoilSync } from './recoil.js'
export type { RecoilAtomEffectParam, RecoilSyncBundle } from './recoil.js'
