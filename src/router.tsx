/// <reference types="@lynx-js/react" />
import '@tamer4lynx/tamer-navigation'
import { AppShellProvider } from '@tamer4lynx/tamer-app-shell'
import type { ThemeColors } from '@tamer4lynx/tamer-system-ui'
import { useSystemUI, useThemeColors } from '@tamer4lynx/tamer-system-ui'
import * as React from '@lynx-js/react'
import { Suspense } from '@lynx-js/react'
import { BackHandlerContext, useBackHandlerListeners, useBackHandlerSetup } from './back-handler.js'
import { useStackContext } from './stack-context.js'
import type { StackEntry as StackContextEntry } from './stack-context.js'
import {
  getLayoutInstanceKey,
  isTabRailStripSwitch,
  matchRoute,
  normalizePathname,
  resolveConcretePath,
  seedVisitedPathsForPath,
} from './manifest.js'
import {
  Outlet,
  Slot,
  Tabs,
  withLayoutRuntime,
} from './layouts.js'
import type {
  GeneratedRoutesManifest,
  Href,
  LinkingConfig,
  ReactNode,
  RouteParams,
  ScreenOptions,
  TransitionOptions,
} from './types.js'

declare const lynx:
  | {
      getJSModule?: (id: string) => {
        addListener?(event: string, fn: (event: { payload?: string }) => void): void
        removeListener?(event: string, fn: (event: { payload?: string }) => void): void
      }
    }
  | undefined

declare const NativeModules:
  | {
      TamerRouterNativeModule?: {
        consumeHistoryState?(callback: (stateJson: string) => void): void
        didHandleBack(consumed: boolean): void
        setHistoryState?(stateJson: string): void
      }
    }
  | undefined

interface StackEntry {
  id: string
  activePath: string
  runtimeOptionsByPath: Record<string, ScreenOptions>
  visitedPathsByLayoutKey: Record<string, Record<string, string>>
}

function stackOrderForEntry(entryIndex: number): number {
  return entryIndex
}

function resolveRouterBackground(
  rootBackgroundColor: string | undefined,
  mergedTheme: Partial<ThemeColors> | undefined,
  overlayBackgroundColor: string | undefined,
): { root: string; overlay: string } {
  const root =
    rootBackgroundColor ??
    mergedTheme?.background ??
    mergedTheme?.surface ??
    '#ffffff'
  const overlay = overlayBackgroundColor ?? root
  return { root, overlay }
}

interface RouterContextValue {
  back: (options?: TransitionOptions) => void
  canGoBack: () => boolean
  pop: (options?: TransitionOptions) => void
  push: (href: Href, options?: TransitionOptions) => void
  replace: (href: Href, options?: TransitionOptions) => void
}

export type TamerRouterApis = Pick<
  RouterContextValue,
  'push' | 'replace' | 'back' | 'pop' | 'canGoBack'
>

export type NavigateFunction = ((
  to: number | Href,
  options?: TransitionOptions,
) => void) &
  TamerRouterApis

interface LocationContextValue {
  entry: StackEntry
  pathname: string
  params: Record<string, string>
  routeId: string
  setScreenOptions: (options: ScreenOptions | null) => void
}

const EXIT_DELAY_MS = 320
type RouterNavTransition = 'slide-right' | 'slide-left' | 'slide-up' | 'slide-down' | 'fade' | 'none'

const RouterContext = React.createContext<RouterContextValue | null>(null)
const LocationContext = React.createContext<LocationContextValue | null>(null)

function createStackEntry(
  manifest: GeneratedRoutesManifest,
  id: string,
  pathname: string,
): StackEntry {
  return {
    id,
    activePath: pathname,
    runtimeOptionsByPath: {},
    visitedPathsByLayoutKey: seedVisitedPathsForPath(manifest, id, {}, pathname),
  }
}

function setEntryPath(
  manifest: GeneratedRoutesManifest,
  entry: StackEntry,
  pathname: string,
): StackEntry {
  return {
    ...entry,
    activePath: pathname,
    visitedPathsByLayoutKey: seedVisitedPathsForPath(
      manifest,
      entry.id,
      entry.visitedPathsByLayoutKey,
      pathname,
    ),
  }
}

