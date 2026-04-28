import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInitData,
  useLynxGlobalEventListener,
  useMemo,
  useRef,
  type Context,
  type ReactNode,
} from '@lynx-js/react'
import { MemoryRouter, useLocation, useNavigate, useNavigationType, resolvePath } from 'react-router'
import { readHydratedStateJson, TamerNav } from '@tamer4lynx/tamer-navigation'
import { BackHandlerProvider } from './back-handler.js'
import { parseCoordinatorNavDispatchPayload } from './coordinator-dispatch.js'
import { TAMER_LAZY_ROUTES } from '@tamer4lynx/tamer-router/generated-lazy-flag'
import { getTamerGeneratedRoutes } from './generated-routes-registry.js'
import { TamerLynxFileRouterContext } from './tamer-lynx-context.js'
import { applyDefaultCoordinatorNavDispatch } from './state-sync.js'
import { getOutermostStackFromPath, shouldNativePush } from './tamer-stacks.js'
import { shouldCoerceTabReplace } from './tab-layout-roots.js'
import type { FileRouterProps, TamerOutermostStack } from './types.js'

type Init = { route?: string; [k: string]: unknown }

type FileRouterShellRef = {
  bundleSrc: string
  spokeMode: boolean
  spokeRootStack: TamerOutermostStack
  exitOnRootHardwareBack: boolean
  extraChild?: ReactNode
  onNavDispatch?: FileRouterProps['onNavDispatch']
}

export const KnownRoutePathsContext: Context<string[] | undefined> = createContext<string[] | undefined>(
  undefined,
)

function getNativeRouterMod(): {
  setHistoryState?: (j: string) => void
  consumeHistoryState?: (cb: (j: string) => void) => void
} | null {
  try {
    const nm = (globalThis as { NativeModules?: Record<string, unknown> }).NativeModules
    return (nm?.TamerRouterNativeModule as {
      setHistoryState?: (j: string) => void
      consumeHistoryState?: (cb: (j: string) => void) => void
    }) ?? null
  } catch {
    return null
  }
}

type NavVal = {
  push: (to: string) => void
  replace: (to: string) => void
  back: () => void
  canGoBack: () => boolean
  /** Wraps `go()` (tab-replace, native push rules); prefer over raw `useNavigate` from `react-router`. */
  navigate: (to: number | string | { pathname?: string; search?: string; hash?: string } | any, options?: { replace?: boolean; state?: unknown; relative?: any }) => void
  coordinatorPush: (to: string, replace: boolean) => void
}

const TamerNavigationInternalContext = createContext<NavVal | null>(null)

function TamerNativeHistorySync() {
  const loc = useLocation()
  useEffect(() => {
    'background only'
    const mod = getNativeRouterMod()
    if (!mod?.setHistoryState) return
    try {
      mod.setHistoryState?.(
        JSON.stringify({
          entries: [loc.pathname],
          index: 0,
        }),
      )
    } catch {
      // ignore
    }
  }, [loc.pathname])
  return null
}


function CoordinatorNavDispatchListener({
  onNavDispatch,
  onPushRoute,
}: {
  onNavDispatch?: FileRouterProps['onNavDispatch']
  onPushRoute: (route: string, replace: boolean) => void
}) {
  useLynxGlobalEventListener('tamer-nav:dispatch', (payload?: { action?: string }) => {
    'background only'
    const action = parseCoordinatorNavDispatchPayload(payload)
    if (!action) return
    onNavDispatch?.(action)
    if (action.type === 'push-route' && typeof (action as { route?: unknown }).route === 'string') {
      const a = action as { route: string; replace?: boolean }
      onPushRoute(a.route, a.replace === true)
      return
    }
    applyDefaultCoordinatorNavDispatch(action)
  })
  return null
}

function TamerBackHandlerWithNav({
  shellRef,
  children,
}: {
  shellRef: { current: FileRouterShellRef }
  children: ReactNode
}) {
  const s = shellRef.current
  const { back, canGoBack } = useTamerRouter()
  const onUnhandled = useCallback(() => {
    if (canGoBack()) {
      back()
      return true
    }
    if (s.spokeMode) {
      TamerNav.pop({ source: 'system-back' })
      return true
    }
    return !s.exitOnRootHardwareBack
  }, [back, canGoBack, s.exitOnRootHardwareBack, s.spokeMode])
  return <BackHandlerProvider onUnhandled={onUnhandled}>{children as any}</BackHandlerProvider>
}

