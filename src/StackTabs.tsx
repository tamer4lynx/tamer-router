import React from 'react'
import { Children, isValidElement, createContext, useContext, useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import {
  AppBar,
  AppShellProvider,
  Content,
  SafeArea,
  Screen,
  TabBar,
  type TabBarIconColor,
  type TabItem,
} from '@tamer4lynx/tamer-app-shell'

type StyleProp = Record<string, unknown>

export interface ScreenOptions {
  title?: string
  headerShown?: boolean
}

export interface StackScreenProps {
  name: string
  path: string
  options?: ScreenOptions
}

const ScreenOptionsContext = createContext<{
  setOptions: (o: ScreenOptions | null) => void
} | null>(null)

export function useScreenOptions(options: ScreenOptions | null): void {
  const ctx = useContext(ScreenOptionsContext)
  const setOptions = ctx?.setOptions
  const title = options?.title
  const headerShown = options?.headerShown
  useEffect(() => {
    if (!setOptions) return
    setOptions(options)
    return () => setOptions(null)
  }, [setOptions, title, headerShown])
}

export function StackScreen(_props: StackScreenProps) {
  return null
}

StackScreen.displayName = 'Stack.Screen'

export interface StackProps {
  children?: React.ReactNode
  titleForPath?: (pathname: string) => string
  screenOptions?: { headerStyle?: StyleProp; headerForegroundColor?: string; headerShown?: boolean }
}

function getScreenOptionsFromChildren(children: React.ReactNode, pathname: string): ScreenOptions | null {
  let best: { pathLen: number; options: ScreenOptions | null } = { pathLen: -1, options: null }
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || (child.type as { displayName?: string })?.displayName !== 'Stack.Screen') return
    const props = child.props as StackScreenProps
    const path = props.path ?? (props.name === 'index' ? '/' : `/${props.name}`)
    const p = path || '/'
    const isMatch = p === '/' ? pathname === '/' || pathname === '' : pathname === p || pathname.startsWith(p + '/')
    if (isMatch && p.length > best.pathLen) best = { pathLen: p.length, options: props.options ?? null }
  })
  return best.options
}

function StackOptionsProvider({
  layoutOptions,
  pathname,
  titleForPath,
  screenOptions,
  children,
}: {
  layoutOptions: ScreenOptions | null
  pathname: string
  titleForPath?: (pathname: string) => string
  screenOptions?: StackProps['screenOptions']
  children: React.ReactNode
}) {
  const [screenOpts, setScreenOpts] = useState<ScreenOptions | null>(null)
  const merged: ScreenOptions = { ...layoutOptions, ...screenOpts }
  const title =
    merged.title ??
    (titleForPath ? titleForPath(pathname) : pathname === '/' ? '' : pathname.split('/').filter(Boolean).pop() ?? '')
  const showAppBar = merged.headerShown !== false && screenOptions?.headerShown !== false
  const value = React.useMemo(() => ({ setOptions: setScreenOpts }), [])

  return (
    <ScreenOptionsContext.Provider value={value}>
      {showAppBar ? <AppBar title={title} style={screenOptions?.headerStyle as object} foregroundColor={screenOptions?.headerForegroundColor} /> : null}
      {children}
    </ScreenOptionsContext.Provider>
  )
}

export function Stack({ children, titleForPath, screenOptions }: StackProps) {
  const location = useLocation()
  const pathname = location.pathname || '/'
  const layoutOptions = children ? getScreenOptionsFromChildren(children, pathname) : null

  return (
    <Screen>
      <SafeArea edges={['top', 'left', 'right', 'bottom']}>
        <AppShellProvider showAppBar showTabBar={false}>
          <StackOptionsProvider
            layoutOptions={layoutOptions}
            pathname={pathname}
            titleForPath={titleForPath}
            screenOptions={screenOptions}
          >
            <Content>
              <Outlet />
            </Content>
          </StackOptionsProvider>
        </AppShellProvider>
      </SafeArea>
    </Screen>
  )
}

Stack.Screen = StackScreen

export interface TabsScreenOptions extends ScreenOptions {
  icon?: string
  label?: string
  set?: string
}

export interface TabsScreenProps {
  name: string
  path: string
  options?: TabsScreenOptions
}

export function TabsScreen(_props: TabsScreenProps) {
  return null
}

TabsScreen.displayName = 'Tabs.Screen'

export interface TabsProps {
  children: React.ReactNode
  titleForPath?: (pathname: string) => string
  screenOptions?: {
    headerStyle?: StyleProp
    headerForegroundColor?: string
    headerShown?: boolean
    tabBarStyle?: StyleProp
    contentStyle?: StyleProp
    iconColor?: TabBarIconColor
  }
}

