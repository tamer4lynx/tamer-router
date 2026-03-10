import React from 'react'
import { createMemoryRouter, RouterProvider, useLocation, Outlet, type RouteObject } from 'react-router'

export interface FileRouterProps {
  routes: RouteObject[]
  basename?: string
}

declare const lynx: { getJSModule?(id: string): { addListener?(e: string, fn: (ev: { payload?: string }) => void): void; removeListener?(e: string, fn: unknown): void } } | undefined
declare const NativeModules: {
  TamerRouterNativeModule?: {
    didHandleBack(consumed: boolean): void
    push(): void
    pop(): void
    replace(): void
    preparePush(route: string): void
    prepareReplace(route: string): void
    preparePop(): void
  }
} | undefined

type NavigationAction = 'push' | 'replace' | 'back'

interface NavigationEntry {
  key: string
  path: string
}

interface NavigationController {
  push(route: string): void
  replace(route: string): void
  back(): void
  canGoBack(): boolean
  consumePendingAction(): NavigationAction | null
}

function getLocationPath(state: ReturnType<typeof createMemoryRouter>['state']): string {
  const location = (state as { location?: { pathname?: string; search?: string; hash?: string } }).location
  return `${location?.pathname ?? '/'}${location?.search ?? ''}${location?.hash ?? ''}`
}

function createKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function useNavigationController(router: ReturnType<typeof createMemoryRouter>): NavigationController {
  const stateRef = React.useRef<{ entries: NavigationEntry[]; index: number; pendingAction: NavigationAction | null }>({
    entries: [{ key: createKey(), path: getLocationPath(router.state) }],
    index: 0,
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

  return React.useMemo(() => ({ push, replace, back, canGoBack, consumePendingAction }), [back, canGoBack, push, replace, consumePendingAction])
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

export function FileRouter({ routes, basename = '/' }: FileRouterProps): JSX.Element {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error('tamer-router: routes must be a non-empty array.')
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
    routerRef.current = createMemoryRouter(wrappedRoutes, { basename })
  }
  const router = routerRef.current
  const controller = useNavigationController(router)
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
  const push = React.useCallback((route: string) => {
    NativeModules?.TamerRouterNativeModule?.preparePush?.(route)
    if (!NativeModules?.TamerRouterNativeModule?.preparePush) controller?.push(route)
  }, [controller])
  const replace = React.useCallback((route: string) => {
    NativeModules?.TamerRouterNativeModule?.prepareReplace?.(route)
    if (!NativeModules?.TamerRouterNativeModule?.prepareReplace) controller?.replace(route)
  }, [controller])
  const back = React.useCallback(() => {
    NativeModules?.TamerRouterNativeModule?.preparePop?.()
    if (!NativeModules?.TamerRouterNativeModule?.preparePop) controller?.back()
  }, [controller])
  const canGoBack = React.useCallback(() => controller?.canGoBack() ?? false, [controller])
  return { push, replace, back, pop: back, canGoBack }
}

export function useTamerRouter() {
  return useTamerNavigate()
}
