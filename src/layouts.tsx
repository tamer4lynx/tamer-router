/// <reference types="@lynx-js/react" />
import * as React from '@lynx-js/react'
import {
  AppBar,
  AppShellRouterContext,
  type AppShellRouterContextValue,
  Content,
  NavigationRail,
  SafeArea,
  Screen,
  TabBar,
  TabShell,
} from '@tamer4lynx/tamer-app-shell'
import type {
  GeneratedLayoutChild,
  GeneratedLayoutDefinition,
  ReactNode,
  SerializableValue,
  ScreenOptions,
} from './types.js'
import { useThemeColors } from '@tamer4lynx/tamer-system-ui'
import {
  asBoolean,
  asRecord,
  asString,
  humanizeRouteName,
  isTabStripItemActive,
  mergeScreenOptions,
  normalizePathname,
} from './manifest.js'
import {
  mergeStyleRecords,
  mergeTabBarIconColor,
  resolveLayoutTheme,
  shellDefaultsFromResolved,
  type LayoutShellDefaults,
} from './layoutTheme.js'
import type { ThemeColors } from '@tamer4lynx/tamer-app-shell'

const AppShellRouterProvider = AppShellRouterContext.Provider as React.ComponentType<{
  value: AppShellRouterContextValue
  children?: ReactNode
}>

type ReplaceHandler = (route: string, options?: {
  mode?: string
  direction?: string
  tab?: boolean
  layoutInstanceKey?: string
}) => void

interface LayoutRuntimeContextValue {
  activePath: string
  activeOptions?: ScreenOptions
  canGoBack: boolean
  entryId: string
  layout: GeneratedLayoutDefinition
  layoutInstanceKey: string
  /** Filled by FileRouter for shell content under AppBar / TabBar. */
  overlayBackgroundColor?: string
  renderPathBelowLayout: (pathname: string) => ReactNode
  replace: ReplaceHandler
  slot: ReactNode
  titleForPath?: (pathname: string) => string
  visitedChildPaths: Record<string, string>
  back: () => void
}

const LayoutRuntimeContext = React.createContext<LayoutRuntimeContextValue | null>(null)

export interface SlotProps {
  children?: ReactNode
}

export interface ScreenDeclaratorProps {
  name: string
  options?: ScreenOptions
  path?: string
}

export function Slot(_props: SlotProps): JSX.Element | null {
  const context = React.useContext(LayoutRuntimeContext)
  return (context?.slot as JSX.Element | null) ?? null
}

export const Outlet = Slot

function useLayoutRuntimeContext(componentName: string): LayoutRuntimeContextValue {
  const context = React.useContext(LayoutRuntimeContext)
  if (!context) {
    throw new Error(`${componentName} must be rendered inside FileRouter.`)
  }
  return context
}

function createDeclarator(displayName: string) {
  function Declarator(_props: ScreenDeclaratorProps): JSX.Element | null {
    return null
  }

  Declarator.displayName = displayName
  return Declarator
}

function resolveTitle(
  layout: GeneratedLayoutDefinition,
  child: GeneratedLayoutChild | undefined,
  activePath: string,
  activeOptions: ScreenOptions | undefined,
  titleForPath?: (pathname: string) => string,
): string | undefined {
  return (
    asString(activeOptions?.title) ??
    asString(child?.options?.title) ??
    titleForPath?.(activePath) ??
    asString(child?.options?.label) ??
    (child ? humanizeRouteName(child.name) : undefined) ??
    (layout.basePath === '/' ? 'Home' : undefined)
  )
}

function renderShellContent(
  content: ReactNode,
  contentStyle: Record<string, unknown> | undefined,
  shellBackgroundColor?: string,
  /** Tab/Rail: fill space between chrome without minHeight:100% (which hides sibling TabBar / clips rail). */
  betweenChrome?: boolean,
): JSX.Element {
  return (
    <view
      style={{
        flex: 1,
        minWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...(betweenChrome
          ? {
              minHeight: '0px',
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: '0px',
            }
          : {
              maxHeight: '100%',
              minHeight: '100%',
            }),
        ...(shellBackgroundColor !== undefined ? { backgroundColor: shellBackgroundColor } : {}),
        ...(contentStyle ?? {}),
      }}
    >
      {content as never}
    </view>
  )
}

