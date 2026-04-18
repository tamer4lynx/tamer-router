/// <reference types="@lynx-js/react" />
import '@tamer4lynx/tamer-navigation'

export {
  BackHandlerContext,
  BackHandlerProvider,
  BackHandlerRoot,
  createBackHandlerRegistry,
  useBackHandler,
  useBackHandlerSetup,
  usePreventBack,
} from './back-handler.js'
export type { BackHandlerProviderProps, BackHandlerRootProps } from './back-handler.js'
export {
  StackProvider,
  useStackContext,
  createStackContextValue,
} from './stack-context.js'
export type { StackEntry, StackContextValue } from './stack-context.js'
export { FileRouter, Navigate, useLocation, useNavigate, useOutlet, useParams, useScreenOptions, useTamerNavigate, useTamerRouter } from './router.js'
export type { FileRouterAppShellOptions, FileRouterProps, NavigateFunction, NavigateProps } from './router.js'
export { Outlet, Rail, Slot, Stack, Tab, Tabs, useLayoutSlot } from './layouts.js'
export type {
  GeneratedLayoutChild,
  GeneratedLayoutDefinition,
  GeneratedRouteDefinition,
  GeneratedRoutesManifest,
  GeneratedScreenDeclaration,
  Href,
  HrefObject,
  LayoutKind,
  LinkingConfig,
  RouteParams,
  RoutePath,
  ScreenOptions,
  TransitionConfig,
  TransitionOptions,
} from './types.js'
export type { ThemeColors } from '@tamer4lynx/tamer-system-ui'
