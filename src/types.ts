import type { ReactNode } from '@lynx-js/react'

export type TamerOutermostStack = string | null

export type TamerFileRouterContextValue = {
  bundleSrc: string
  spokeMode: boolean
  spokeEntryPath: string | null
  spokeRootStack: TamerOutermostStack
}

export type ScreenOptions = {
  title?: string
  icon?: string
  label?: string
  /** When false, hides the top app bar for this screen (default true). */
  headerShown?: boolean
  set?: string
  /** App bar / stack header background (hex or Lynx color). */
  headerBackground?: string
  [key: string]: unknown
}

/**
 * Pass-through to `TabBar` (see `@tamer4lynx/tamer-app-shell` / Material tab bar).
 */
export type TabBarChromeOptions = {
  style?: Record<string, unknown>
  iconColor?: {
    active?: string
    inactive?: string
    labelActive?: string
    labelInactive?: string
    pill?: string
  }
  tabBarChromeHex?: string
  themeColors?: Record<string, string | boolean | number | null | undefined>
}

/**
 * Layout props for `<Tab>` / `<Tabs>` (expo-router–style: default header + tab bar, overridable).
 */
export type TabNavigatorOptions = {
  /**
   * Merged into every `<Tab.Screen>` before that screen’s `options`
   * (like React Navigation’s `screenOptions` on a tab navigator).
   */
  screenOptions?: ScreenOptions
  /**
   * When `false`, the top `AppBar` is never shown. To hide per screen, use
   * `<TabScreen options={{ headerShown: false }} />`.
   * @default true
   */
  headerShown?: boolean
  /**
   * When `false`, the bottom `TabBar` is hidden.
   * @default true
   */
  tabBarShown?: boolean
  /** `AppShell` background (replaces the default theme `surface` when set). */
  appShellBackgroundColor?: string
  /** Forwarded to `AppShell` `SafeArea` (default: all edges). */
  safeAreaEdges?: Array<'top' | 'right' | 'bottom' | 'left'>
  /** Bottom tab bar: style, `iconColor`, and related chrome. */
  tabBarOptions?: TabBarChromeOptions
}

/**
 * A named slice of app state for `TamerNav` JSON sync. Use with your own
 * `Context.Provider` (or any store) as `children` of `TamerStateSyncProvider` —
 * the router does not ship store-specific helpers.
 */
export type TamerStateSync = {
  key: string
  serialize: () => string
  hydrate: (json: string) => void
  subscribe: (listener: () => void) => () => void
  /** Optional: handle opaque actions (e.g. from another bundle / native). */
  send?: (action: unknown) => void
}

export type TamerStateSyncProviderProps = {
  children: ReactNode
  syncs?: TamerStateSync[]
  /** @deprecated use `syncs` */
  providers?: TamerStateSync[]
}

/** Payload shape from `TamerNav.dispatch` / `tamer-nav:dispatch` (JSON string in `action`). */
export type CoordinatorNavDispatchAction =
  | { type: 'shared-context-mutate'; screenId?: string; payloadJson: string }
  | { type: 'push-route'; route: string; replace?: boolean }
  | { type: string; [k: string]: unknown }

export type FileRouterProps = {
  /** `MemoryRouter` + your `<Routes>…</Routes>` (see https://lynxjs.org/react/routing/react-router.md) */
  children?: ReactNode
  /**
   * Must be `true` when the build still uses `lazy()` for any file route (`tamerRouterPlugin({ lazyRoutes: true })` or `{ eagerPaths: [...] }` with at least one lazy page); see `TAMER_LAZY_ROUTES` in `generated-lazy-flag`.
   * Omit or `false` when all routes are static imports. Hybrid lazy can reduce IFR snapshot issues vs full lazy; `firstScreenSyncTiming: 'jsReady'` may help but is not guaranteed.
   */
  lazyRoutes?: boolean
  basename?: string
  bundleSrc?: string
  rootBackgroundColor?: string
  exitOnRootHardwareBack?: boolean
  /** Paths to list on 404 in `TamerDefaultNotFound` if you add that route. */
  knownPaths?: string[]
  /** @deprecated set `notFoundElement` in `<Routes><Route path="*"/></Routes>` */
  notFoundComponent?: (() => ReactNode) | React.ComponentType
  /**
   * Coordinator only: invoked for each parsed `tamer-nav:dispatch` before the built-in
   * `shared-context-mutate` → `TamerStateSyncProvider` bridge (see `applyDefaultCoordinatorNavDispatch`).
   */
  onNavDispatch?: (action: CoordinatorNavDispatchAction) => void
}

/** Manifest shape emitted by `tamerRouterPlugin` into `generated-routes`. */
export type GeneratedRoutesManifest = {
  layouts: Record<
    string,
    {
      id: string
      basePath: string
      kind: string
      component: unknown
      screens: Array<{ name: string; path?: string; options?: unknown }>
      children: Array<{
        name: string
        kind: string
        segmentPath: string
        targetPath: string
        options?: unknown
      }>
    }
  >
  routes: Array<{
    id: string
    routePath: string
    component: unknown
    layoutIds: string[]
    childNameByLayoutId: Record<string, string>
    matcher: RegExp
    paramNames: string[]
    score: number
  }>
  initialPath: string
  defaultPathByBasePath: Record<string, string>
}