function renderActiveStripChild(
  layoutInstanceKey: string,
  activeChildName: string | undefined,
  visitedChildPaths: Record<string, string>,
  renderPathBelowLayout: (pathname: string) => ReactNode,
): ReactNode {
  const childPath = activeChildName != null ? visitedChildPaths[activeChildName] : undefined
  if (activeChildName == null || childPath == null) return null
  return (
    <view
      key={`${layoutInstanceKey}:${activeChildName}`}
      style={{
        flex: 1,
        minHeight: '0px',
        flexDirection: 'column',
      }}
    >
      {renderPathBelowLayout(childPath) as never}
    </view>
  )
}

export interface LayoutComponentProps {
  children?: ReactNode
  screenOptions?: ScreenOptions
  titleForPath?: (pathname: string) => string
}

function getBackAction(canGoBack: boolean, back: () => void) {
  if (!canGoBack) return false
  return { icon: 'arrow_back', onTap: back }
}

function asThemeColors(value: SerializableValue | undefined): ThemeColors | undefined {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as ThemeColors
}

function useAppShellRouterValue(context: LayoutRuntimeContextValue) {
  return React.useMemo(
    () => ({
      back: context.back,
      canGoBack: () => context.canGoBack,
      replace: context.replace,
    }),
    [context.back, context.canGoBack, context.replace],
  )
}

function useLayoutShellDefaults(): LayoutShellDefaults {
  const osTheme = useThemeColors()
  return React.useMemo(() => {
    const resolved = resolveLayoutTheme(osTheme)
    return shellDefaultsFromResolved(resolved)
  }, [osTheme])
}

export function Stack(props: LayoutComponentProps): JSX.Element {
  const context = useLayoutRuntimeContext('Stack')
  const shellDefaults = useLayoutShellDefaults()
  const appShellRouter = useAppShellRouterValue(context)
  const activeChild = context.layout.children.find(
    (child) => context.visitedChildPaths[child.name] === context.activePath,
  )
  const mergedOptions = mergeScreenOptions(props.screenOptions, activeChild?.options, context.activeOptions)
  const headerShown = asBoolean(mergedOptions?.headerShown) !== false
  const headerStyle = mergeStyleRecords(shellDefaults.headerStyle, asRecord(mergedOptions?.headerStyle))
  const contentStyle = mergeStyleRecords(shellDefaults.contentStyle, asRecord(mergedOptions?.contentStyle))
  const headerForegroundColor =
    asString(mergedOptions?.headerForegroundColor) ?? shellDefaults.headerForegroundColor
  const headerActionColor = asString(mergedOptions?.actionColor) ?? shellDefaults.actionColor
  const title = resolveTitle(
    context.layout,
    activeChild,
    context.activePath,
    context.activeOptions,
    props.titleForPath,
  )

  return (
    <AppShellRouterProvider value={appShellRouter}>
      <Screen style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100%' }}>
        <SafeArea
          edges={['top', 'bottom', 'left', 'right']}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100%' }}
        >
          {headerShown ? (
            <AppBar
              title={title}
              leftAction={getBackAction(context.canGoBack, context.back)}
              foregroundColor={headerForegroundColor}
              actionColor={headerActionColor}
              style={headerStyle as any}
            />
          ) : null}
          {renderShellContent(context.slot, contentStyle as Record<string, unknown> | undefined, context.overlayBackgroundColor)}
        </SafeArea>
      </Screen>
    </AppShellRouterProvider>
  )
}

Stack.Screen = createDeclarator('Stack.Screen')