function resolveStackBackPath(
  manifest: GeneratedRoutesManifest,
  pathname: string,
): string | null {
  const matched = matchRoute(manifest, pathname)
  if (!matched) return null
  const normalizedPath = normalizePathname(pathname)
  for (let index = matched.route.layoutIds.length - 1; index >= 0; index -= 1) {
    const layoutId = matched.route.layoutIds[index]
    const layout = manifest.layouts[layoutId]
    if (!layout || layout.kind !== 'stack') continue
    const defaultPath = manifest.defaultPathByBasePath[layout.basePath] ?? layout.children[0]?.targetPath
    if (!defaultPath) continue
    if (normalizePathname(defaultPath) === normalizedPath) continue
    return defaultPath
  }
  return null
}

function canEntryGoBack(
  manifest: GeneratedRoutesManifest,
  entry: StackEntry,
  stackIndex: number,
): boolean {
  return stackIndex > 0 || resolveStackBackPath(manifest, entry.activePath) != null
}

function readHistoryState(
  manifest: GeneratedRoutesManifest,
  createEntryId: () => string,
  setEntries: React.Dispatch<React.SetStateAction<StackEntry[]>>,
): void {
  NativeModules?.TamerRouterNativeModule?.consumeHistoryState?.((stateJson: string) => {
    try {
      const envelope = JSON.parse(stateJson) as {
        hostSessionId?: string
        historySessionId?: string
        state?: { entries?: string[]; index?: number }
      }
      if (
        !envelope ||
        envelope.hostSessionId == null ||
        envelope.historySessionId == null ||
        envelope.hostSessionId !== envelope.historySessionId
      ) {
        return
      }
      const entries = Array.isArray(envelope.state?.entries)
        ? envelope.state?.entries ?? []
        : []
      const index = typeof envelope.state?.index === 'number'
        ? Math.max(0, Math.min(entries.length - 1, envelope.state.index))
        : entries.length - 1
      const restored = entries
        .slice(0, index + 1)
        .map((pathname) => resolveConcretePath(manifest, pathname))
        .filter((pathname) => matchRoute(manifest, pathname))
      if (!restored.length) return
      setEntries(restored.map((pathname) => createStackEntry(manifest, createEntryId(), pathname)))
    } catch {
      // Ignore invalid native history payloads and fall back to the generated initial route.
    }
  })
}

function useRouterContextValue(): RouterContextValue {
  const context = React.useContext(RouterContext)
  if (!context) {
    throw new Error('tamer-router hooks must be used inside <FileRouter>.')
  }
  return context
}

function useLocationContextValue(): LocationContextValue {
  const context = React.useContext(LocationContext)
  if (!context) {
    throw new Error('Location hooks must be used inside routed screen content.')
  }
  return context
}

function RouteComponent({ component: Component }: { component: React.ComponentType<any> }): JSX.Element {
  return <Component />
}

function defaultRouteSuspenseFallback(overlayBackgroundColor: string): JSX.Element {
  return (
    <view
      style={{
        flex: 1,
        minHeight: '100%',
        width: '100%',
        backgroundColor: overlayBackgroundColor,
      }}
    />
  )
}

