import React from 'react'
import { createMemoryRouter, RouterProvider, useLocation, Outlet, type RouteObject } from 'react-router'

export interface FileRouterProps {
  routes: RouteObject[]
  basename?: string
  transitionConfig?: TransitionConfig
}

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

function stringifyOptions(options?: TransitionOptions): string | undefined {
  if (!options || (options.mode == null && options.direction == null)) return undefined
  return JSON.stringify(options)
}

type NavigationAction = 'push' | 'replace' | 'back'

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
  back(): void
  canGoBack(): boolean
  consumePendingAction(): NavigationAction | null
  getHistoryState(): { entries: NavigationEntry[]; index: number }
}

function getLocationPath(state: ReturnType<typeof createMemoryRouter>['state']): string {
  const location = (state as { location?: { pathname?: string; search?: string; hash?: string } }).location
  return `${location?.pathname ?? '/'}${location?.search ?? ''}${location?.hash ?? ''}`
}

function createKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
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

function useNavigationController(router: ReturnType<typeof createMemoryRouter>, initialHistoryState: PersistedHistoryState | null): NavigationController {
  const stateRef = React.useRef<{ entries: NavigationEntry[]; index: number; pendingAction: NavigationAction | null }>({
    entries: (initialHistoryState?.entries ?? [getLocationPath(router.state)]).map((path) => ({ key: createKey(), path })),
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
    router.navigate(route, { replace: false })
  }, [router])

  const replace = React.useCallback((route: string) => {
    const state = stateRef.current
    state.entries = state.entries.slice()
    state.entries[state.index] = { key: createKey(), path: route }
    state.pendingAction = 'replace'
    router.navigate(route, { replace: true })
  }, [router])

  const back = React.useCallback(() => {
    const state = stateRef.current
    if (state.index <= 0) return
    state.index -= 1
    state.entries = state.entries.slice(0, state.index + 1)
    state.pendingAction = 'back'
    router.navigate(-1)
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

  React.useEffect(() => {
    const unsubscribe = router.subscribe((nextState) => {
      const state = stateRef.current
      const path = getLocationPath(nextState)
      const action = state.pendingAction

      if (action === 'push') {
        state.entries[state.index] = { ...state.entries[state.index], path }
      } else if (action === 'replace') {
        state.entries[state.index] = { ...state.entries[state.index], path }
      } else if (action === 'back') {
        state.entries[state.index] = { ...state.entries[state.index], path }
      } else {
        state.entries = [{ key: createKey(), path }]
        state.index = 0
        state.pendingAction = null // Reset if it was an external change
      }
    })
    return unsubscribe
  }, [router])

  return React.useMemo(() => ({ push, replace, back, canGoBack, consumePendingAction, getHistoryState }), [back, canGoBack, push, replace, consumePendingAction, getHistoryState])
}

function useNativeBack(controller: NavigationController) {
  React.useEffect(() => {
    const bridge = typeof lynx !== 'undefined' ? lynx?.getJSModule?.('GlobalEventEmitter') : undefined
    if (!bridge?.addListener) return
    const handler = () => {
      const canGoBack = controller.canGoBack()
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[tamer-router] back: canGoBack=', canGoBack)
      }
      if (canGoBack) controller.back()
      NativeModules?.TamerRouterNativeModule?.didHandleBack?.(canGoBack)
    }
    bridge.addListener('tamer-router:back', handler)
    return () => { bridge.removeListener?.('tamer-router:back', handler) }
  }, [controller])
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
    }
    setTimeout(run, 0)
  }, [location.pathname, location.key, controller])

  return React.createElement(Outlet)
}

const NavigationContext = React.createContext<NavigationController | null>(null)

export function FileRouter({ routes, basename = '/', transitionConfig }: FileRouterProps): JSX.Element {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('tamer-router: routes must be a non-empty array.')
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
  const routerRef = React.useRef<ReturnType<typeof createMemoryRouter> | null>(null)
  if (!routerRef.current) {
    const wrappedRoutes: RouteObject[] = [
      {
        path: '/',
        element: React.createElement(NavigationAnimator),
        children: routes,
      },
    ]
    const initialHistoryState = initialHistoryStateRef.current
    routerRef.current = createMemoryRouter(wrappedRoutes, {
      basename,
      initialEntries: initialHistoryState?.entries,
      initialIndex: initialHistoryState?.index,
    })
  }
  const router = routerRef.current
  const controller = useNavigationController(router, initialHistoryStateRef.current)
  React.useEffect(() => {
    const unsubscribe = router.subscribe((nextState) => {
      const historyState = controller.getHistoryState()
      NativeModules?.TamerRouterNativeModule?.setHistoryState?.(JSON.stringify({
        entries: historyState.entries.map((entry) => entry.path),
        index: historyState.index,
      }))
    })
    const historyState = controller.getHistoryState()
    NativeModules?.TamerRouterNativeModule?.setHistoryState?.(JSON.stringify({
      entries: historyState.entries.map((entry) => entry.path),
      index: historyState.index,
    }))
    return unsubscribe
  }, [controller, router])
  useNativeBack(controller)
  useNativeNavigate(controller)
  return React.createElement(
    NavigationContext.Provider,
    { value: controller },
    React.createElement(RouterProvider, { router }),
  )
}

export function useTamerNavigate() {
  const controller = React.useContext(NavigationContext)
  const push = React.useCallback((route: string, options?: TransitionOptions) => {
    const mod = NativeModules?.TamerRouterNativeModule
    const opts = stringifyOptions(options)
    const doPush = () => controller?.push(route)
    if (mod?.requestPush) mod.requestPush(route, opts, doPush)
    else doPush()
  }, [controller])
  const replace = React.useCallback((route: string, options?: TransitionOptions) => {
    const mod = NativeModules?.TamerRouterNativeModule
    const opts = stringifyOptions(options)
    const doReplace = () => controller?.replace(route)
    if (mod?.setTransitionOptions && opts != null) mod.setTransitionOptions(opts)
    if (mod?.requestReplace) mod.requestReplace(route, opts, doReplace)
    else doReplace()
  }, [controller])
  const back = React.useCallback((options?: TransitionOptions) => {
    const mod = NativeModules?.TamerRouterNativeModule
    const opts = stringifyOptions(options)
    const doBack = () => controller?.back()
    if (mod?.requestPop) mod.requestPop(opts, doBack)
    else if (mod?.preparePop) mod.preparePop(opts)
    else doBack()
  }, [controller])
  const canGoBack = React.useCallback(() => controller?.canGoBack() ?? false, [controller])
  return { push, replace, back, pop: back, canGoBack }
}

export function useTamerRouter() {
  return useTamerNavigate()
}
