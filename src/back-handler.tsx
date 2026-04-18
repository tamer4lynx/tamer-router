/// <reference types="@lynx-js/react" />
import * as React from '@lynx-js/react'
import type { ReactNode } from '@lynx-js/react'
import { useLynxGlobalEventListener } from '@lynx-js/react'

declare const NativeModules:
  | {
      TamerRouterNativeModule?: {
        didHandleBack?(consumed: boolean): void
        registerBackButtonListener?(callback: () => void): void
      }
    }
  | undefined

type BackHandler = () => boolean

export interface BackHandlerRegistry {
  add(handler: BackHandler): () => void
  invoke(): boolean
}

export function createBackHandlerRegistry(): BackHandlerRegistry {
  const stack: BackHandler[] = []
  return {
    add(handler) {
      stack.push(handler)
      return () => {
        const idx = stack.lastIndexOf(handler)
        if (idx !== -1) stack.splice(idx, 1)
      }
    },
    invoke() {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]()) return true
      }
      return false
    },
  }
}

export const BackHandlerContext = React.createContext<BackHandlerRegistry | null>(null)

export function useBackHandlerListeners(
  registry: BackHandlerRegistry,
  onUnhandled?: () => boolean,
): void {
  const onUnhandledRef = React.useRef(onUnhandled)
  const lastDispatchMsRef = React.useRef(0)
  onUnhandledRef.current = onUnhandled

  const dispatchBack = React.useCallback(() => {
    'background only'
    const now = Date.now()
    if (now - lastDispatchMsRef.current < 16) return
    lastDispatchMsRef.current = now

    const consumedByHook = registry.invoke()
    const consumed = consumedByHook ? true : !!onUnhandledRef.current?.()
    NativeModules?.TamerRouterNativeModule?.didHandleBack?.(consumed)
  }, [registry])

  // Listen via Lynx global event hooks (synchronous registration)
  useLynxGlobalEventListener('backButtonPressed', dispatchBack)
  useLynxGlobalEventListener('tamer-router:back', dispatchBack)

  // Also register the direct callback with the native module.
  // Use useMemo so it happens during render, not after paint.
  React.useMemo(() => {
    'background only'
    NativeModules?.TamerRouterNativeModule?.registerBackButtonListener?.(dispatchBack)
  }, [dispatchBack])
}

/**
 * Handler priority (deepest `useBackHandler` wins, LIFO — same as React Native BackHandler):
 * 1. `useBackHandler` callbacks newest-first
 * 2. `onUnhandled` — provided by `FileRouter` as `onSystemBackUnhandled`
 */
export function useBackHandlerSetup(): BackHandlerRegistry {
  return React.useMemo(() => createBackHandlerRegistry(), [])
}

export interface BackHandlerProviderProps {
  children: ReactNode
  /**
   * When no `useBackHandler` returns `true`, called once per back event.
   * Return `true` to consume (host does nothing); `false` to let the host apply default back.
   * Omit to always delegate to the host (`didHandleBack(false)`).
   */
  onUnhandled?: () => boolean
}

/** @deprecated Renamed to {@link BackHandlerProviderProps}. */
export type BackHandlerRootProps = BackHandlerProviderProps

/**
 * Provides {@link BackHandlerContext} for `useBackHandler` / `usePreventBack`.
 *
 * `FileRouter` sets this up internally — do not add another `BackHandlerProvider` inside
 * `FileRouter`. For standalone LynxViews (no `FileRouter`), wrap your root component.
 */
export function BackHandlerProvider({ children, onUnhandled }: BackHandlerProviderProps): JSX.Element {
  const registry = useBackHandlerSetup()
  useBackHandlerListeners(registry, onUnhandled)
  return (
    <BackHandlerContext.Provider value={registry}>
      {children}
    </BackHandlerContext.Provider>
  )
}

/** @deprecated Renamed to {@link BackHandlerProvider}. */
export const BackHandlerRoot = BackHandlerProvider

/**
 * Register a callback that intercepts the hardware/system back event before default handling.
 *
 * Return `true` to consume the event; `false` to let the next handler or (under `FileRouter`) the router run.
 *
 * Registration is **synchronous** (during render via `useMemo`) so the handler is
 * present in the registry before the first paint — this avoids the race where a
 * back press arrives before `useEffect` has fired.
 *
 * @example
 * useBackHandler(() => {
 *   if (modalOpen) { setModalOpen(false); return true }
 *   return false
 * }, modalOpen)
 */
export function useBackHandler(handler: () => boolean, enabled = true): void {
  const registry = React.useContext(BackHandlerContext)
  const handlerRef = React.useRef(handler)
  handlerRef.current = handler

  // Keep a stable ref to the remove function so cleanup and re-registration
  // can happen without depending on the handler identity.
  const removeRef = React.useRef<(() => void) | null>(null)

  // Register synchronously during render so the handler is present in the
  // registry before effects fire — this closes the timing gap where a back
  // press could arrive between first paint and the first useEffect call.
  React.useMemo(() => {
    // Clean up previous registration if enabled/registry changed
    if (removeRef.current) {
      removeRef.current()
      removeRef.current = null
    }
    if (!enabled || !registry) return
    removeRef.current = registry.add(() => handlerRef.current())
  }, [enabled, registry])

  // Cleanup on unmount only (useMemo doesn't have a cleanup return)
  // No dependencies — cleanup should only run on unmount, not on state changes
  React.useEffect(() => {
    return () => {
      if (removeRef.current) {
        removeRef.current()
        removeRef.current = null
      }
    }
  }, [])
}

/**
 * While `enabled` is true, consumes every back event (same as `useBackHandler(() => enabled, enabled)`).
 */
export function usePreventBack(enabled = true): void {
  useBackHandler(() => !!enabled, enabled)
}
