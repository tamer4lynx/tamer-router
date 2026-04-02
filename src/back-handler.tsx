import React from 'react'

declare const lynx: { getJSModule?(id: string): { addListener?(e: string, fn: (ev: { payload?: string }) => void): void; removeListener?(e: string, fn: unknown): void } } | undefined

declare const NativeModules: {
  TamerRouterNativeModule?: {
    didHandleBack(consumed: boolean): void
  }
} | undefined

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

/**
 * Subscribes to `tamer-router:back` on GlobalEventEmitter. Runs `backHandlers` first;
 * if none return `true`, calls `onUnhandled` (router pop, or `didHandleBack(false)`).
 */
export function useTamerBackEvent(backHandlers: BackHandlerRegistry, onUnhandled: () => void): void {
  React.useEffect(() => {
    const bridge = typeof lynx !== 'undefined' ? lynx?.getJSModule?.('GlobalEventEmitter') : undefined
    if (!bridge?.addListener) return
    const handler = () => {
      if (backHandlers.invoke()) {
        NativeModules?.TamerRouterNativeModule?.didHandleBack?.(true)
        return
      }
      onUnhandled()
    }
    bridge.addListener('tamer-router:back', handler)
    return () => { bridge.removeListener?.('tamer-router:back', handler) }
  }, [backHandlers, onUnhandled])
}

export interface BackHandlerRootProps {
  children: React.ReactNode
}

/**
 * Minimal root for `useBackHandler` / `usePreventBack` without `FileRouter` or react-router.
 * Still requires the same native setup (`lynx.ext.json`, `TamerRouterNativeModule`).
 * When no handler consumes back, `didHandleBack(false)` is called (e.g. host may finish Activity).
 */
export function BackHandlerRoot({ children }: BackHandlerRootProps): JSX.Element {
  const backHandlerRegistry = React.useMemo(() => createBackHandlerRegistry(), [])
  const onUnhandled = React.useCallback(() => {
    NativeModules?.TamerRouterNativeModule?.didHandleBack?.(false)
  }, [])
  useTamerBackEvent(backHandlerRegistry, onUnhandled)
  return React.createElement(
    BackHandlerContext.Provider,
    { value: backHandlerRegistry },
    children,
  )
}

/**
 * Register a callback that intercepts the hardware/system back event before default handling.
 *
 * Return `true` to consume the event; `false` to let the next handler or (under `FileRouter`) the router run.
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

  React.useEffect(() => {
    if (!enabled || !registry) return
    return registry.add(() => handlerRef.current())
  }, [enabled, registry])
}

/**
 * While `enabled` is true, consumes every back event (same as `useBackHandler(() => enabled, enabled)`).
 */
export function usePreventBack(enabled = true): void {
  useBackHandler(() => !!enabled, enabled)
}