export function Tab(props: LayoutComponentProps): JSX.Element {
  const context = useLayoutRuntimeContext('Tab')
  const shellDefaults = useLayoutShellDefaults()
  const appShellRouter = useAppShellRouterValue(context)
  const activeChildName = React.useMemo(() => {
    const ap = normalizePathname(context.activePath)
    const found = Object.entries(context.visitedChildPaths).find(
      ([, pathname]) => normalizePathname(pathname) === ap,
    )
    if (found?.[0]) return found[0]
    const byTarget = context.layout.children.find((c) => normalizePathname(c.targetPath) === ap)
    return byTarget?.name
  }, [context.activePath, context.visitedChildPaths, context.layout.children])
  const handleTabTap = React.useCallback(
    (targetPath: string) => {
      if (normalizePathname(targetPath) === normalizePathname(context.activePath)) return
      context.replace(targetPath, {
        tab: true,
        layoutInstanceKey: context.layoutInstanceKey,
      })
    },
    [context.activePath, context.layoutInstanceKey, context.replace],
  )
  const activeChild = context.layout.children.find((child) => child.name === activeChildName)
  const mergedOptions = mergeScreenOptions(props.screenOptions, activeChild?.options, context.activeOptions)
  const headerShown = asBoolean(mergedOptions?.headerShown) !== false
  const headerStyle = mergeStyleRecords(shellDefaults.headerStyle, asRecord(mergedOptions?.headerStyle))
  const contentStyle = mergeStyleRecords(shellDefaults.contentStyle, asRecord(mergedOptions?.contentStyle))
  const tabBarStyle = mergeStyleRecords(shellDefaults.tabBarStyle, asRecord(mergedOptions?.tabBarStyle))
  const iconColor = mergeTabBarIconColor(shellDefaults.tabBarIconColor, asRecord(mergedOptions?.iconColor))
  const headerForegroundColor =
    asString(mergedOptions?.headerForegroundColor) ?? shellDefaults.headerForegroundColor
  const headerActionColor = asString(mergedOptions?.actionColor) ?? shellDefaults.actionColor
  const tabBarChromeHex = asString(mergedOptions?.tabBarChromeHex)
  const themeColors = asThemeColors(mergedOptions?.themeColors)
  const title = resolveTitle(
    context.layout,
    activeChild,
    context.activePath,
    context.activeOptions,
    props.titleForPath,
  )

  const activeStripContent = renderActiveStripChild(
    context.layoutInstanceKey,
    activeChildName,
    context.visitedChildPaths,
    context.renderPathBelowLayout,
  )

  return (
    <AppShellRouterProvider value={appShellRouter}>
      <Screen style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100%' }}>
        <SafeArea
          edges={['top', 'bottom', 'left', 'right']}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100%' }}
        >
          {headerShown ? (
            <AppBar
              title={title}
              leftAction={getBackAction(context.canGoBack, context.back)}
              foregroundColor={headerForegroundColor}
              actionColor={headerActionColor}
              style={headerStyle as any}
            />
          ) : null}
          <TabShell
            tabBar={
              <TabBar
                tabs={context.layout.children.map((child) => {
                  const tabPath = context.visitedChildPaths[child.name] ?? child.targetPath
                  return {
                    icon: asString(child.options?.icon) ?? 'home',
                    label:
                      asString(child.options?.label) ??
                      asString(child.options?.title) ??
                      humanizeRouteName(child.name),
                    set: asString(child.options?.set) as any,
                    active: isTabStripItemActive(tabPath, context.activePath, context.layout.basePath),
                    onTap: () => handleTabTap(tabPath),
                  }
                })}
                iconColor={iconColor as any}
                style={tabBarStyle as any}
                tabBarChromeHex={tabBarChromeHex}
                themeColors={themeColors ?? null}
              />
            }
          >
            <Content scrollable={false}>
              {renderShellContent(
                activeStripContent,
                contentStyle as Record<string, unknown> | undefined,
                context.overlayBackgroundColor,
                true,
              )}
            </Content>
          </TabShell>
        </SafeArea>
      </Screen>
    </AppShellRouterProvider>
  )
}

Tab.Screen = createDeclarator('Tab.Screen')

