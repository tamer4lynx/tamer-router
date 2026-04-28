import type { TamerOutermostStack } from './types.js'

/**
 * All recognized top-level stack paths. Checked to identify if a path belongs
 * to a known stack region. Seeded with defaults; overwritten by setAllStackPaths().
 */
let ALL_STACK_PATHS: Set<string> = new Set(['/tabs', '/m3', '/native'])

/**
 * Top-level paths that are Tab-kind stacks. Tab routes must never trigger
 * native navigation — they swap via React Router `navigate()` in the same bundle.
 *
 * Configurable via `setTabStackPaths(...)` from the file router plugin output.
 */
let TAB_STACK_PATHS: Set<string> = new Set(['/tabs'])

/** Set the registered tab-kind stack paths. Called from generated manifest. */
export function setTabStackPaths(paths: Iterable<string>): void {
  TAB_STACK_PATHS = new Set(paths)
}

/** Set all recognized top-level stack paths (tab + stack kind). Called from generated manifest. */
export function setAllStackPaths(paths: Iterable<string>): void {
  ALL_STACK_PATHS = new Set(paths)
}

/** Returns true when the given outermost stack id is a Tab-kind stack. */
export function isTabStackPath(stack: TamerOutermostStack): boolean {
  if (stack == null) return false
  return TAB_STACK_PATHS.has(stack)
}

/** URL path prefix of the “outer” native stack region (for `shouldNativePush`). */
export function getOutermostStackFromPath(pathname: string): TamerOutermostStack {
  const p = pathname === '' || pathname === '/' ? '/' : pathname
  const segs = p.split('/').filter(Boolean)
  if (segs.length === 0) return null
  const head = `/${segs[0]}`
  if (ALL_STACK_PATHS.has(head)) return head
  return null
}

/**
 * Decides whether a navigation should open a new native spoke bundle vs. stay
 * local in the current bundle.
 *
 * Rules:
 *  - Tab-kind target (e.g. `/tabs`, `/m3`) → always local JS (all Tab.Screen share one spoke)
 *  - Stack-kind target (e.g. `/native`) → always native push (each Stack.Screen = own spoke)
 *  - Unknown/loose route target → local JS
 */
export function shouldNativePush(options: {
  toPath: string
  fromPath: string
  isSpoke: boolean
  spokeRootStack: TamerOutermostStack
}): boolean {
  const target = getOutermostStackFromPath(options.toPath)
  // No recognized stack or Tab-kind → always local JS
  if (target == null || isTabStackPath(target)) return false
  // Stack-kind: every navigation to a different path = new native spoke
  return options.toPath !== options.fromPath
}
