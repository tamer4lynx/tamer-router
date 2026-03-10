# tamer-router

File-based routing for Lynx with **React 17** and **react-router 6**. Uses the same logic as `reference/react-router-rsbuild-plugin` (Phase 1) plus Lynx-specific output/alias and **Phase 2 native bridge** (Android back handling) in this package — no separate tamer-router-native package.

- Rsbuild plugin: scans a folder and generates a route tree (from reference plugin)
- Conventions: `index` → index route, `[param]` → dynamic segment, `_layout.tsx` → layout wrapper
- Use `useTamerRouter()` for stack-aware navigation (`push`, `replace`, `back`, `canGoBack`); `useNavigate()` remains available for plain React Router usage
- Phase 2: Android back button is handled by the router (native module in this package)

## Install

```bash
npm install tamer-router react-router@6
```

## Setup

### 1. Lynx config (Rspeedy)

Use **tamer-plugin** so the default tamer.config from tamer-router is applied (no project-level tamer.config needed):

```ts
import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { pluginTamer } from 'tamer-plugin'

export default defineConfig({
  plugins: [
    pluginTamer(),
    pluginReactLynx(),
  ],
})
```

Or add **tamerRouterPlugin** directly with custom options:

```ts
import { tamerRouterPlugin } from 'tamer-router'

tamerRouterPlugin({
  root: './src/pages',
  output: './src/generated/_generated_routes.tsx',
  srcAlias: '@/',
  layoutFilename: '_layout.tsx',
})
```

**tamer-router** ships a default **tamer.config** at `tamer-router/tamer.config`; **pluginTamer** loads it when no local tamer.config exists.

### 2. Entry point

Render the router with the generated routes:

```tsx
// src/index.tsx
import { root } from '@lynx-js/react'
import { FileRouter } from 'tamer-router'
import routes from './generated/_generated_routes'

root.render(<FileRouter routes={routes} />)

if (import.meta.webpackHot) {
  import.meta.webpackHot.accept()
}
```

### 3. File structure example

```
src/
  pages/
    _layout.tsx      # layout for / and children
    index.tsx        # route /
    about.tsx        # route /about
    user/
      _layout.tsx    # layout for /user
      index.tsx      # route /user
      [id].tsx       # route /user/:id
```

### 4. Navigate in components

In Lynx, `bindtap` handlers run in a dual-thread model. Use `useCallback` from `@lynx-js/react` and mark the callback with `'background only'` so navigation runs in the correct context:

```tsx
import { useCallback } from '@lynx-js/react'
import { useTamerRouter } from 'tamer-router'

export function Home() {
  const router = useTamerRouter()
  const goAbout = useCallback(() => {
    'background only'
    router.push('/about')
  }, [router])
  return (
    <view>
      <text bindtap={goAbout}>Go to About</text>
    </view>
  )
}
```

## Conventions

| File            | Route        |
|-----------------|-------------|
| `index.tsx`     | index route |
| `about.tsx`     | `/about`    |
| `[id].tsx`      | `/:id`      |
| `_layout.tsx`   | layout (wraps children, not a route) |

## API

- **`tamerRouterPlugin(options)`** – Rsbuild plugin. Options: `root`, `output`, `srcAlias?`, `layoutFilename?`
- **`<FileRouter routes={routes} basename="/" />`** – Renders `createMemoryRouter` + `RouterProvider`
- **`useTamerRouter()`** – Stack-aware navigation API for Lynx apps: `push`, `replace`, `back`, `pop`, `canGoBack`

Compatible with [Lynx React Router](https://lynxjs.org/react/routing/react-router) (MemoryRouter, useNavigate, useParams, useLocation).

## Design: Phase 1 vs Phase 2

**Phase 1 (from reference)**  
`reference/react-router-rsbuild-plugin` already provides file-based route generation + `createMemoryRouter` + `RouterProvider`. One LynxView, one JS runtime; route changes are React state. tamer-router keeps that and adds output path fixes, alias, and Lynx bindtap guidance.

**Phase 2 (native stack - "JS puppeteering")**  
We add a native bridge so the **native** side handles back: one LynxView, one runtime; native does not create one Activity per route. When the user presses the system back button, native sends an event to JS; the router pops if it can, and tells native whether it consumed the back. `tamer-router` now keeps explicit stack-aware actions (`push`, `replace`, `back`) so hardware back and in-app navigation behave more like `expo-router` on native. Optional: native `push`/`pop`/`replace` hooks drive transition animations. Implemented in this package (native module + `FileRouter` stack controller).
