/// <reference types="@lynx-js/react" />
import * as React from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'

export interface StackEntry {
  id: string
  /**
   * Called when this entry should be closed (animation starts).
   * The owner (e.g., FileRouter) is responsible for managing the actual closure animation.
   */
  onClosing?: () => void
}

export interface StackContextValue {
  /**
   * Returns true if there are multiple entries (overlays) in the stack.
   */
  canGoBack: () => boolean
  /**
   * Close the top entry by calling its onClosing callback.
   * Returns true if an entry was closed, false if there was nothing to close.
   */
  closeTopEntry: () => boolean
  /**
   * Register an entry in the stack. Call the returned function to unregister.
   * Entries should be registered in order (base entry first, then overlays).
   */
  registerEntry: (entry: StackEntry) => () => void
}

const StackContext = React.createContext<StackContextValue | null>(null)

/**
 * Create a stack context value.
 * This is a simple tracker that maintains the order of entries and provides
 * a way to trigger closing the top entry.
 */
export function createStackContextValue(): StackContextValue {
  const entries: StackEntry[] = []

  return {
    canGoBack: () => entries.length > 1,
    closeTopEntry: () => {
      if (entries.length <= 1) return false
      const top = entries[entries.length - 1]
      top.onClosing?.()
      return true
    },
    registerEntry: (entry: StackEntry) => {
      entries.push(entry)
      return () => {
        const idx = entries.lastIndexOf(entry)
        if (idx !== -1) entries.splice(idx, 1)
      }
    },
  }
}

/**
 * Provides stack management context for back handler integration.
 * Tracks overlay entries and enables the back handler to close overlays.
 *
 * Use with `BackHandlerRoot` to enable Android back button to close overlays
 * similar to how FileRouter's `.back()` method works.
 */
export function StackProvider({ children }: { children: ReactNode }): JSX.Element {
  const [value] = React.useState(() => createStackContextValue())
  return <StackContext.Provider value={value}>{children}</StackContext.Provider>
}

/**
 * Get the current stack context value.
 * Returns null if not inside a StackProvider.
 *
 * @example
 * const stack = useStackContext()
 * if (stack?.canGoBack()) {
 *   stack.closeTopEntry()
 * }
 */
export function useStackContext(): StackContextValue | null {
  return React.useContext(StackContext)
}
