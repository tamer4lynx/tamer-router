import React from 'react'
import { createHistory, type HistoryLocation, type HistoryState, type RouterHistory } from '@tanstack/history'
import {
  Matches,
  createRouter,
  getRouterContext,
  useRouter,
  useRouterState,
  type RegisteredRouter,
  type RoutePaths,
  type ToOptions,
  type AnyRoute,
} from '@tanstack/react-router'
import { AppShellRouterContext, type AppShellRouterContextValue } from '@tamer4lynx/tamer-app-shell'
import {
  type BackHandlerRegistry,
  BackHandlerContext,
  createBackHandlerRegistry,
  useTamerBackEvent,
} from './back-handler.js'
import { Outlet, useLocation } from './router-compat.js'

export interface FileRouterProps {
  routes: AnyRoute
  basename?: string
  transitionConfig?: TransitionConfig
  navigationHost?: NavigationHost
}

export type NavigationHost = 'native-module' | 'nav-screen'

declare const lynx: { getJSModule?(id: string): { addListener?(e: string, fn: (ev: { payload?: string }) => void): void; removeListener?(e: string, fn: unknown): void } } | undefined
export type TransitionDirection = 'left' | 'right'

export type TransitionMode = 'stack' | 'scroll'

export interface TransitionConfig {
  enabled?: boolean
  direction?: TransitionDirection
  mode?: TransitionMode
}

export interface TransitionOptions {
  mode?: TransitionMode
  direction?: TransitionDirection
}

declare const NativeModules: {
  TamerRouterNativeModule?: {
    didHandleBack(consumed: boolean): void
    push(): void
    pop(): void
    replace(): void
    preparePush(route: string, optionsJson?: string): void
    prepareReplace(route: string, optionsJson?: string): void
    preparePop(optionsJson?: string): void
    requestPush(route: string, optionsJson: string | undefined, callback: () => void): void
    requestReplace(route: string, optionsJson: string | undefined, callback: () => void): void
    requestPop(optionsJson: string | undefined, callback: () => void): void
    setTransitionOptions(optionsJson?: string): void
    setTransitionConfig(enabled?: boolean, direction?: string, mode?: string): void
    setHistoryState(stateJson: string): void
    consumeHistoryState(callback: (stateJson?: string) => void): void
  }
} | undefined

interface TanStackLocationLike {
  pathname?: string
  search?: unknown
  searchStr?: string
  hash?: string
  href?: string
}

interface TanStackHistoryLike {
  back(): void
  forward?(): void
  go?(delta: number): void
  push(path: string): void
  replace(path: string): void
  subscribe?(listener: () => void): () => void
  location?: TanStackLocationLike
}

interface TanStackRouterLike {
  history: TanStackHistoryLike
  update: (options: Record<string, unknown>) => void
  parseLocation?: (previousLocation?: TanStackLocationLike & { href?: string }) => TanStackLocationLike & { href: string }
  options: Record<string, unknown> & {
    context?: Record<string, unknown>
    Wrap?: React.ComponentType<{ children: React.ReactNode }>
    InnerWrap?: React.ComponentType<{ children: React.ReactNode }>
  }
  __store: {
    setState: (updater: (state: Record<string, unknown>) => Record<string, unknown>) => void
  }
  emit: (event: {
    type: 'onResolved'
    fromLocation: TanStackLocationLike
    toLocation: TanStackLocationLike
    pathChanged: boolean
  }) => void
  load: () => void
  buildLocation: (options: Record<string, unknown>) => TanStackLocationLike & { href: string; replace?: boolean }
  commitLocation: (location: TanStackLocationLike & { href?: string; replace?: boolean }) => void
  latestLocation: TanStackLocationLike & { href?: string }
  state: {
    isLoading?: boolean
    isTransitioning?: boolean
    location?: TanStackLocationLike
    resolvedLocation?: TanStackLocationLike & { href?: string }
  }
}

function stringifyOptions(options?: TransitionOptions): string | undefined {
  if (!options || (options.mode == null && options.direction == null)) return undefined
  return JSON.stringify(options)
}

type NavigationAction = 'push' | 'replace' | 'back' | 'tab'

interface NavigationEntry {
  key: string
  path: string
}

interface PersistedHistoryState {
  entries: string[]
  index: number
}

