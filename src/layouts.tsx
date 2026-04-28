import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useState } from '@lynx-js/react'
import { Outlet, useLocation } from 'react-router'
import { AppBar, AppShell, Content, TabBar, type AppShellRouterContextValue, type TabItem } from '@tamer4lynx/tamer-app-shell'
import { useSystemUI, useThemeColors } from '@tamer4lynx/tamer-system-ui'
import type { ReactNode } from '@lynx-js/react'
import { useTamerRouter } from './lynx-file-router.js'
import { setRegisteredTabRootPaths, tabRootPathsFromOptions } from './tab-layout-roots.js'
import type { ScreenOptions, TabNavigatorOptions } from './types.js'

export { Outlet }

const StackOptionsContext = createContext<{
  register: (name: string, o: ScreenOptions) => void
  setRuntime: (name: string, o: Partial<ScreenOptions> | null) => void
  setSlot: (name: string, slot: ReactNode | null) => void
  unregister: (name: string) => void
} | null>(null)

const TabOptionsContext = createContext<{
  register: (name: string, o: ScreenOptions) => void
  unregister: (name: string) => void
  setRuntime: (name: string, o: Partial<ScreenOptions> | null) => void
  pathPrefix: string
} | null>(null)

type StackComponent = ((props: StackProps) => any) & {
  Screen: typeof StackScreen
}
type TabBaseProps = {
  pathPrefix?: string
  children: ReactNode
} & TabNavigatorOptions

type TabComponent = ((props: TabBaseProps) => any) & {
  Screen: typeof TabScreen
}

/**
 * Renders the active child route.
 */
export function Slot() {
  return <Outlet />
}

export type { ScreenOptions }

function ContentFallback({ backgroundColor }: { backgroundColor?: string }) {
  return (
    <view
      style={{
        flex: 1,
        minHeight: '0px',
        width: '100%',
        backgroundColor,
      }}
    />
  )
}

/**
 * Declares stack metadata for a route segment (mirrors React Navigation’s stack screen list).
 * The actual screen body comes from the matching `<Route>` (`<Outlet />`). Optional `children`
 * render above the outlet inside the stack scroll area (e.g. per-screen chrome or notices).
 */
export function StackScreen({
  name,
  options = {},
  children,
}: {
  name: string
  options?: ScreenOptions
  children?: ReactNode
}) {
  const r = useContext(StackOptionsContext)
  useEffect(() => {
    r?.register(name, options)
  }, [r, name, options])

  useEffect(() => {
    return () => {
      r?.unregister(name)
    }
  }, [r, name])

  useEffect(() => {
    if (children == null) {
      r?.setSlot(name, null)
      return
    }
    r?.setSlot(name, children)
    return () => {
      r?.setSlot(name, null)
    }
  }, [r, name, children])

  return null
}

