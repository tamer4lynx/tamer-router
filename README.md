# tamer-router

File-based routing for Lynx with **React 17** and **react-router 6**. Rsbuild plugin for route generation, **Stack** and **Tabs** layouts with AppBar/TabBar (tamer-app-shell), and native Android back handling.

- Rsbuild plugin: scans a folder and generates a route tree
- Conventions: `index` → index route, `[param]` → dynamic segment, `_layout.tsx` → layout wrapper
- **Stack** and **Tabs** layouts with AppBar, TabBar, Content (via tamer-app-shell)
- `useTamerRouter()` / `useTamerNavigate()` for stack-aware navigation (`push`, `replace`, `back`, `tabReplace`, `canGoBack`)
- Android back button handled by the router (native module in this package)

## Install

```bash
npm install @tamer4lynx/tamer-router react-router@6 @tamer4lynx/tamer-app-shell
```

Stack and Tabs layouts require **tamer-app-shell**. Add to your app and run `t4l link`.

## Setup

### 1. Lynx config (Rspeedy)

Use **tamer-plugin** so the default tamer.config from tamer-router is applied:

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

Or add **tamerRouterPlugin** directly:

```ts
import { tamerRouterPlugin } from '@tamer4lynx/tamer-router'

tamerRouterPlugin({
  root: './src/pages',
  output: './src/generated/_generated_routes.tsx',
  srcAlias: '@/',
  layoutFilename: '_layout.tsx',
})
```

### 2. Entry point

**Option A: Simple FileRouter**

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

**Option B: Tabs layout (recommended)**

Use `Tabs` in `_layout.tsx` for AppBar + TabBar. The layout wraps all pages:

```tsx
// src/pages/_layout.tsx
import { Tabs } from '@tamer4lynx/tamer-router'
import { useSystemUI } from '@tamer4lynx/tamer-system-ui'

export default function Layout() {
  const { setStatusBar, setNavigationBar } = useSystemUI()

  useEffect(() => {
    setStatusBar({ color: '#fff', style: 'light' })
    setNavigationBar({ color: '#fff', style: 'light' })
  }, [])

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#555' },
        tabBarStyle: { backgroundColor: '#555' },
      }}
    >
      <Tabs.Screen name="index" path="/" options={{ title: 'Home', icon: 'home', label: 'Home' }} />
      <Tabs.Screen name="about" path="/about" options={{ title: 'About', icon: 'info', label: 'About' }} />
    </Tabs>
  )
}
```

### 3. File structure example

```
src/
  pages/
    _layout.tsx      # layout for / and children (Tabs or Stack)
    index.tsx        # route /
    about.tsx        # route /about
    user/
      _layout.tsx    # layout for /user
      index.tsx      # route /user
      [id].tsx       # route /user/:id
```

### 4. Navigate in components

In Lynx, `bindtap` handlers run in a dual-thread model. Use `useCallback` and mark the callback with `'background only'`:

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

Or use `useTamerNavigate` for `push`, `replace`, `back`, `tabReplace`:

```tsx
import { useTamerNavigate } from '@tamer4lynx/tamer-router'

const { push, replace, back, tabReplace } = useTamerNavigate()
```

## Conventions

| File            | Route        |
|-----------------|-------------|
| `index.tsx`     | index route |
| `about.tsx`     | `/about`    |
| `[id].tsx`      | `/:id`      |
| `_layout.tsx`   | layout (wraps children, not a route) |

## API

### Layout components

| Component | Description |
|-----------|-------------|
| `<Stack children screenOptions? titleForPath? />` | Stack layout with AppBar, no TabBar |
| `<Stack.Screen name path options? />` | Screen declarator for Stack |
| `<Tabs children screenOptions? titleForPath? />` | Tabs layout with AppBar + TabBar |
| `<Tabs.Screen name path options? />` | Tab declarator: `options` includes `title`, `icon`, `label`, `set` |
| `<FileRouter routes basename? transitionConfig? />` | Renders `createMemoryRouter` + `RouterProvider` |

### Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTamerRouter()` | `{ push, replace, back, pop, tabReplace, canGoBack }` | Stack-aware navigation |
| `useTamerNavigate()` | `{ push, replace, back, tabReplace }` | Navigation actions |
| `useScreenOptions(options)` | `void` | Set per-screen header/title options |

### Plugin

| API | Description |
|-----|-------------|
| `tamerRouterPlugin(options)` | Rsbuild plugin. Options: `root`, `output`, `srcAlias?`, `layoutFilename?` |

### Other exports

| Export | Description |
|--------|-------------|
| `Outlet`, `Slot` | From react-router; render child route content |
| `./layouts` | Subpath: `Stack`, `Tabs`, `StackScreen`, `TabsScreen`, `useScreenOptions` |

### FileRouter transition options

```ts
interface TransitionConfig {
  enabled?: boolean
  direction?: 'left' | 'right'
  mode?: 'stack' | 'scroll'
}
```

Compatible with [Lynx React Router](https://lynxjs.org/react/routing/react-router) (MemoryRouter, useNavigate, useParams, useLocation).

## Platform: lynx.ext.json

This package uses **lynx.ext.json** (RFC standard). Linking runs automatically on install when your project has a postinstall script; otherwise run `t4l link`.