interface NavigationController {
  push(route: string): void
  replace(route: string): void
  tabReplace(route: string): void
  back(): void
  canGoBack(): boolean
  consumePendingAction(): NavigationAction | null
  getHistoryState(): { entries: NavigationEntry[]; index: number }
}

interface RenderedStackEntry extends NavigationEntry {
  visible: boolean
  transition: NavScreenTransition
}

type NavScreenTransition =
  | 'slide-right'
  | 'slide-left'
  | 'slide-up'
  | 'slide-down'
  | 'fade'
  | 'none'

type RegisteredRouteTree = RegisteredRouter['routeTree']

export type TamerRoutePath<TRouteTree extends AnyRoute = RegisteredRouteTree> = RoutePaths<TRouteTree>

export type TamerToOptions<
  TRouteTree extends AnyRoute = RegisteredRouteTree,
  TFrom extends RoutePaths<TRouteTree> | string = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>

export interface TamerNavigateFn {
  <TRouteTree extends AnyRoute = RegisteredRouteTree>(to: RoutePaths<TRouteTree>, options?: TransitionOptions): void
  <
    TRouteTree extends AnyRoute = RegisteredRouteTree,
    TFrom extends RoutePaths<TRouteTree> | string = '/',
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
    TMaskTo extends string = '',
  >(to: ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>, options?: TransitionOptions): void
  (to: string, options?: TransitionOptions): void
}

export interface TamerNavigateApi {
  push: TamerNavigateFn
  replace: TamerNavigateFn
  back: (options?: TransitionOptions) => void
  pop: (options?: TransitionOptions) => void
  canGoBack: () => boolean
}

function getLocationPath(location: TanStackLocationLike | undefined): string {
  const search = typeof location?.search === 'string'
    ? location.search
    : (location?.searchStr ?? '')
  return `${location?.pathname ?? '/'}${search}${location?.hash ?? ''}`
}

function createKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function resolveNavigationHref(
  router: TanStackRouterLike,
  to: string | Record<string, unknown>,
): string {
  if (typeof to === 'string') return to
  return router.buildLocation(to).href
}

function getNavScreenTransition(transitionConfig?: TransitionConfig): NavScreenTransition {
  if (transitionConfig?.direction === 'left') return 'slide-left'
  return 'slide-right'
}

function parseHistoryHref(href: string, state: HistoryState): HistoryLocation {
  const hashIndex = href.indexOf('#')
  const searchIndex = href.indexOf('?')

  return {
    href,
    pathname: href.substring(
      0,
      hashIndex > 0
        ? searchIndex > 0
          ? Math.min(hashIndex, searchIndex)
          : hashIndex
        : searchIndex > 0
          ? searchIndex
          : href.length,
    ),
    hash: hashIndex > -1 ? href.substring(hashIndex) : '',
    search: searchIndex > -1 ? href.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex) : '',
    state: state || {},
  }
}

function createLynxMemoryHistory(
  opts: {
    initialEntries: string[]
    initialIndex?: number
  } = {
    initialEntries: ['/'],
  },
): RouterHistory {
  const entries = [...opts.initialEntries]
  let index = Math.max(0, Math.min(entries.length - 1, opts.initialIndex ?? entries.length - 1))
  let currentState: HistoryState = { key: createKey() }

  const getLocation = () => parseHistoryHref(entries[index] ?? '/', currentState)

  const history = createHistory({
    getLocation,
    pushState: (path, state) => {
      currentState = state
      entries.splice(index + 1)
      entries.push(path)
      index = entries.length - 1
    },
    replaceState: (path, state) => {
      currentState = state
      entries[index] = path
    },
    back: () => {
      index = Math.max(index - 1, 0)
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
    },
    go: (delta) => {
      index = Math.min(Math.max(index + delta, 0), entries.length - 1)
    },
    createHref: (path) => path,
  })

  const baseBack = history.back.bind(history)
  const baseForward = history.forward.bind(history)
  const baseGo = history.go.bind(history)

  history.back = () => {
    baseBack()
    history.notify()
  }

  history.forward = () => {
    baseForward()
    history.notify()
  }

  history.go = (delta: number) => {
    baseGo(delta)
    history.notify()
  }

  return history
}

