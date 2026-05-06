import { createTamerStateSync } from '../state-sync.js'
import type { TamerStateSync } from '../types.js'

export interface I18nextLike {
  language: string
  changeLanguage: (lng: string) => unknown
  on: (event: 'languageChanged', listener: (lng: string) => void) => void
  off: (event: 'languageChanged', listener: (lng: string) => void) => void
}

export function createI18nextSync(key: string, i18n: I18nextLike): TamerStateSync {
  return createTamerStateSync(key, {
    getState: () => i18n.language,
    subscribe: (listener) => {
      const handler = () => listener()
      i18n.on('languageChanged', handler)
      return () => i18n.off('languageChanged', handler)
    },
    hydrate: (json) => {
      try {
        const lng = JSON.parse(json) as unknown
        if (typeof lng === 'string' && lng && lng !== i18n.language) {
          i18n.changeLanguage(lng)
        }
      } catch {
        // ignore bad json
      }
    },
  })
}
