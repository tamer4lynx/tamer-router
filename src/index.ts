import 'url-search-params-polyfill'

export { Outlet, Slot, useLocation, useNavigate, useOutlet, useParams } from './router-compat.js'
export { FileRouter, useTamerNavigate, useTamerRouter } from './FileRouter.js'
export type {
  FileRouterProps,
  TamerNavigateApi,
  TamerNavigateFn,
  TamerRoutePath,
  TamerToOptions,
  TransitionConfig,
  TransitionDirection,
  TransitionMode,
  TransitionOptions,
} from './FileRouter.js'
export { Link, useLinkHref } from './Link.js'
export type { LinkHrefFn, LinkProps, LinkRenderState } from './Link.js'
export { BackHandlerRoot, useBackHandler, usePreventBack } from './back-handler.js'
export type { BackHandlerRootProps, BackHandlerRegistry } from './back-handler.js'
export { Stack, TabsLayout as Tabs } from './StackTabs.js'
export { StackScreen, TabsScreen } from './StackTabs.js'
export { useScreenOptions } from './StackTabs.js'
export type {
  ScreenOptions,
  StackProps,
  StackScreenProps,
  TabsProps,
  TabsScreenOptions,
  TabsScreenProps,
} from './StackTabs.js'
export { getRouteApi, redirect, useMatchRoute, useSearch } from '@tanstack/react-router'
export type { LinkOptions, MatchRouteOptions, NavigateOptions, RouteByPath, RoutePaths, ToOptions } from '@tanstack/react-router'
export type { AppBarAction, TabBarIconColor, ThemeColors } from '@tamer4lynx/tamer-app-shell'