function readPersistedHistoryState(): PersistedHistoryState | null {
  let restored: PersistedHistoryState | null = null
  NativeModules?.TamerRouterNativeModule?.consumeHistoryState?.((stateJson?: string) => {
    if (typeof stateJson !== 'string' || stateJson.length === 0) return
    try {
      const parsed = JSON.parse(stateJson) as Partial<PersistedHistoryState>
      if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return
      const entries = parsed.entries.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      if (entries.length === 0) return
      const rawIndex = typeof parsed.index === 'number' ? parsed.index : entries.length - 1
      restored = {
        entries,
        index: Math.max(0, Math.min(entries.length - 1, rawIndex)),
      }
    } catch (_) {}
  })
  return restored
}

function subscribeToHistory(router: TanStackRouterLike, onChange: () => void): () => void {
  if (typeof router.history.subscribe === 'function') return router.history.subscribe(onChange)
  return () => {}
}

function useNavigationController(router: TanStackRouterLike, initialHistoryState: PersistedHistoryState | null): NavigationController {
  const stateRef = React.useRef<{ entries: NavigationEntry[]; index: number; pendingAction: NavigationAction | null }>({
    entries: (initialHistoryState?.entries ?? [getLocationPath(router.state.location)]).map((path) => ({ key: createKey(), path })),
    index: initialHistoryState?.index ?? 0,
    pendingAction: null,
  })

  const push = React.useCallback((route: string) => {
    const state = stateRef.current
    const nextIndex = state.index + 1
    const nextEntries = state.entries.slice(0, nextIndex)
    nextEntries.push({ key: createKey(), path: route })
    state.entries = nextEntries
    state.index = nextIndex
    state.pendingAction = 'push'
    router.history.push(route)
  }, [router])

  const replace = React.useCallback((route: string) => {
    const state = stateRef.current
    state.entries = state.entries.slice()
    state.entries[state.index] = { key: createKey(), path: route }
    state.pendingAction = 'replace'
    router.history.replace(route)
  }, [router])

  const tabReplace = React.useCallback((route: string) => {
    const state = stateRef.current
    state.entries = state.entries.slice()
    state.entries[state.index] = { key: createKey(), path: route }
    state.pendingAction = 'tab'
    router.history.replace(route)
  }, [router])

  const back = React.useCallback(() => {
    const state = stateRef.current
    if (state.index <= 0) return
    state.index -= 1
    state.entries = state.entries.slice(0, state.index + 1)
    state.pendingAction = 'back'
    router.history.back()
  }, [router])

  const canGoBack = React.useCallback(() => stateRef.current.index > 0, [])

  const consumePendingAction = React.useCallback(() => {
    const action = stateRef.current.pendingAction
    stateRef.current.pendingAction = null
    return action
  }, [])

  const getHistoryState = React.useCallback(() => ({
    entries: stateRef.current.entries.slice(),
    index: stateRef.current.index,
  }), [])

  React.useEffect(() => subscribeToHistory(router, () => {
    const state = stateRef.current
    const path = getLocationPath(router.history.location ?? router.state.location)
    const action = state.pendingAction

    if (action === 'push' || action === 'replace' || action === 'back' || action === 'tab') {
      state.entries[state.index] = { ...state.entries[state.index], path }
      return
    }

    state.entries = [{ key: createKey(), path }]
    state.index = 0
    state.pendingAction = null
  }), [router])

  return React.useMemo(() => ({ push, replace, tabReplace, back, canGoBack, consumePendingAction, getHistoryState }), [back, canGoBack, push, replace, tabReplace, consumePendingAction, getHistoryState])
}

function useNativeNavigate(controller: NavigationController) {
  React.useEffect(() => {
    const bridge = typeof lynx !== 'undefined' ? lynx?.getJSModule?.('GlobalEventEmitter') : undefined
    if (!bridge?.addListener) return
    const handler = (ev: { payload?: string }) => {
      try {
        const { route, action } = JSON.parse(ev.payload ?? '{}') as { route?: string; action?: NavigationAction }
        if (action === 'back') controller.back()
        else if (typeof route === 'string' && action === 'replace') controller.replace(route)
        else if (typeof route === 'string') controller.push(route)
      } catch (_) {}
    }
    bridge.addListener('tamer-router:navigate', handler)
    return () => { bridge.removeListener?.('tamer-router:navigate', handler) }
  }, [controller])
}