export function Rail(props: LayoutComponentProps): JSX.Element {
  const context = useLayoutRuntimeContext('Rail')
  const shellDefaults = useLayoutShellDefaults()
  const appShellRouter = useAppShellRouterValue(context)
  const activeChildName = React.useMemo(() => {
    const ap = normalizePathname(context.activePath)
    const found = Object.entries(context.visitedChildPaths).find(
      ([, pathname]) => normalizePathname(pathname) === ap,
    )
    if (found?.[0]) return found[0]
    const byTarget = context.layout.children.find((c) => normalizePathname(c.targetPath) === ap)
    return byTarget?.name
  }, [context.activePath, context.visitedChildPaths, context.layout.children])
  const activeChild = context.layout.children.find((child) => child.name === activeChildName)
  const mergedOptions = mergeScreenOptions(props.screenOptions, activeChild?.options, context.activeOptions)
  const headerShown = asBoolean(mergedOptions?.headerShown) !== false
  const headerStyle = mergeStyleRecords(shellDefaults.headerStyle, asRecord(mergedOptions?.headerStyle))
  const contentStyle = mergeStyleRecords(shellDefaults.contentStyle, asRecord(mergedOptions?.contentStyle))
  const railStyle = mergeStyleRecords(shellDefaults.railStyle, asRecord(mergedOptions?.railStyle))
  const headerForegroundColor =
    asString(mergedOptions?.headerForegroundColor) ?? shellDefaults.headerForegroundColor
  const headerActionColor = asString(mergedOptions?.actionColor) ?? shellDefaults.actionColor
  const title = resolveTitle(
    context.layout,
    activeChild,
    context.activePath,
    context.activeOptions,
    props.titleForPath,
  )

  const activeStripContent = renderActiveStripChild(
    context.layoutInstanceKey,
    activeChildName,
    context.visitedChildPaths,
    context.renderPathBelowLayout,
  )

  return (
    <AppShellRouterProvider value={appShellRouter}>
      <Screen style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100%' }}>
        <SafeArea
          edges={['top', 'bottom', 'left', 'right']}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '100%' }}
        >
          <view
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: '0px',
            }}
          >
            {headerShown ? (
              <AppBar
                title={title}
                leftAction={getBackAction(context.canGoBack, context.back)}
                foregroundColor={headerForegroundColor}
                actionColor={headerActionColor}
                style={headerStyle as any}
              />
            ) : null}
            <view style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: '0px' }}>
              <NavigationRail
                items={context.layout.children.map((child) => ({
                  icon: asString(child.options?.icon) ?? 'home',
                  label:
                    asString(child.options?.label) ??
                    asString(child.options?.title) ??
                    humanizeRouteName(child.name),
                  value: child.name,
                  onTap: () => {
                    const targetPath = context.visitedChildPaths[child.name] ?? child.targetPath
                    if (normalizePathname(targetPath) === normalizePathname(context.activePath)) return
                    context.replace(targetPath, {
                      tab: true,
                      layoutInstanceKey: context.layoutInstanceKey,
                    })
                  },
                }))}
                selected={activeChildName}
                style={{ flexShrink: 0, ...(railStyle as object) } as any}
              />
              {renderShellContent(
                activeStripContent,
                contentStyle as Record<string, unknown> | undefined,
                context.overlayBackgroundColor,
                true,
              )}
            </view>
          </view>
        </SafeArea>
      </Screen>
    </AppShellRouterProvider>
  )
}

Rail.Screen = createDeclarator('Rail.Screen')

export const Tabs = Tab
Tabs.Screen = Tab.Screen

export function useLayoutSlot(): React.ReactNode {
  const context = React.useContext(LayoutRuntimeContext)
  return context?.slot ?? null
}

export function withLayoutRuntime<T>(
  value: LayoutRuntimeContextValue,
  children: ReactNode,
): JSX.Element {
  return (
    <LayoutRuntimeContext.Provider value={value}>
      {children}
    </LayoutRuntimeContext.Provider>
  )
}