function EntryRenderer({
  back,
  canGoBack,
  entry,
  manifest,
  overlayBackgroundColor,
  replace,
  routeSuspense,
  routeSuspenseFallback,
  setScreenOptions,
}: {
  back: () => void
  canGoBack: boolean
  entry: StackEntry
  manifest: GeneratedRoutesManifest
  overlayBackgroundColor: string
  replace: RouterContextValue['replace']
  routeSuspense: boolean
  routeSuspenseFallback?: ReactNode
  setScreenOptions: (entryId: string, pathname: string, options: ScreenOptions | null) => void
}): JSX.Element | null {
  const suspenseFallback = React.useMemo(
    () => routeSuspenseFallback ?? defaultRouteSuspenseFallback(overlayBackgroundColor),
    [routeSuspenseFallback, overlayBackgroundColor],
  )

  const wrapSuspense = (tree: JSX.Element): JSX.Element =>
    routeSuspense ? <Suspense fallback={suspenseFallback}>{tree}</Suspense> : tree

  const renderBelowLayout = React.useCallback(
    (layoutId: string, pathname: string): ReactNode => {
      const childMatch = matchRoute(manifest, pathname)
      if (!childMatch) return null
      const currentLayoutIndex = childMatch.route.layoutIds.indexOf(layoutId)
      if (currentLayoutIndex < 0) return null

      let childNode: ReactNode = (
        <LocationContext.Provider
          value={{
            entry,
            pathname,
            params: childMatch.params,
            routeId: childMatch.route.id,
            setScreenOptions: (options: ScreenOptions | null) =>
              setScreenOptions(entry.id, pathname, options),
          }}
        >
          <RouteComponent component={childMatch.route.component} />
        </LocationContext.Provider>
      )

      for (let index = childMatch.route.layoutIds.length - 1; index > currentLayoutIndex; index -= 1) {
        const descendantLayoutId = childMatch.route.layoutIds[index]
        const descendantLayout = manifest.layouts[descendantLayoutId]
        if (!descendantLayout) continue
        childNode = withLayoutRuntime(
          {
            activePath: pathname,
            activeOptions: entry.runtimeOptionsByPath[pathname],
            back,
            canGoBack,
            entryId: entry.id,
            layout: descendantLayout,
            layoutInstanceKey: getLayoutInstanceKey(entry.id, descendantLayoutId),
            overlayBackgroundColor,
            renderPathBelowLayout: (nextPath) => renderBelowLayout(descendantLayoutId, nextPath),
            replace: (route, options) => replace(route, options as TransitionOptions),
            slot: childNode,
            visitedChildPaths:
              entry.visitedPathsByLayoutKey[getLayoutInstanceKey(entry.id, descendantLayoutId)] ?? {},
          },
          <RouteComponent component={descendantLayout.component} />,
        )
      }

      return childNode
    },
    [back, canGoBack, entry, manifest, overlayBackgroundColor, replace, setScreenOptions],
  )

  const matched = matchRoute(manifest, entry.activePath)
  if (!matched) return null

  let node: ReactNode = (
    <LocationContext.Provider
      value={{
        entry,
        pathname: entry.activePath,
        params: matched.params,
        routeId: matched.route.id,
        setScreenOptions: (options: ScreenOptions | null) =>
          setScreenOptions(entry.id, entry.activePath, options),
      }}
    >
      <RouteComponent component={matched.route.component} />
    </LocationContext.Provider>
  )

  for (let index = matched.route.layoutIds.length - 1; index >= 0; index -= 1) {
    const layoutId = matched.route.layoutIds[index]
    const layout = manifest.layouts[layoutId]
    if (!layout) continue
    node = withLayoutRuntime(
      {
        activePath: entry.activePath,
        activeOptions: entry.runtimeOptionsByPath[entry.activePath],
        back,
        canGoBack,
        entryId: entry.id,
        layout,
        layoutInstanceKey: getLayoutInstanceKey(entry.id, layoutId),
        overlayBackgroundColor,
        renderPathBelowLayout: (pathname) => renderBelowLayout(layoutId, pathname),
        replace: (route, options) => replace(route, options as TransitionOptions),
        slot: node,
        visitedChildPaths: entry.visitedPathsByLayoutKey[getLayoutInstanceKey(entry.id, layoutId)] ?? {},
      },
      <RouteComponent component={layout.component} />,
    )
  }

  if (matched.route.layoutIds.length === 0) {
    return wrapSuspense(
      <view
        style={{
          flex: 1,
          minHeight: '100%',
          width: '100%',
          backgroundColor: overlayBackgroundColor,
        }}
      >
        {node}
      </view>,
    )
  }

  return wrapSuspense(<>{node}</>)
}

const MemoizedEntryRenderer = React.memo(EntryRenderer)

