import type {
  GeneratedLayoutDefinition,
  GeneratedLayoutChild,
  GeneratedRouteDefinition,
  GeneratedRoutesManifest,
  Href,
  HrefObject,
  PrimitiveRouteParam,
  SerializableValue,
  ScreenOptions,
} from './types.js'

export interface MatchedRoute {
  route: GeneratedRouteDefinition
  params: Record<string, string>
}

export interface StackIdentity {
  key: string
  kind: 'route' | 'tab' | 'rail'
  layoutId?: string
  layoutBasePath?: string
}

export function normalizePathname(rawPathname: string, basename = '/'): string {
  const withoutHash = rawPathname.split('#', 1)[0] ?? ''
  const withoutQuery = withoutHash.split('?', 1)[0] ?? ''
  let pathname = withoutQuery.trim()
  if (!pathname) pathname = '/'
  if (!pathname.startsWith('/')) pathname = `/${pathname}`

  const normalizedBase = normalizeBasePath(basename)
  if (normalizedBase !== '/' && pathname.startsWith(normalizedBase)) {
    pathname = pathname.slice(normalizedBase.length) || '/'
  }

  pathname = pathname.replace(/\/{2,}/g, '/')
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  return pathname || '/'
}

export function normalizeBasePath(basename = '/'): string {
  const normalized = basename.startsWith('/') ? basename : `/${basename}`
  if (normalized === '/') return '/'
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

/** Used by tab strip layouts: index tab (path === layout base) matches only exact active path. */
export function isTabStripItemActive(
  tabPath: string,
  activePath: string,
  layoutBasePath: string,
): boolean {
  const p = normalizePathname(tabPath)
  const pn = normalizePathname(activePath)
  const base = normalizePathname(layoutBasePath)
  if (p === base) {
    return pn === p
  }
  if (p === '/') {
    return pn === '/' || pn === ''
  }
  return pn === p || pn.startsWith(`${p}/`)
}

export function hrefToPathname(href: Href | HrefObject<string>): string {
  if (typeof href === 'string') return href
  const params = href.params ?? {}
  return href.pathname.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    const value = params[name]
    if (value === undefined || value === null) {
      return `[${name}]`
    }
    return encodeURIComponent(String(value))
  })
}

export function resolveConcretePath(
  manifest: GeneratedRoutesManifest,
  href: Href | HrefObject<string>,
  basename = '/',
): string {
  const pathname = normalizePathname(hrefToPathname(href), basename)
  if (matchRoute(manifest, pathname)) {
    return pathname
  }
  return manifest.defaultPathByBasePath[pathname] ?? pathname
}

export function matchRoute(
  manifest: GeneratedRoutesManifest,
  pathname: string,
): MatchedRoute | null {
  for (const route of manifest.routes) {
    const match = route.matcher.exec(pathname)
    if (!match) continue
    const params: Record<string, string> = {}
    route.paramNames.forEach((name, index) => {
      const rawValue = match[index + 1] ?? ''
      params[name] = decodeURIComponent(rawValue)
    })
    return { route, params }
  }
  return null
}

export function getLayoutInstanceKey(entryId: string, layoutId: string): string {
  return `${entryId}:${layoutId}`
}

export function resolveStackIdentity(
  manifest: GeneratedRoutesManifest,
  pathname: string,
): StackIdentity {
  const match = matchRoute(manifest, pathname)
  if (!match) {
    return { key: pathname, kind: 'route' }
  }

  for (let index = match.route.layoutIds.length - 1; index >= 0; index -= 1) {
    const layoutId = match.route.layoutIds[index]
    const layout = manifest.layouts[layoutId]
    if (!layout || (layout.kind !== 'tab' && layout.kind !== 'rail')) continue

    const childName = match.route.childNameByLayoutId[layoutId]
    if (!childName) continue

    const child = layout.children.find((candidate) => candidate.name === childName)
    if (!child || child.targetPath !== pathname) continue

    return {
      key: layout.basePath,
      kind: layout.kind,
      layoutId,
      layoutBasePath: layout.basePath,
    }
  }

  return { key: pathname, kind: 'route' }
}

/**
 * True when `fromPath` → `toPath` is a Tab/Rail **strip** change (different direct child of the same
 * tab or rail layout). Stack layouts never match — sibling `push` under `Stack` keeps normal stack behavior.
 */
export function isTabRailStripSwitch(
  manifest: GeneratedRoutesManifest,
  fromPath: string,
  toPath: string,
  basename = '/',
): boolean {
  const a = normalizePathname(fromPath, basename)
  const b = normalizePathname(toPath, basename)
  if (a === b) return false
  const mA = matchRoute(manifest, a)
  const mB = matchRoute(manifest, b)
  if (!mA || !mB) return false

  for (let i = mA.route.layoutIds.length - 1; i >= 0; i -= 1) {
    const layoutId = mA.route.layoutIds[i]
    const layout = manifest.layouts[layoutId]
    if (!layout || (layout.kind !== 'tab' && layout.kind !== 'rail')) continue

    const ca = mA.route.childNameByLayoutId[layoutId]
    const cb = mB.route.childNameByLayoutId[layoutId]
    if (ca == null || cb == null) continue
    if (ca !== cb) return true
  }
  return false
}

export function seedVisitedPathsForPath(
  manifest: GeneratedRoutesManifest,
  entryId: string,
  visitedPathsByLayoutKey: Record<string, Record<string, string>>,
  pathname: string,
): Record<string, Record<string, string>> {
  const match = matchRoute(manifest, pathname)
  if (!match) return visitedPathsByLayoutKey

  let next = visitedPathsByLayoutKey
  for (const layoutId of match.route.layoutIds) {
    const layout = manifest.layouts[layoutId]
    if (!layout || (layout.kind !== 'tab' && layout.kind !== 'rail')) continue
    const childName = match.route.childNameByLayoutId[layoutId]
    if (!childName) continue
    const layoutKey = getLayoutInstanceKey(entryId, layoutId)
    const existing = next[layoutKey] ?? {}
    if (existing[childName] === pathname) continue
    next = {
      ...next,
      [layoutKey]: {
        ...existing,
        [childName]: pathname,
      },
    }
  }
  return next
}

export function mergeScreenOptions(
  ...optionsList: Array<ScreenOptions | undefined>
): ScreenOptions | undefined {
  let merged: ScreenOptions | undefined
  for (const options of optionsList) {
    if (!options) continue
    merged = {
      ...(merged ?? {}),
      ...options,
    }
  }
  return merged
}

export function humanizeRouteName(name: string): string {
  if (name === 'index') return 'Home'
  const cleaned = name
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (!cleaned) return name
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function asString(value: SerializableValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function asBoolean(value: SerializableValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function asRecord(
  value: SerializableValue | undefined,
): Record<string, PrimitiveRouteParam> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, PrimitiveRouteParam>
}

export function getActiveChildDefinition(
  layout: GeneratedLayoutDefinition,
  match: MatchedRoute | null,
): GeneratedLayoutChild | undefined {
  if (!match) return undefined
  const childName = match.route.childNameByLayoutId[layout.id]
  if (!childName) return undefined
  return layout.children.find((child) => child.name === childName)
}