function pathToStackName(pathname: string, pathPrefix: string): string {
  const base = pathPrefix.replace(/\/$/, '')
  if (pathname === base || pathname === `${base}/`) return 'index'
  if (!pathname.startsWith(base)) return 'index'
  const sub = pathname.slice(base.length).replace(/^\//, '')
  if (!sub) return 'index'
  const seg = sub.split('/')[0]
  if (!seg) return 'index'
  return seg
}

function stackScreenKeyForFrame(
  optionMap: Map<string, ScreenOptions>,
  pathname: string,
  pathPrefix: string,
): string {
  const key = pathToStackName(pathname, pathPrefix)
  if (optionMap.has(key)) return key
  return 'index'
}

function mergedScreenOptions(
  nameKey: string,
  optionMap: Map<string, ScreenOptions>,
  runtime: Map<string, Partial<ScreenOptions>>,
): ScreenOptions {
  return { ...optionMap.get('index'), ...optionMap.get(nameKey), ...runtime.get(nameKey) } as ScreenOptions
}

function mergedTabScreenOptions(
  layoutScreenOptions: ScreenOptions | undefined,
  nameKey: string,
  optionMap: Map<string, ScreenOptions>,
  runtime: Map<string, Partial<ScreenOptions>>,
): ScreenOptions {
  return {
    ...layoutScreenOptions,
    ...optionMap.get('index'),
    ...optionMap.get(nameKey),
    ...runtime.get(nameKey),
  } as ScreenOptions
}

type StackFrameProps = {
  pathPrefix: string
  options: Map<string, ScreenOptions>
  runtime: Map<string, Partial<ScreenOptions>>
  slots: Map<string, ReactNode>
}

function StackFrame({ pathPrefix, options, runtime, slots }: StackFrameProps) {
  const { pathname } = useLocation()
  const { back, canGoBack, replace } = useTamerRouter()
  const colors = useRouterLayoutTheme()
  useApplyLayoutSystemTheme(colors)
  const nameKey = useMemo(
    () => stackScreenKeyForFrame(options, pathname, pathPrefix),
    [pathname, options, pathPrefix],
  )
  const merged = useMemo(
    () => mergedScreenOptions(nameKey, options, runtime),
    [nameKey, options, runtime],
  )
  const title = merged.title ?? ''
  const barBg =
    (typeof merged.headerBackground === 'string' && merged.headerBackground) || colors.surface
  const showHeader = merged.headerShown !== false
  const slot = slots.get(nameKey)
  const router = useMemo<AppShellRouterContextValue>(
    () => ({
      back: () => back(),
      canGoBack: () => canGoBack(),
      replace: (route: string) => {
        'background only'
        replace(route)
      },
    }),
    [back, canGoBack, replace],
  )

  return (
    <AppShell
      router={router}
      backgroundColor={colors.surface}
      appBar={
        showHeader ? (
          <AppBar
            title={title}
            foregroundColor={colors.onSurface}
            style={{
              backgroundColor: barBg,
            } as object}
          />
        ) : null
      }
    >
      <Content
        style={{
          backgroundColor: colors.surface,
        } as object}
      >
        {slot}
        <Suspense fallback={<ContentFallback backgroundColor={colors.surface} />}>
          <Outlet />
        </Suspense>
      </Content>
    </AppShell>
  )
}

type StackProps = { pathPrefix: string; children: ReactNode }

/**
 * Stack routes render one app shell around the current stack screen. Native stack pushes create
 * separate JS contexts, while nested stack routes still resolve their active screen from the path.
 */
function StackImpl({ pathPrefix, children }: StackProps) {
  const [options, setOptions] = useState(() => new Map<string, ScreenOptions>())
  const [runtime, setRuntimeMap] = useState(() => new Map<string, Partial<ScreenOptions>>())
  const [slots, setSlots] = useState(() => new Map<string, ReactNode>())

  const register = useCallback((name: string, o: ScreenOptions) => {
    setOptions((prev) => {
      const next = new Map(prev)
      next.set(name, o)
      return next
    })
  }, [])

  const unregister = useCallback((name: string) => {
    setOptions((prev) => {
      const next = new Map(prev)
      next.delete(name)
      return next
    })
    setSlots((prev) => {
      const next = new Map(prev)
      next.delete(name)
      return next
    })
  }, [])

  const setSlot = useCallback((name: string, slot: ReactNode | null) => {
    setSlots((prev) => {
      const next = new Map(prev)
      if (slot == null) next.delete(name)
      else next.set(name, slot)
      return next
    })
  }, [])

  const setRuntime = useCallback((name: string, o: Partial<ScreenOptions> | null) => {
    setRuntimeMap((prev) => {
      const next = new Map(prev)
      if (o == null) next.delete(name)
      else next.set(name, o)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ register, setRuntime, setSlot, unregister }),
    [register, setRuntime, setSlot, unregister],
  )

  return (
    <StackOptionsContext.Provider value={value}>
      {children as any}
      <StackFrame pathPrefix={pathPrefix} options={options} runtime={runtime} slots={slots} />
    </StackOptionsContext.Provider>
  )
}

export const Stack = StackImpl as StackComponent
Stack.Screen = StackScreen

export function TabScreen({ name, options = {} }: { name: string; options?: ScreenOptions }) {
  const r = useContext(TabOptionsContext)
  useEffect(() => {
    r?.register(name, options)
    return () => {
      r?.unregister(name)
    }
  }, [r, name, options])
  return null
}

type LayoutTheme = {
  primary?: string
  primaryDark?: string
  background?: string
  surface?: string
  surfaceContainer?: string
  onSurface?: string
  onSurfaceVariant?: string
  secondaryContainer?: string
  onSecondaryContainer?: string
  isDark?: boolean
}

const FALLBACK_THEME: LayoutTheme = {
  surface: '#121212',
  surfaceContainer: '#1e1e1e',
  primary: '#000000',
  primaryDark: '#000000',
  background: '#121212',
  onSurface: '#ffffff',
  onSurfaceVariant: '#b0b0b0',
  secondaryContainer: '#1a3538',
  onSecondaryContainer: '#80cbc4',
  isDark: true,
}

const LIGHT_FALLBACK: LayoutTheme = {
  surface: '#f5f5f5',
  surfaceContainer: '#e8e8e8',
  primary: '#007aff',
  primaryDark: '#0051d5',
  background: '#ffffff',
  onSurface: '#000000',
  onSurfaceVariant: '#6b6b6b',
  secondaryContainer: '#cce8e5',
  onSecondaryContainer: '#005f5a',
  isDark: false,
}

function resolveLayoutTheme(theme: LayoutTheme | null | undefined): LayoutTheme {
  if (theme == null) return LIGHT_FALLBACK
  return {
    surface: theme.surface ?? FALLBACK_THEME.surface,
    surfaceContainer: theme.surfaceContainer ?? FALLBACK_THEME.surfaceContainer,
    primary: theme.primary ?? FALLBACK_THEME.primary,
    primaryDark: theme.primaryDark ?? FALLBACK_THEME.primaryDark,
    background: theme.background ?? FALLBACK_THEME.background,
    onSurface: theme.onSurface ?? FALLBACK_THEME.onSurface,
    onSurfaceVariant: theme.onSurfaceVariant ?? FALLBACK_THEME.onSurfaceVariant,
    secondaryContainer: theme.secondaryContainer ?? FALLBACK_THEME.secondaryContainer,
    onSecondaryContainer: theme.onSecondaryContainer ?? FALLBACK_THEME.onSecondaryContainer,
    isDark: theme.isDark ?? FALLBACK_THEME.isDark,
  }
}

function useRouterLayoutTheme() {
  const osTheme = useThemeColors()
  return resolveLayoutTheme(osTheme)
}

function useApplyLayoutSystemTheme(colors: LayoutTheme) {
  const { setStatusBar, setNavigationBar } = useSystemUI()

  useEffect(() => {
    'background only'
    setStatusBar({ color: colors.surface, style: colors.isDark ? 'light' : 'dark' })
    setNavigationBar({ color: colors.surfaceContainer ?? '#000000', style: colors.isDark ? 'light' : 'dark' })
  }, [colors.surface, colors.surfaceContainer, colors.isDark, setStatusBar, setNavigationBar])
}

/**
 * Tab routes: top `AppBar` + bottom `TabBar` by default, active `<Tab.Screen>` content in between.
 * Use `headerShown: false` on `<Tab />` or per-screen `options` to hide the app bar, `tabBarShown: false` to hide the tab bar.
 */
function TabImpl({
  pathPrefix = '/tabs',
  children,
  screenOptions: layoutScreenOptions,
  headerShown: navigatorHeaderShown = true,
  tabBarShown = true,
  appShellBackgroundColor,
  safeAreaEdges,
  tabBarOptions,
}: TabBaseProps) {
  const [options, setOptions] = useState(() => new Map<string, ScreenOptions>())
  const [runtime, setRuntimeMap] = useState(() => new Map<string, Partial<ScreenOptions>>())

  const register = useCallback((name: string, o: ScreenOptions) => {
    setOptions((prev) => {
      const next = new Map(prev)
      next.set(name, o)
      return next
    })
  }, [])

  const unregister = useCallback((name: string) => {
    setOptions((prev) => {
      const next = new Map(prev)
      next.delete(name)
      return next
    })
  }, [])

  const setRuntime = useCallback((name: string, o: Partial<ScreenOptions> | null) => {
    setRuntimeMap((prev) => {
      const next = new Map(prev)
      if (o == null) next.delete(name)
      else next.set(name, o)
      return next
    })
  }, [])

  const rctx = useMemo(
    () => ({ register, unregister, setRuntime, pathPrefix }),
    [register, unregister, setRuntime, pathPrefix],
  )

  useEffect(() => {
    setRegisteredTabRootPaths(tabRootPathsFromOptions(pathPrefix, options))
    return () => {
      setRegisteredTabRootPaths(null)
    }
  }, [pathPrefix, options])

  const loc = useLocation()
  const { navigate, back, canGoBack, replace } = useTamerRouter()
  const colors = useRouterLayoutTheme()
  useApplyLayoutSystemTheme(colors)
  const path = loc.pathname
  const base = pathPrefix.replace(/\/$/, '')

  const nameKey = useMemo(
    () => pathToStackName(path, pathPrefix),
    [path, pathPrefix],
  )

  const merged = useMemo(
    () => mergedTabScreenOptions(layoutScreenOptions, nameKey, options, runtime),
    [layoutScreenOptions, nameKey, options, runtime],
  )

  const title = merged.title ?? ''
  const barBg =
    (typeof merged.headerBackground === 'string' && merged.headerBackground) || colors.surface
  const showAppBar = navigatorHeaderShown && merged.headerShown !== false
  const shellBg = appShellBackgroundColor ?? colors.surface

  // Tab routes are always JS-swapped within the same bundle. Never native push.
  const tabs: TabItem[] = useMemo(() => {
    const items: TabItem[] = []
    for (const [n, o] of options) {
      const homeHref = base || '/'
      const href = n === 'index' ? homeHref : base ? `${base}/${n}` : `/${n}`
      const isIndex = n === 'index'
      const active = isIndex
        ? (path === base || path === `${base}/` || (base === '' && (path === '/' || path === '')))
        : path === href || path.startsWith(`${href}/`)
      const tabLabel = (typeof o.label === 'string' && o.label) || o.title
      items.push({
        label: tabLabel,
        icon: (o.icon as string) || '',
        set: o.set as TabItem['set'],
        active,
        onTap: () => {
          'background only'
          navigate(href, { replace: true })
        },
      })
    }
    return items
  }, [options, path, base, navigate])

  const defaultTabBarIcon = {
    active: colors.onSecondaryContainer,
    inactive: colors.onSurfaceVariant,
    labelActive: colors.onSurface,
    labelInactive: colors.onSurfaceVariant,
    pill: colors.secondaryContainer,
  }

  const tabBar = tabBarShown ? (
    <TabBar
      tabs={tabs}
      style={{
        backgroundColor: colors.surfaceContainer,
        ...(tabBarOptions?.style as object | undefined),
      } as object}
      iconColor={tabBarOptions?.iconColor ?? defaultTabBarIcon}
      tabBarChromeHex={tabBarOptions?.tabBarChromeHex}
      themeColors={tabBarOptions?.themeColors}
    />
  ) : null

  const router = useMemo<AppShellRouterContextValue>(
    () => ({
      back: () => back(),
      canGoBack: () => canGoBack(),
      replace: (route: string) => {
        'background only'
        replace(route)
      },
    }),
    [back, canGoBack, replace],
  )

  return (
    <TabOptionsContext.Provider value={rctx}>
      <AppShell
        router={router}
        backgroundColor={shellBg}
        safeAreaEdges={safeAreaEdges}
        appBar={
          showAppBar ? (
            <AppBar
              title={title}
              foregroundColor={colors.onSurface}
              style={{
                backgroundColor: barBg,
              } as object}
            />
          ) : null
        }
        tabBar={tabBar}
      >
        {children as any}
        <Content scrollable={false} style={{ backgroundColor: shellBg } as object}>
          <Suspense fallback={<ContentFallback backgroundColor={shellBg} />}>
            <Outlet />
          </Suspense>
        </Content>
      </AppShell>
    </TabOptionsContext.Provider>
  )
}

export const Tab = TabImpl as TabComponent
Tab.Screen = TabScreen

type TabsProps = { pathPrefix: string; children: ReactNode } & TabNavigatorOptions

export function Tabs({ pathPrefix, children, ...tabNavigatorRest }: TabsProps) {
  return (
    <Tab pathPrefix={pathPrefix} {...tabNavigatorRest}>
      {children}
    </Tab>
  )
}

/** Merge per-screen `title` (and other options later) for the current route inside `Stack`. */
export function useScreenOptions(partial: Partial<ScreenOptions>) {
  const r = useContext(StackOptionsContext)
  const { pathname } = useLocation()
  const nameKey = pathToStackName(pathname, '/')
  const patchKey = useMemo(() => JSON.stringify(partial), [partial])

  useEffect(() => {
    if (!r?.setRuntime || !nameKey) return
    r.setRuntime(nameKey, JSON.parse(patchKey) as Partial<ScreenOptions>)
    return () => {
      r.setRuntime(nameKey, null)
    }
  }, [r, nameKey, patchKey])
}

/** Runtime overlay for the active `<Tab.Screen>` (use inside tab layout routes; requires parent `<Tab>`). */
export function useTabScreenOptions(partial: Partial<ScreenOptions>) {
  const r = useContext(TabOptionsContext)
  const { pathname } = useLocation()
  const pathPrefix = r?.pathPrefix ?? '/'
  const nameKey = useMemo(
    () => pathToStackName(pathname, pathPrefix),
    [pathname, pathPrefix],
  )
  const patchKey = useMemo(() => JSON.stringify(partial), [partial])

  useEffect(() => {
    if (!r?.setRuntime || !nameKey) return
    r.setRuntime(nameKey, JSON.parse(patchKey) as Partial<ScreenOptions>)
    return () => {
      r.setRuntime(nameKey, null)
    }
  }, [r, nameKey, patchKey])
}