function StackEntryScreen({
  back,
  canGoBack,
  entry,
  isVisible,
  manifest,
  navTransition,
  overlayBackgroundColor,
  replace,
  routeSuspense,
  routeSuspenseFallback,
  setScreenOptions,
  stackOrder,
}: {
  back: () => void
  canGoBack: boolean
  entry: StackEntry
  isVisible: boolean
  manifest: GeneratedRoutesManifest
  navTransition: RouterNavTransition
  overlayBackgroundColor: string
  replace: RouterContextValue['replace']
  routeSuspense: boolean
  routeSuspenseFallback?: ReactNode
  setScreenOptions: (entryId: string, pathname: string, options: ScreenOptions | null) => void
  stackOrder: number
}): JSX.Element {
  return (
    <nav-screen
      screen-id={`tamer-router-${entry.id}`}
      stack-order={stackOrder}
      visible={isVisible}
      nav-transition={navTransition}
      style={{
        flex: 1,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        backgroundColor: overlayBackgroundColor,
        height: '100vh',
        width: '100vw',
      }}
    >
      <MemoizedEntryRenderer
        back={back}
        canGoBack={canGoBack}
        entry={entry}
        manifest={manifest}
        overlayBackgroundColor={overlayBackgroundColor}
        replace={replace}
        routeSuspense={routeSuspense}
        routeSuspenseFallback={routeSuspenseFallback}
        setScreenOptions={setScreenOptions}
      />
    </nav-screen>
  )
}

const MemoizedStackEntryScreen = React.memo(StackEntryScreen)

export interface FileRouterAppShellOptions {
  showAppBar?: boolean
  showTabBar?: boolean
  barHeight?: number
}

export interface FileRouterProps {
  basename?: string
  linking?: LinkingConfig
  routes: GeneratedRoutesManifest
  /**
   * Sets the native root background via `SystemUIModule.setRootBackground` and the default
   * `backgroundColor` for the base route container when not overridden inline.
   */
  rootBackgroundColor?: string
  /**
   * Optional theme tokens merged **over** the OS theme from `SystemUIModule.getThemeColors`.
   * When omitted, root/overlay backgrounds use host `background` / `surface` when available.
   */
  themeColors?: Partial<ThemeColors>
  /** Background for nav-screen overlay containers; defaults to the resolved root background. */
  overlayBackgroundColor?: string
  /**
   * When set, wraps the router in `AppShellProvider`. Pass `true` for defaults (`showAppBar`, `showTabBar`, `barHeight`)
   * or an object to override.
   */
  appShell?: boolean | FileRouterAppShellOptions
  /**
   * When `true` (default), each stack entry’s route tree is wrapped in `Suspense` with a full-screen
   * solid fallback (matches entry background). Use with `React.lazy` pages to avoid empty frames while
   * chunks load. Set to `false` to disable.
   */
  routeSuspense?: boolean
  /** Overrides the default `Suspense` fallback for all stack entries. */
  routeSuspenseFallback?: ReactNode
  /**
   * When `false` (default), Android system back at the **stack root** (only one entry) reports consumed
   * (`didHandleBack(true)`) so the host does **not** finish the activity — same idea as keeping the user in-app until they exit explicitly.
   * Set `true` to delegate at root (`didHandleBack(false)`) so the host may call `super.onBackPressed()` / finish.
   */
  exitOnRootHardwareBack?: boolean
}

/**
 * File-based stack router. Includes {@link BackHandlerRoot} (hardware back → pop stack; root swallows back by default); do not wrap with another `BackHandlerRoot`.
 */
