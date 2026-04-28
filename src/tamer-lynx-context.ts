import { createContext, useContext } from '@lynx-js/react'
import type { Context } from '@lynx-js/react'
import type { TamerFileRouterContextValue } from './types.js'

export const TamerLynxFileRouterContext: Context<TamerFileRouterContextValue | null> =
  createContext<TamerFileRouterContextValue | null>(null)

export function useTamerLynxFileRouter(): TamerFileRouterContextValue | null {
  return useContext(TamerLynxFileRouterContext)
}