function NavigationAnimator() {
  const location = useLocation()
  const controller = React.useContext(NavigationContext)

  React.useEffect(() => {
    const action = controller?.consumePendingAction()
    if (!action) return
    const run = () => {
      if (action === 'push') NativeModules?.TamerRouterNativeModule?.push?.()
      else if (action === 'back') NativeModules?.TamerRouterNativeModule?.pop?.()
      else if (action === 'replace') NativeModules?.TamerRouterNativeModule?.replace?.()
      // 'tab' -> no native animation, handled by CSS in Tabs
    }
    setTimeout(run, 0)
  }, [location.pathname, location.search, location.hash, controller])

  return React.createElement(Outlet)
}

const NavigationContext = React.createContext<NavigationController | null>(null)
const NavigationHostContext = React.createContext<NavigationHost>('native-module')

function useNativeTransitionActions(controller: NavigationController | null, navigationHost: NavigationHost) {
  const push = React.useCallback((route: string, options?: TransitionOptions) => {
    if (navigationHost === 'nav-screen') {
      controller?.push(route)
      return
    }
    const mod = NativeModules?.TamerRouterNativeModule
    const opts = stringifyOptions(options)
    const doPush = () => controller?.push(route)
    if (mod?.requestPush) mod.requestPush(route, opts, doPush)
    else doPush()
  }, [controller, navigationHost])

  const replace = React.useCallback((route: string, options?: TransitionOptions) => {
    if (navigationHost === 'nav-screen') {
      controller?.replace(route)
      return
    }
    const mod = NativeModules?.TamerRouterNativeModule
    const opts = stringifyOptions(options)
    const doReplace = () => controller?.replace(route)
    if (mod?.setTransitionOptions && opts != null) mod.setTransitionOptions(opts)
    if (mod?.requestReplace) mod.requestReplace(route, opts, doReplace)
    else doReplace()
  }, [controller, navigationHost])

  const back = React.useCallback((options?: TransitionOptions) => {
    if (navigationHost === 'nav-screen') {
      controller?.back()
      return
    }
    const mod = NativeModules?.TamerRouterNativeModule
    const opts = stringifyOptions(options)
    const doBack = () => controller?.back()
    if (mod?.requestPop) mod.requestPop(opts, doBack)
    else if (mod?.preparePop) mod.preparePop(opts)
    else doBack()
  }, [controller, navigationHost])

  return React.useMemo(() => ({ push, replace, back }), [back, push, replace])
}

function pickLocationState(router: TanStackRouterLike) {
  return useRouterState({
    router: router as never,
    select: (state) => ({
      isLoading: state.isLoading,
      isTransitioning: state.isTransitioning,
      location: state.location,
      resolvedLocation: state.resolvedLocation,
    }),
  })
}

function LynxTransitioner({ router }: { router: TanStackRouterLike }) {
  const mountLoadForRouter = React.useRef({ router, mounted: false })
  const routerState = pickLocationState(router)
  const transitionTuple = (React as typeof React & {
    useTransition?: () => [boolean, (cb: () => void) => void]
  }).useTransition?.() ?? [false, (cb: () => void) => cb()]
  const isTransitioning = transitionTuple[0]
  const startReactTransition = transitionTuple[1]

  ;(router as TanStackRouterLike & { startReactTransition?: (fn: () => void) => void }).startReactTransition = startReactTransition

  React.useEffect(() => {
    if (isTransitioning) {
      router.__store.setState((s) => ({
        ...s,
        isTransitioning,
      }))
    }
  }, [isTransitioning, router])

  const tryLoad = React.useCallback(() => {
    const apply = (cb: () => void) => {
      if (!routerState.isTransitioning) startReactTransition(cb)
      else cb()
    }

    apply(() => {
      try {
        router.load()
      } catch (err) {
        console.error(err)
      }
    })
  }, [router, routerState.isTransitioning, startReactTransition])

  React.useEffect(() => {
    const unsub = subscribeToHistory(router, () => {
      router.latestLocation = router.parseLocation?.(router.latestLocation) ?? router.latestLocation
      if (router.state.location !== router.latestLocation) {
        tryLoad()
      }
    })

    const nextLocation = router.buildLocation({
      to: router.latestLocation.pathname ?? '/',
      search: true,
      params: true,
      hash: true,
      state: true,
    })

    const currentHref = routerState.location?.href
    if (currentHref !== nextLocation.href) {
      router.commitLocation({ ...nextLocation, replace: true })
    }

    return () => {
      unsub()
    }
  }, [router, routerState.location?.href, tryLoad])

  React.useEffect(() => {
    if (
      ((React as typeof React & { useTransition?: unknown }).useTransition
        ? routerState.isTransitioning && !isTransitioning
        : !routerState.isLoading && routerState.resolvedLocation !== routerState.location)
    ) {
      router.emit({
        type: 'onResolved',
        fromLocation: routerState.resolvedLocation ?? routerState.location ?? { pathname: '/' },
        toLocation: routerState.location ?? { pathname: '/' },
        pathChanged: routerState.location?.href !== routerState.resolvedLocation?.href,
      })
      router.__store.setState((s) => ({
        ...s,
        isTransitioning: false,
        resolvedLocation: (s as { location?: unknown }).location,
      }))
    }
  }, [
    router,
    routerState.isTransitioning,
    isTransitioning,
    routerState.isLoading,
    routerState.resolvedLocation,
    routerState.location,
  ])

  React.useEffect(() => {
    if (mountLoadForRouter.current.router === router && mountLoadForRouter.current.mounted) return
    mountLoadForRouter.current = { router, mounted: true }
    tryLoad()
  }, [router, tryLoad])

  return null
}

