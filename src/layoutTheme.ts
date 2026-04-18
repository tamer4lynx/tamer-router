import type { ThemeColors } from '@tamer4lynx/tamer-system-ui'

const LIGHT_FALLBACK: ThemeColors = {
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

const THEME_FALLBACK: ThemeColors = {
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

export function resolveLayoutTheme(theme: ThemeColors | null): ThemeColors {
  if (theme == null) {
    return { ...LIGHT_FALLBACK }
  }
  return {
    ...theme,
    surface: theme.surface ?? THEME_FALLBACK.surface,
    surfaceContainer: theme.surfaceContainer ?? THEME_FALLBACK.surfaceContainer,
    primary: theme.primary ?? THEME_FALLBACK.primary,
    primaryDark: theme.primaryDark ?? THEME_FALLBACK.primaryDark,
    background: theme.background ?? THEME_FALLBACK.background,
    onSurface: theme.onSurface ?? THEME_FALLBACK.onSurface,
    onSurfaceVariant: theme.onSurfaceVariant ?? THEME_FALLBACK.onSurfaceVariant,
    secondaryContainer: theme.secondaryContainer ?? THEME_FALLBACK.secondaryContainer,
    onSecondaryContainer: theme.onSecondaryContainer ?? THEME_FALLBACK.onSecondaryContainer,
    isDark: theme.isDark ?? THEME_FALLBACK.isDark,
  }
}

export interface TabBarIconColorDefaults {
  pill: string
  active: string
  inactive: string
  labelActive: string
  labelInactive: string
}

export interface LayoutShellDefaults {
  actionColor: string
  contentStyle: Record<string, string>
  headerForegroundColor: string
  headerStyle: Record<string, string>
  railStyle: Record<string, string>
  tabBarStyle: Record<string, string>
  tabBarIconColor: TabBarIconColorDefaults
}

export function shellDefaultsFromResolved(colors: ThemeColors): LayoutShellDefaults {
  const sc = colors.surfaceContainer
  const surface = colors.surface
  const onSurface = colors.onSurface
  const primary = colors.primary
  const onSurfaceVariant = colors.onSurfaceVariant
  const secondaryContainer = colors.secondaryContainer
  return {
    headerStyle: {
      backgroundColor: sc ?? '#1e1e1e',
      borderBottomColor: sc ?? '#333333',
    },
    contentStyle: {
      backgroundColor: surface ?? '#ffffff',
    },
    tabBarStyle: {
      backgroundColor: sc ?? '#000000',
      borderTopColor: sc ?? '#333333',
    },
    railStyle: {
      backgroundColor: sc ?? '#1e1e1e',
    },
    headerForegroundColor: onSurface ?? '#ffffff',
    actionColor: onSurface ?? '#ffffff',
    tabBarIconColor: {
      pill: secondaryContainer ?? '#1a3538',
      active: primary ?? '#6750a4',
      inactive: onSurfaceVariant ?? '#49454f',
      labelActive: primary ?? '#6750a4',
      labelInactive: onSurfaceVariant ?? '#49454f',
    },
  }
}

export function mergeStyleRecords(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !override) return undefined
  return { ...(base ?? {}), ...(override ?? {}) }
}

export function mergeTabBarIconColor(
  base: TabBarIconColorDefaults,
  override: Record<string, unknown> | undefined,
): TabBarIconColorDefaults {
  if (!override) return base
  return { ...base, ...override } as TabBarIconColorDefaults
}
