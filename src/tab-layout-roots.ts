import type { ScreenOptions } from './types.js'

let registeredTabRootPaths: Set<string> | null = null

export function normalizeTabPath(p: string): string {
  if (p == null) return '/'
  const t = String(p).trim()
  if (t === '' || t === '/') return '/'
  return t.startsWith('/') ? t : `/${t}`
}

/** Same href rules as `<TabBar>` / tab `onTap` in `layouts.tsx`. */
export function tabRootPathsFromOptions(
  pathPrefix: string,
  options: Map<string, ScreenOptions>,
): Set<string> {
  const base = pathPrefix.replace(/\/$/, '')
  const set = new Set<string>()
  for (const n of options.keys()) {
    const homeHref = base || '/'
    const href = n === 'index' ? homeHref : base ? `${base}/${n}` : `/${n}`
    set.add(normalizeTabPath(href))
  }
  return set
}

export function setRegisteredTabRootPaths(paths: Set<string> | null) {
  registeredTabRootPaths = paths
}

/**
 * Sibling top-level tab routes: switching should replace history, not push
 * (matches TabBar `replace: true` and works for `navigate()` from buttons, etc.).
 */
export function shouldCoerceTabReplace(fromPathname: string, toPathname: string): boolean {
  if (!registeredTabRootPaths || registeredTabRootPaths.size < 2) return false
  const a = normalizeTabPath(fromPathname)
  const b = normalizeTabPath(toPathname)
  if (a === b) return false
  return registeredTabRootPaths.has(a) && registeredTabRootPaths.has(b)
}