function TamerNavigateContext({
  bundleSrc,
  spokeMode,
  spokeRootStack,
  shellRef,
  children,
}: {
  bundleSrc: string
  spokeMode: boolean
  spokeRootStack: TamerOutermostStack
  shellRef: { current: FileRouterShellRef }
  children: ReactNode
}) {
  const loc = useLocation()
  const rawNavigate = useNavigate()
  const navType = useNavigationType()
  const stackDepth = useRef(1)
  const pushCounter = useRef(0)

  useEffect(() => {
    if (navType === 'PUSH') {
      stackDepth.current += 1
    } else if (navType === 'POP') {
      stackDepth.current = Math.max(1, stackDepth.current - 1)
    }
  }, [navType, loc.key, loc.pathname])

  const coordinatorPush = useCallback(
    (to: string, replace: boolean) => {
      'background only'
      const stateJson = readHydratedStateJson('{}')
      const screenId = `${to}-${pushCounter.current++}`
      TamerNav.push({
        src: bundleSrc,
        screenId,
        initData: { route: to, screenId, replace },
        stateJson,
      })
    },
    [bundleSrc],
  )

  const go = useCallback(
    (to: string, replace: boolean) => {
      'background only'
      const from = loc.pathname
      let toPathname: string
      try {
        toPathname = resolvePath(to, from).pathname
      } catch {
        const t = String(to).trim()
        toPathname = !t || t === '/' ? '/' : t.startsWith('/') ? t : `/${t}`
      }
      let useReplace = replace
      if (!useReplace && shouldCoerceTabReplace(from, toPathname)) {
        useReplace = true
      }
      if (
        shouldNativePush({
          toPath: toPathname,
          fromPath: from,
          isSpoke: spokeMode,
          spokeRootStack,
        })
      ) {
        if (spokeMode) {
          TamerNav.dispatch({ type: 'push-route', route: to, replace: useReplace })
        } else {
          coordinatorPush(to, useReplace)
        }
        return
      }
      if (useReplace) {
        rawNavigate(to, { replace: true })
      } else {
        rawNavigate(to)
      }
    },
    [coordinatorPush, loc.pathname, rawNavigate, spokeMode, spokeRootStack],
  )

  const tamerNavigate = useCallback(
    (to: number | string | { pathname?: string; search?: string; hash?: string } | any, options?: { replace?: boolean; state?: unknown; relative?: any }) => {
      if (typeof to === 'number') {
        rawNavigate(to)
        return
      }
      if (options && 'state' in options && (options as { state?: unknown }).state != null) {
        rawNavigate(to as any, options as any)
        return
      }
      if (typeof to === 'string') {
        go(to, (options as { replace?: boolean } | undefined)?.replace === true)
        return
      }
      if (to && typeof to === 'object' && typeof to.pathname === 'string') {
        const path = `${to.pathname}${to.search ?? ''}${to.hash ?? ''}`
        go(path || '/', (options as { replace?: boolean } | undefined)?.replace === true)
        return
      }
      rawNavigate(to as any, options as any)
    },
    [go, rawNavigate],
  )

  const replace = useCallback(
    (to: string) => {
      'background only'
      go(to, true)
    },
    [go],
  )

  const push = useCallback(
    (to: string) => {
      'background only'
      go(to, false)
    },
    [go],
  )

  const back = useCallback(() => {
    'background only'
    if (stackDepth.current > 1) {
      rawNavigate(-1)
      return
    }
    TamerNav.pop({ source: 'js-back' })
  }, [rawNavigate])

  const canGoBack = useCallback(() => stackDepth.current > 1 || spokeMode, [spokeMode])

  const value = useMemo(
    () => ({
      push,
      replace,
      back,
      canGoBack,
      navigate: tamerNavigate,
      coordinatorPush,
    }),
    [push, replace, back, canGoBack, tamerNavigate, coordinatorPush],
  )

  return (
    <TamerLynxFileRouterContext.Provider
      value={{
        bundleSrc,
        spokeMode,
        spokeEntryPath: spokeMode ? loc.pathname : null,
        spokeRootStack,
      }}
    >
      <TamerNavigationInternalContext.Provider value={value}>
        <TamerNativeHistorySync />
        {!spokeMode ? (
          <CoordinatorNavDispatchListener
            onNavDispatch={shellRef.current.onNavDispatch}
            onPushRoute={(to, replace) => coordinatorPush(to, replace)}
          />
        ) : null}
        <TamerBackHandlerWithNav shellRef={shellRef}>
          {shellRef.current.extraChild}
          {children}
        </TamerBackHandlerWithNav>
      </TamerNavigationInternalContext.Provider>
    </TamerLynxFileRouterContext.Provider>
  )
}

