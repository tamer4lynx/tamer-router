/// <reference types="@lynx-js/types" />
import React from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import type { ViewProps } from '@lynx-js/types'

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'stack-screen': { 'screen-id': string; visible?: boolean } & ViewProps
  }
}
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'stack-screen': { 'screen-id': string; visible?: boolean } & ViewProps
    }
  }
}

/**
 * Represents a live screen on the navigation stack.
 *
 * Each screen gets its own isolated MemoryRouter so its routing context
 * (useParams, useLocation, etc.) is scoped to that path. Global React contexts
 * (theme, auth, etc.) are shared because StackNavigator is above all screens
 * in the component tree.
 */
export interface StackEntry {
  readonly key: string
  readonly path: string
  readonly visible: boolean
}

export interface StackNavigatorProps {
  /**
   * The flat route list used to resolve path → component for each screen.
   * Provide the same `routes` array you use with `FileRouter`.
   */
  routes: RouteObject[]
  /**
   * Current navigation stack. Index 0 is the root; last entry is the top screen.
   * Set `visible: true` for the top screen (it slides in). Others stay mounted
   * behind it so back navigation is instant.
   */
  stack: StackEntry[]
}

/**
 * Renders each stack entry inside a `<stack-screen>` element backed by
 * its own isolated MemoryRouter. Screens slide in/out via the native
 * TamerStackManager without any bitmap capture.
 *
 * Usage:
 * ```tsx
 * const [stack, setStack] = useState<StackEntry[]>([
 *   { key: 'root', path: '/', visible: true },
 * ])
 *
 * function push(path: string) {
 *   setStack(prev => [
 *     ...prev.map(s => ({ ...s, visible: false })),
 *     { key: `${Date.now()}`, path, visible: true },
 *   ])
 * }
 *
 * function pop() {
 *   setStack(prev => {
 *     if (prev.length <= 1) return prev
 *     const next = prev.slice(0, -1)
 *     next[next.length - 1] = { ...next[next.length - 1], visible: true }
 *     return next
 *   })
 * }
 *
 * return <StackNavigator routes={routes} stack={stack} />
 * ```
 */
export function StackNavigator({ routes, stack }: StackNavigatorProps) {
  return (
    <>
      {stack.map((entry) => (
        <StackScreen key={entry.key} entry={entry} routes={routes} />
      ))}
    </>
  )
}

interface StackScreenInternalProps {
  entry: StackEntry
  routes: RouteObject[]
}

const StackScreen = React.memo(function StackScreen({ entry, routes }: StackScreenInternalProps) {
  const routerRef = React.useRef<ReturnType<typeof createMemoryRouter> | null>(null)
  if (!routerRef.current) {
    routerRef.current = createMemoryRouter(routes, {
      initialEntries: [entry.path],
    })
  }

  return (
    <stack-screen screen-id={entry.key} visible={entry.visible}>
      <RouterProvider router={routerRef.current} />
    </stack-screen>
  )
})
