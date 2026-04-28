/// <reference types="@lynx-js/react" />

export {
  BackHandlerContext,
  BackHandlerProvider,
  BackHandlerRoot,
  BackHandlerRegistryContext,
  createBackHandlerRegistry,
  useBackHandler,
  useBackHandlerListeners,
  useBackHandlerSetup,
  usePreventBack,
} from './back-handler.js'
export type { BackHandlerProviderProps, BackHandlerRegistry, BackHandlerRootProps } from './back-handler.js'
export {
  FileRouter,
  FileRouterInner,
  useTamerNavigate,
  useTamerRouter,
  useLocation,
  useNavigate,
  useParams,
  useScreenOptions,
  useTabScreenOptions,
  Link,
} from './router.js'
export type {
  CoordinatorNavDispatchAction,
  FileRouterProps,
  GeneratedRoutesManifest,
  TabBarChromeOptions,
  TabNavigatorOptions,
} from './types.js'
export {
  TamerStateSyncProvider,
  createTamerStateSync,
  useTamerStateSnapshot,
  sendTamerState,
  applyDefaultCoordinatorNavDispatch,
  FileRouterBridgesProvider,
  useTamerProviderSnapshot,
  dispatchProviderMutation,
} from './state-sync.js'
export type { TamerStateSync, TamerStateSyncProviderProps } from './types.js'
export { TamerDefaultNotFound } from './default-not-found.js'
export { sortRoutePaths, sortRoutePaths as collectKnownRoutePaths } from './collect-known-route-paths.js'
export { useTamerLynxFileRouter, TamerLynxFileRouterContext } from './tamer-lynx-context.js'
export {
  getOutermostStackFromPath,
  isTabStackPath,
  setTabStackPaths,
  setAllStackPaths,
  shouldNativePush,
} from './tamer-stacks.js'
export { setTamerGeneratedRoutes, getTamerGeneratedRoutes } from './generated-routes-registry.js'
export type { TamerOutermostStack, TamerFileRouterContextValue, ScreenOptions } from './types.js'
export { Outlet, Slot, Stack, StackScreen, Tab, Tabs, TabScreen } from './layouts.js'
export { useLocalSearchParams, useSegments, getOutermostStackId } from './tamer-routing-hooks.js'