function LynxRouterProvider({ router }: { router: TanStackRouterLike }) {
  router.update({
    ...router.options,
  })

  const matches = router.options.InnerWrap
    ? React.createElement(router.options.InnerWrap, { children: React.createElement(Matches) })
    : React.createElement(Matches)
  const RouterContext = getRouterContext()
  const provider = React.createElement(
    RouterContext.Provider as unknown as React.Provider<TanStackRouterLike>,
    { value: router as never },
    matches,
    React.createElement(LynxTransitioner, { router }),
  )

  if (router.options.Wrap) {
    return React.createElement(router.options.Wrap, { children: provider })
  }

  return provider
}

function createScreenRouter(routes: AnyRoute, basename: string, initialPath: string): TanStackRouterLike {
  const history = createLynxMemoryHistory({
    initialEntries: [initialPath],
  })

  return createRouter({
    routeTree: routes,
    history,
    basepath: basename,
  }) as unknown as TanStackRouterLike
}

interface StackHostScreenProps {
  entry: RenderedStackEntry
  routes: AnyRoute
  basename: string
  navigationElement?: boolean
  onBackRegistry: (key: string, registry: BackHandlerRegistry | null) => void
}

const StackHostScreen = React.memo(function StackHostScreen({
  entry,
  routes,
  basename,
  navigationElement = false,
  onBackRegistry,
}: StackHostScreenProps) {
  const routerRef = React.useRef<TanStackRouterLike | null>(null)
  const backHandlerRegistry = React.useMemo(() => createBackHandlerRegistry(), [])

  if (!routerRef.current) {
    routerRef.current = createScreenRouter(routes, basename, entry.path)
  }

  React.useEffect(() => {
    const router = routerRef.current
    if (!router) return
    if (getLocationPath(router.state.location) !== entry.path) {
      router.history.replace(entry.path)
    }
  }, [entry.path])

  React.useEffect(() => {
    onBackRegistry(entry.key, backHandlerRegistry)
    return () => onBackRegistry(entry.key, null)
  }, [backHandlerRegistry, entry.key, onBackRegistry])

  const content = React.createElement(
    BackHandlerContext.Provider,
    { value: backHandlerRegistry },
    React.createElement(LynxRouterProvider, { router: routerRef.current }),
  )

  if (!navigationElement) return content

  return React.createElement(
    'nav-screen' as unknown as React.ElementType,
    {
      'screen-id': entry.key,
      visible: entry.visible,
      transition: entry.transition,
    },
    content,
  )
})

const NAV_SCREEN_EXIT_MS = 320

