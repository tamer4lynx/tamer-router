import type { ViewProps } from '@lynx-js/types'

export type NavTransition =
  | 'slide-right'
  | 'slide-left'
  | 'slide-up'
  | 'slide-down'
  | 'fade'
  | 'none'

declare module '@tamer4lynx/tamer-navigation' {
  export type NavTransition =
    | 'slide-right'
    | 'slide-left'
    | 'slide-up'
    | 'slide-down'
    | 'fade'
    | 'none'
}

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'nav-screen': {
      'screen-id': string
      visible?: boolean
      transition?: NavTransition
    } & ViewProps
  }
}