export function useTamerRouter() {
  const v = useContext(TamerNavigationInternalContext)
  if (!v) {
    throw new Error('useTamerRouter must be used inside FileRouter')
  }
  return v
}

export const useTamerNavigate = useTamerRouter

function FileRouterMemoryBody({
  shellRef,
  children,
  knownPaths,
}: {
  shellRef: { current: FileRouterShellRef }
  children: ReactNode
  knownPaths?: string[]
}) {
  const s = shellRef.current
  return (
    <KnownRoutePathsContext.Provider value={knownPaths}>
      <TamerNavigateContext
        bundleSrc={s.bundleSrc}
        spokeMode={s.spokeMode}
        spokeRootStack={s.spokeRootStack}
        shellRef={shellRef}
      >
        {children as any}
      </TamerNavigateContext>
    </KnownRoutePathsContext.Provider>
  )
}

function assertFileRouterLazyAlignment(lazyRoutes: boolean | undefined): void {
  if (TAMER_LAZY_ROUTES) {
    if (lazyRoutes !== true) {
      throw new Error(
        'This bundle uses lazy() for at least one file route (tamerRouterPlugin lazyRoutes). Pass <FileRouter lazyRoutes />.',
      )
    }
  } else if (lazyRoutes === true) {
    console.warn(
      '[tamer-router] FileRouter lazyRoutes is set but the bundle has only static route imports. Remove lazyRoutes or enable tamerRouterPlugin lazyRoutes.',
    )
  }
}

export function FileRouterInner({
  children,
  bundleSrc = 'main.lynx.bundle',
  exitOnRootHardwareBack = false,
  notFoundComponent: _notFound,
  knownPaths,
  basename = '',
  onNavDispatch,
  coordinatorInitialPath = '/',
  lazyRoutes,
}: FileRouterProps & { children: ReactNode; coordinatorInitialPath?: string }) {
  assertFileRouterLazyAlignment(lazyRoutes)
  const init = useInitData() as Init | null
  const rawRoute = typeof init?.route === 'string' ? init.route : ''
  const spokeMode = rawRoute.length > 0
  const spokeRootStack = spokeMode ? getOutermostStackFromPath(rawRoute) : null

  const shellRef = useRef<FileRouterShellRef>({
    bundleSrc,
    spokeMode,
    spokeRootStack,
    exitOnRootHardwareBack,
    onNavDispatch,
  })
  shellRef.current = {
    bundleSrc,
    spokeMode,
    spokeRootStack,
    exitOnRootHardwareBack,
    onNavDispatch,
  }

  const initialEntry = spokeMode
    ? rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`
    : coordinatorInitialPath.startsWith('/') ? coordinatorInitialPath : `/${coordinatorInitialPath}`

  return (
    <MemoryRouter basename={basename} initialEntries={[initialEntry]}>
      <FileRouterMemoryBody shellRef={shellRef} knownPaths={knownPaths}>
        {children as any}
      </FileRouterMemoryBody>
    </MemoryRouter>
  )
}

export function FileRouter({
  children,
  knownPaths,
  coordinatorInitialPath,
  ...rest
}: FileRouterProps & { children?: ReactNode; coordinatorInitialPath?: string }) {
  const reg = getTamerGeneratedRoutes()
  const resolvedChildren = children ?? (reg.Routes ? <reg.Routes /> : null)
  const resolvedKnown = knownPaths ?? reg.knownPaths
  const resolvedInitialPath = coordinatorInitialPath ?? reg.coordinatorInitialPath ?? '/'
  if (!resolvedChildren) {
    throw new Error(
      'FileRouter has no routes. Either pass <Routes>...</Routes> as children or import the generated routes module so it registers via setTamerGeneratedRoutes().',
    )
  }
  return (
    <FileRouterInner
      {...rest}
      knownPaths={resolvedKnown}
      coordinatorInitialPath={resolvedInitialPath}
    >
      {resolvedChildren}
    </FileRouterInner>
  )
}