function NavScreenStackHost({
  controller,
  router,
  routes,
  basename,
  transitionConfig,
  activeBackHandlerRegistryRef,
}: {
  controller: NavigationController
  router: TanStackRouterLike
  routes: AnyRoute
  basename: string
  transitionConfig?: TransitionConfig
  activeBackHandlerRegistryRef: React.MutableRefObject<BackHandlerRegistry | null>
}) {
  const defaultTransition = getNavScreenTransition(transitionConfig)
  const backRegistryByKeyRef = React.useRef(new Map<string, BackHandlerRegistry>())
  const removalTimeoutsRef = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const [renderedEntries, setRenderedEntries] = React.useState<RenderedStackEntry[]>(() => {
    const historyState = controller.getHistoryState()
    return historyState.entries.map((entry, index) => ({
      ...entry,
      visible: true,
      transition: index === 0 ? 'none' : defaultTransition,
    }))
  })

  const registerBackRegistry = React.useCallback((key: string, registry: BackHandlerRegistry | null) => {
    const map = backRegistryByKeyRef.current
    if (registry) map.set(key, registry)
    else map.delete(key)
  }, [])

  React.useEffect(() => () => {
    removalTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
    removalTimeoutsRef.current.clear()
  }, [])

  React.useEffect(() => subscribeToHistory(router, () => {
    const historyState = controller.getHistoryState()
    const nextEntries = historyState.entries
    const nextEntryKeys = new Set(nextEntries.map((entry) => entry.key))
    const action = controller.consumePendingAction()

    setRenderedEntries((currentEntries) => {
      const nextRenderedEntries = nextEntries.map((entry, index) => {
        const existing = currentEntries.find((candidate) => candidate.key === entry.key)
        if (existing) {
          return {
            ...existing,
            path: entry.path,
            visible: true,
          }
        }

        return {
          ...entry,
          visible: true,
          transition: index === 0 ? 'none' : defaultTransition,
        }
      })

      currentEntries.forEach((entry) => {
        if (nextEntryKeys.has(entry.key)) return

        const existingTimeout = removalTimeoutsRef.current.get(entry.key)
        if (existingTimeout) clearTimeout(existingTimeout)

        if (action === 'back') {
          nextRenderedEntries.push({
            ...entry,
            visible: false,
          })

          const timeoutId = setTimeout(() => {
            removalTimeoutsRef.current.delete(entry.key)
            setRenderedEntries((latestEntries) => latestEntries.filter((candidate) => candidate.key !== entry.key))
          }, NAV_SCREEN_EXIT_MS)

          removalTimeoutsRef.current.set(entry.key, timeoutId)
        } else {
          removalTimeoutsRef.current.delete(entry.key)
        }
      })

      return nextRenderedEntries
    })
  }), [controller, defaultTransition, router])

  React.useEffect(() => {
    const activeEntry = [...renderedEntries].reverse().find((entry) => entry.visible) ?? null
    activeBackHandlerRegistryRef.current = activeEntry ? backRegistryByKeyRef.current.get(activeEntry.key) ?? null : null
  }, [activeBackHandlerRegistryRef, renderedEntries])

  const rootEntry = renderedEntries[0]
  const overlayEntries = renderedEntries.slice(1)

  return React.createElement(
    React.Fragment,
    null,
    rootEntry ? React.createElement(StackHostScreen, {
      key: rootEntry.key,
      entry: rootEntry,
      routes,
      basename,
      onBackRegistry: registerBackRegistry,
    }) : null,
    ...overlayEntries.map((entry) => React.createElement(StackHostScreen, {
      key: entry.key,
      entry,
      routes,
      basename,
      navigationElement: true,
      onBackRegistry: registerBackRegistry,
    })),
  )
}

