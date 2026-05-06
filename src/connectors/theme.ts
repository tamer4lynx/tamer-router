import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export type ThemeValue = 'light' | 'dark' | 'system' | (string & {})

export interface ThemeApi<T extends ThemeValue = ThemeValue> {
  getTheme: () => T
  setTheme: (next: T) => void
  subscribe: (listener: () => void) => () => void
}

export function createThemeSync<T extends ThemeValue = ThemeValue>(
  key: string,
  api: ThemeApi<T>,
): TamerStateSync {
  return createTamerStateSync(key, {
    getState: () => api.getTheme(),
    subscribe: (listener) => api.subscribe(listener),
    hydrate: (json) => {
      try {
        const next = JSON.parse(json) as unknown
        if (typeof next === 'string' && next !== api.getTheme()) {
          api.setTheme(next as T)
        }
      } catch {
        // ignore bad json
      }
    },
  })
}
