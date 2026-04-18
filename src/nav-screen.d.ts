/// <reference types="@lynx-js/types" />
import type { NavScreenProps } from '@tamer4lynx/tamer-navigation'

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'nav-screen': NavScreenProps
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'nav-screen': NavScreenProps
    }
  }
}