export function FileRouter({
  routes,
  basename = '/',
  transitionConfig,
  navigationHost = 'native-module',
}: FileRouterProps): JSX.Element {
  if (!routes || typeof routes !== 'object') {
    throw new Error('tamer-router: routes must be a generated TanStack route tree. Ensure pluginTamer() is configured and src/pages contains route files.')
  }

  React.useEffect(() => {
    const mod = NativeModules?.TamerRouterNativeModule
    if (mod?.setTransitionConfig && transitionConfig != null) {
      mod.setTransitionConfig(transitionConfig.enabled, transitionConfig.direction, transitionConfig.mode)
    }
  }, [transitionConfig])

  const initialHistoryStateRef = React.useRef<PersistedHistoryState | null>(null)
  if (initialHistoryStateRef.current == null) {
    initialHistoryStateRef.current = readPersistedHistoryState()
  }

  const routerRef = React.useRef<TanStackRouterLike | null>(null)
  if (!routerRef.current) {
    const initialHistoryState = initialHistoryStateRef.current
    const memoryHistory = createLynxMemoryHistory({
      initialEntries: initialHistoryState?.entries ?? [basename],
      initialIndex: initialHistoryState?.index,
    })
    routerRef.current = createRouter({
      routeTree: routes,
      history: memoryHistory,
      basepath: basename,
    }) as unknown as TanStackRouterLike
  }

  const router = routerRef.current
  const controller = useNavigationController(router, initialHistoryStateRef.current)
  const transitionActions = useNativeTransitionActions(controller, navigationHost)
  const rootBackHandlerRegistry = React.useMemo(() => createBackHandlerRegistry(), [])
  const activeBackHandlerRegistryRef = React.useRef<BackHandlerRegistry | null>(null)
  const delegatedBackHandlerRegistry = React.useMemo<BackHandlerRegistry>(() => ({
    add() {
      return () => {}
    },
    invoke() {
      return activeBackHandlerRegistryRef.current?.invoke() ?? false
    },
  }), [])
  const backHandlerRegistry = navigationHost === 'nav-screen'
    ? delegatedBackHandlerRegistry
    : rootBackHandlerRegistry
  const onBackUnhandled = React.useCallback(() => {
    const canGoBack = controller.canGoBack()
    if (canGoBack) controller.back()
    NativeModules?.TamerRouterNativeModule?.didHandleBack?.(canGoBack)
  }, [controller])

  useTamerBackEvent(backHandlerRegistry, onBackUnhandled)

  React.useEffect(() => subscribeToHistory(router, () => {
    const historyState = controller.getHistoryState()
    NativeModules?.TamerRouterNativeModule?.setHistoryState?.(JSON.stringify({
      entries: historyState.entries.map((entry) => entry.path),
      index: historyState.index,
    }))
  }), [controller, router])

  React.useEffect(() => {
    const historyState = controller.getHistoryState()
    NativeModules?.TamerRouterNativeModule?.setHistoryState?.(JSON.stringify({
      entries: historyState.entries.map((entry) => entry.path),
      index: historyState.index,
    }))
  }, [controller])

  useNativeNavigate(controller)

  const appShellRouterValue = React.useMemo<AppShellRouterContextValue>(
    () => ({
      back: () => transitionActions.back(),
      canGoBack: () => controller.canGoBack(),
      replace: (route: string, options?: { mode?: string; direction?: string; tab?: boolean }) => {
        if (options?.tab) {
          controller.tabReplace(route)
          return
        }
        transitionActions.replace(route, options ? {
          mode: options.mode as TransitionMode | undefined,
          direction: options.direction as TransitionDirection | undefined,
        } : undefined)
      },
    }),
    [controller, transitionActions]
  )

  return React.createElement(
    NavigationContext.Provider,
    { value: controller },
    React.createElement(
      NavigationHostContext.Provider,
      { value: navigationHost },
      React.createElement(
        BackHandlerContext.Provider,
        { value: backHandlerRegistry },
        React.createElement(
          AppShellRouterContext.Provider as React.Provider<AppShellRouterContextValue>,
          { value: appShellRouterValue },
          navigationHost === 'nav-screen'
            ? React.createElement(NavScreenStackHost, {
                controller,
                router,
                routes,
                basename,
                transitionConfig,
                activeBackHandlerRegistryRef,
              })
            : React.createElement(LynxRouterProvider, { router }),
        ),
      ),
    ),
  )
}

export function useTamerNavigate(): TamerNavigateApi {
  const controller = React.useContext(NavigationContext)
  const navigationHost = React.useContext(NavigationHostContext)
  const router = useRouter() as unknown as TanStackRouterLike
  const transitionActions = useNativeTransitionActions(controller, navigationHost)
  const canGoBack = React.useCallback(() => controller?.canGoBack() ?? false, [controller])
  const push = React.useMemo<TamerNavigateFn>(() => (
    (to: string | Record<string, unknown>, options?: TransitionOptions) => {
      transitionActions.push(resolveNavigationHref(router, to), options)
    }
  ) as TamerNavigateFn, [router, transitionActions])
  const replace = React.useMemo<TamerNavigateFn>(() => (
    (to: string | Record<string, unknown>, options?: TransitionOptions) => {
      transitionActions.replace(resolveNavigationHref(router, to), options)
    }
  ) as TamerNavigateFn, [router, transitionActions])

  return {
    push,
    replace,
    back: transitionActions.back,
    pop: transitionActions.back,
    canGoBack,
  }
}

export function useTamerRouter() {
  return useTamerNavigate()
}