export function FileRouter({
  basename = '/',
  routes: manifest,
  rootBackgroundColor,
  themeColors,
  overlayBackgroundColor,
  appShell,
  routeSuspense,
  routeSuspenseFallback,
  exitOnRootHardwareBack = false,
}: FileRouterProps): JSX.Element {
  const { setRootBackground } = useSystemUI()
  const osTheme = useThemeColors()
  const mergedTheme = React.useMemo(
    () => ({
      ...(osTheme ?? {}),
      ...(themeColors ?? {}),
    }),
    [osTheme, themeColors],
  )
  const { root: resolvedRootBg, overlay: resolvedOverlayBg } = React.useMemo(
    () =>
      resolveRouterBackground(
        rootBackgroundColor,
        mergedTheme,
        overlayBackgroundColor,
      ),
    [
      rootBackgroundColor,
      overlayBackgroundColor,
      mergedTheme?.background,
      mergedTheme?.surface,
    ],
  )

  const enableRouteSuspense = routeSuspense !== false

  React.useEffect(() => {
    setRootBackground({ color: resolvedRootBg })
  }, [resolvedRootBg, setRootBackground])
  const nextEntryIdRef = React.useRef(1)
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const closingEntryIdRef = React.useRef<string | null>(null)
  const [closingEntryId, setClosingEntryId] = React.useState<string | null>(null)

  const createEntryId = React.useCallback(() => `entry-${nextEntryIdRef.current++}`, [])

  const [entries, setEntries] = React.useState<StackEntry[]>(() => [
    createStackEntry(
      manifest,
      createEntryId(),
      resolveConcretePath(manifest, manifest.initialPath, basename),
    ),
  ])

  const entriesRef = React.useRef(entries)
  entriesRef.current = entries

  React.useEffect(() => {
    'background only'
    readHistoryState(manifest, createEntryId, setEntries)
  }, [basename, createEntryId, manifest])

  React.useEffect(() => {
    'background only'
    const bridge = typeof lynx !== 'undefined' ? lynx?.getJSModule?.('GlobalEventEmitter') : undefined
    if (!bridge?.addListener) return
    const onNavigate = (event: { payload?: string }) => {
      try {
        const payload = event.payload ? JSON.parse(event.payload) as {
          action?: string
          route?: string
        } : {}
        if (!payload.route) return
        if (payload.action === 'replace') {
          replace(payload.route)
          return
        }
        push(payload.route)
      } catch {
        // Ignore malformed native navigation events.
      }
    }
    bridge.addListener('tamer-router:navigate', onNavigate)
    return () => bridge.removeListener?.('tamer-router:navigate', onNavigate)
  })

  React.useEffect(() => {
    'background only'
    const state = JSON.stringify({
      entries: entries.map((entry) => entry.activePath),
      index: entries.length - 1,
    })
    NativeModules?.TamerRouterNativeModule?.setHistoryState?.(state)
  }, [entries])

  React.useEffect(
    () => () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    },
    [],
  )

  const cancelPendingClose = React.useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    closingEntryIdRef.current = null
    setClosingEntryId(null)
  }, [])

  // Register entries with StackContext so back handler can close overlays
  const stackContext = useStackContext()
  const registeredEntriesRef = React.useRef<Record<string, () => void>>({})

  React.useEffect(() => {
    const registered = registeredEntriesRef.current
    const currentIds = new Set(entries.map((e) => e.id))
    const registeredIds = new Set(Object.keys(registered))

    // Unregister entries that were removed
    for (const id of registeredIds) {
      if (!currentIds.has(id)) {
        registered[id]()
        delete registered[id]
      }
    }

    // Register new entries (skip base entry at index 0, only register overlays)
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i]
      if (!registered[entry.id] && stackContext) {
        const stackEntry: StackContextEntry = {
          id: entry.id,
          onClosing: () => {
            scheduleCloseTop((remaining) => remaining)
          },
        }
        registered[entry.id] = stackContext.registerEntry(stackEntry)
      }
    }
  }, [entries, stackContext])

  const canGoBack = React.useCallback(() => {
    const current = entriesRef.current
    const topIndex = current.length - 1
    if (topIndex < 0) return false
    return canEntryGoBack(manifest, current[topIndex], topIndex)
  }, [manifest])

  const setScreenOptions = React.useCallback(
    (entryId: string, pathname: string, options: ScreenOptions | null) => {
      setEntries((previous) =>
        previous.map((entry) => {
          if (entry.id !== entryId) return entry
          const nextRuntimeOptions = { ...entry.runtimeOptionsByPath }
          if (options == null) {
            delete nextRuntimeOptions[pathname]
          } else {
            nextRuntimeOptions[pathname] = options
          }
          return {
            ...entry,
            runtimeOptionsByPath: nextRuntimeOptions,
          }
        }),
      )
    },
    [],
  )

  const scheduleCloseTop = React.useCallback(
    (afterClose: (remaining: StackEntry[]) => StackEntry[]) => {
      const current = entriesRef.current
      if (current.length <= 1) return
      if (closingEntryIdRef.current) return
      const top = current[current.length - 1]
      closingEntryIdRef.current = top.id
      setClosingEntryId(top.id)
      closeTimeoutRef.current = setTimeout(() => {
        closeTimeoutRef.current = null
        closingEntryIdRef.current = null
        setClosingEntryId(null)
        setEntries((previous) => afterClose(previous.filter((entry) => entry.id !== top.id)))
      }, EXIT_DELAY_MS)
    },
    [],
  )

  const push = React.useCallback(
    (href: Href, _options?: TransitionOptions) => {
      cancelPendingClose()
      const pathname = resolveConcretePath(manifest, href, basename)
      if (!matchRoute(manifest, pathname)) return
      setEntries((previous) => {
        if (!previous.length) {
          return [createStackEntry(manifest, createEntryId(), pathname)]
        }
        const top = previous[previous.length - 1]
        if (isTabRailStripSwitch(manifest, top.activePath, pathname, basename)) {
          const next = [...previous]
          next[next.length - 1] = setEntryPath(manifest, top, pathname)
          return next
        }

        const existingIndex = previous.findIndex((entry) => entry.activePath === pathname)
        if (existingIndex === previous.length - 1) return previous
        if (existingIndex >= 0) {
          const existing = previous[existingIndex]
          return [
            ...previous.slice(0, existingIndex),
            ...previous.slice(existingIndex + 1),
            existing,
          ]
        }
        return [...previous, createStackEntry(manifest, createEntryId(), pathname)]
      })
    },
    [basename, cancelPendingClose, createEntryId, manifest],
  )

  const replace = React.useCallback(
    (href: Href, options?: TransitionOptions) => {
      cancelPendingClose()
      const pathname = resolveConcretePath(manifest, href, basename)
      if (!matchRoute(manifest, pathname)) return

      if (options?.tab) {
        setEntries((previous) => {
          if (!previous.length) return previous
          const next = [...previous]
          const top = next[next.length - 1]
          next[next.length - 1] = setEntryPath(manifest, top, pathname)
          return next
        })
        return
      }

      setEntries((previous) => {
        if (!previous.length) {
          return [createStackEntry(manifest, createEntryId(), pathname)]
        }
        if (previous.length === 1) {
          if (previous[0].activePath === pathname) return previous
          return [createStackEntry(manifest, createEntryId(), pathname)]
        }
        return previous
      })

      if (entriesRef.current.length > 1) {
        scheduleCloseTop((remaining) => {
          const existingIndex = remaining.findIndex((entry) => entry.activePath === pathname)
          if (existingIndex >= 0) {
            const existing = remaining[existingIndex]
            return [
              ...remaining.slice(0, existingIndex),
              ...remaining.slice(existingIndex + 1),
              existing,
            ]
          }
          return [...remaining, createStackEntry(manifest, createEntryId(), pathname)]
        })
      }
    },
    [basename, cancelPendingClose, createEntryId, manifest, scheduleCloseTop],
  )

  const back = React.useCallback(
    (_options?: TransitionOptions) => {
      const current = entriesRef.current
      if (!current.length) return
      if (current.length > 1) {
        scheduleCloseTop((remaining) => remaining)
        return
      }
      const top = current[0]
      const stackBackPath = resolveStackBackPath(manifest, top.activePath)
      if (!stackBackPath) return
      cancelPendingClose()
      setEntries((previous) => {
        if (previous.length !== 1) return previous
        const currentTop = previous[0]
        if (normalizePathname(currentTop.activePath) === normalizePathname(stackBackPath)) {
          return previous
        }
        return [setEntryPath(manifest, currentTop, stackBackPath)]
      })
    },
    [cancelPendingClose, manifest, scheduleCloseTop],
  )

  const pop = back

  const onSystemBackUnhandled = React.useCallback((): boolean => {
    if (!canGoBack()) {
      return !exitOnRootHardwareBack
    }
    back()
    return true
  }, [back, canGoBack, exitOnRootHardwareBack])

  const backHandlerRegistry = useBackHandlerSetup()
  useBackHandlerListeners(backHandlerRegistry, onSystemBackUnhandled)

  const routerValue = React.useMemo<RouterContextValue>(
    () => ({
      back,
      canGoBack,
      pop,
      push,
      replace,
    }),
    [back, canGoBack, pop, push, replace],
  )

  const routerBody = (
    <RouterContext.Provider value={routerValue}>
      <view
        style={{
          flex: 1,
          minHeight: '100%',
          width: '100%',
          backgroundColor: resolvedRootBg,
        }}
      >
        {entries.map((entry, index) => {
          const isVisible = closingEntryId !== entry.id
          const entryCanGoBack = canEntryGoBack(manifest, entry, index)
          const isBaseEntry = index === 0
          const entryBackgroundColor = isBaseEntry ? resolvedRootBg : resolvedOverlayBg
          const navTransition = isBaseEntry ? 'none' : 'slide-right'
          const stackOrder = stackOrderForEntry(index)
          return (
            <MemoizedStackEntryScreen
              key={entry.id}
              back={back}
              canGoBack={entryCanGoBack}
              entry={entry}
              isVisible={isVisible}
              manifest={manifest}
              navTransition={navTransition}
              overlayBackgroundColor={entryBackgroundColor}
              replace={replace}
              routeSuspense={enableRouteSuspense}
              routeSuspenseFallback={routeSuspenseFallback}
              setScreenOptions={setScreenOptions}
              stackOrder={stackOrder}
            />
          )
        })}
      </view>
    </RouterContext.Provider>
  )

  const shellProps = appShell === true ? {} : appShell
  return (
    <BackHandlerContext.Provider value={backHandlerRegistry}>
      {appShell ? <AppShellProvider {...shellProps}>{routerBody}</AppShellProvider> : routerBody}
    </BackHandlerContext.Provider>
  )
}