function getCurrentTabOptions(children: React.ReactNode, pathname: string): ScreenOptions | null {
  let best: { pathLen: number; options: ScreenOptions | null } = { pathLen: -1, options: null }
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || (child.type as { displayName?: string })?.displayName !== 'Tabs.Screen') return
    const props = child.props as TabsScreenProps
    const path = props.path ?? (props.name === 'index' ? '/' : `/${props.name}`)
    const p = path || '/'
    const isMatch = p === '/' ? pathname === '/' || pathname === '' : pathname === p || pathname.startsWith(p + '/')
    if (isMatch && p.length > best.pathLen) best = { pathLen: p.length, options: props.options ?? null }
  })
  return best.options
}

function TabsOptionsProvider({
  layoutOptions,
  pathname,
  titleForPath,
  screenOptions,
  tabs,
  tabTitleFallback,
  children,
}: {
  layoutOptions: ScreenOptions | null
  pathname: string
  titleForPath?: (pathname: string) => string
  screenOptions?: TabsProps['screenOptions']
  tabs: TabItem[]
  tabTitleFallback?: string
  children: React.ReactNode
}) {
  const [screenOpts, setScreenOpts] = useState<ScreenOptions | null>(null)
  const merged: ScreenOptions = { ...layoutOptions, ...screenOpts }
  const title =
    merged.title ??
    tabTitleFallback ??
    (titleForPath ? titleForPath(pathname) : pathname === '/' ? '' : pathname.split('/').filter(Boolean).pop() ?? '')
  const showAppBar = merged.headerShown !== false && screenOptions?.headerShown !== false
  const value = React.useMemo(() => ({ setOptions: setScreenOpts }), [])

  return (
    <ScreenOptionsContext.Provider value={value}>
      {showAppBar ? <AppBar title={title} style={screenOptions?.headerStyle as object} foregroundColor={screenOptions?.headerForegroundColor} /> : null}
      {children}
      <TabBar tabs={tabs} style={screenOptions?.tabBarStyle as object} iconColor={screenOptions?.iconColor} />
    </ScreenOptionsContext.Provider>
  )
}

function getTabPathsFromChildren(children: React.ReactNode): string[] {
  const paths: string[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || (child.type as { displayName?: string })?.displayName !== 'Tabs.Screen') return
    const props = child.props as TabsScreenProps
    const path = props.path ?? (props.name === 'index' ? '/' : `/${props.name}`)
    paths.push(path || '/')
  })
  return paths
}

function isTabPath(pathname: string, tabPaths: string[]): boolean {
  const p = pathname || '/'
  return tabPaths.some((tabPath) => {
    if (tabPath === '/') return p === '/' || p === ''
    return p === tabPath || p.startsWith(tabPath + '/')
  })
}

export function Tabs({ children, titleForPath, screenOptions }: TabsProps) {
  const location = useLocation()
  const pathname = location.pathname || '/'
  const tabPaths = getTabPathsFromChildren(children)
  if (!isTabPath(pathname, tabPaths)) {
    return <Outlet />
  }

  const tabs: TabItem[] = []
  Children.forEach(children, (child) => {
    if (isValidElement(child) && (child.type as { displayName?: string })?.displayName === 'Tabs.Screen') {
      const props = child.props as TabsScreenProps
      const path = props.path ?? (props.name === 'index' ? '/' : `/${props.name}`)
      const opts = props.options ?? {}
      tabs.push({
        path,
        icon: opts.icon ?? 'circle',
        label: opts.label ?? opts.title ?? path,
        set: opts.set as TabItem['set'],
      })
    }
  })

  const layoutOptions = getCurrentTabOptions(children, pathname)
  const currentTab = tabs.find((t) => {
    const p = t.path || '/'
    return p === '/' ? pathname === '/' || pathname === '' : pathname === p || pathname.startsWith(p + '/')
  })
  const tabTitleFallback = currentTab?.label

  return (
    <Screen>
      <SafeArea edges={['top', 'left', 'right', 'bottom']}>
        <AppShellProvider showAppBar showTabBar>
          <TabsOptionsProvider
            layoutOptions={layoutOptions}
            pathname={pathname}
            titleForPath={titleForPath}
            screenOptions={screenOptions}
            tabs={tabs}
            tabTitleFallback={tabTitleFallback}
          >
            <Content style={screenOptions?.contentStyle as object}>
              <Outlet />
            </Content>
          </TabsOptionsProvider>
        </AppShellProvider>
      </SafeArea>
    </Screen>
  )
}

const TabsWithScreen = Tabs as typeof Tabs & { Screen: typeof TabsScreen }
TabsWithScreen.Screen = TabsScreen

export { TabsWithScreen as TabsLayout }