export function useTamerRouter(): NavigateFunction {
  const router = useRouterContextValue()
  return React.useMemo(() => {
    const navigate = (to: number | Href, options?: TransitionOptions) => {
      if (typeof to === 'number') {
        if (to >= 0) return
        const steps = -to
        for (let i = 0; i < steps; i++) {
          if (i === 0) {
            if (router.canGoBack()) router.back(options)
          } else {
            setTimeout(() => {
              if (router.canGoBack()) router.back(options)
            }, i * EXIT_DELAY_MS)
          }
        }
        return
      }
      const { replace: doReplace, ...rest } = options ?? {}
      if (doReplace) router.replace(to, rest)
      else router.push(to, rest)
    }
    return Object.assign(navigate, {
      push: router.push,
      replace: router.replace,
      back: router.back,
      pop: router.pop,
      canGoBack: router.canGoBack,
    }) as NavigateFunction
  }, [router])
}

export const useTamerNavigate = useTamerRouter
export const useNavigate = useTamerRouter

export interface NavigateProps {
  to: Href
  /** @default true */
  replace?: boolean
}

/**
 * Declarative redirect: on mount, `replace(to)` or `push(to)` (React Router–style).
 * Must render under `FileRouter`.
 */
export function Navigate({ to, replace: doReplace = true }: NavigateProps): null {
  const { push, replace } = useRouterContextValue()
  React.useEffect(() => {
    if (doReplace) replace(to)
    else push(to)
  }, [doReplace, push, replace, to])
  return null
}

export function useLocation(): { pathname: string } {
  const context = useLocationContextValue()
  return React.useMemo(() => ({ pathname: context.pathname }), [context.pathname])
}

export function useParams<Path extends string = string>(): RouteParams<Path> {
  const context = useLocationContextValue()
  return context.params as RouteParams<Path>
}

export function useScreenOptions(options: ScreenOptions): void {
  const context = useLocationContextValue()
  React.useEffect(() => {
    context.setScreenOptions(options)
    return () => context.setScreenOptions(null)
  }, [context, options])
}

export function useOutlet(): React.ReactNode {
  return <Slot />
}

export { Outlet, Slot, Tabs }
