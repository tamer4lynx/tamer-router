# tamer-router

File-based routing for Lynx with **React 17** and **react-router 6**. Rsbuild plugin for route generation, **Stack** and **Tabs** layouts with AppBar/TabBar (tamer-app-shell), and native Android back handling.

- Rsbuild plugin: scans a folder and generates a route tree
- Conventions: `index` → index route, `[param]` → dynamic segment, `_layout.tsx` → layout wrapper
- **Stack** and **Tabs** layouts with AppBar, TabBar, Content (via tamer-app-shell)
- `useTamerRouter()` / `useTamerNavigate()` for stack-aware navigation (`push`, `replace`, `back`, `tabReplace`, `canGoBack`)
- **System back:** native **`TamerRouterNativeModule`** emits **`tamer-router:back`** on **`GlobalEventEmitter`**. **`FileRouter`** runs **`useBackHandler` / `usePreventBack`** callbacks first (stacked; most recent wins); if none return `true`, the router pops when **`canGoBack()`**. JS notifies native via **`didHandleBack(consumed)`** for transitions (e.g. Android snapshot overlay).

## Install

```bash
npm install @tamer4lynx/tamer-router react-router@6 @tamer4lynx/tamer-app-shell
```

Stack and Tabs layouts require **tamer-app-shell**. Add to your app and run `t4l link`.

### Intercepting back (`useBackHandler` / `usePreventBack`)

You **do not** need **Stack**, **Tabs**, or **`useTamerNavigate`** / file-based routing to use these hooks.

- **With file-based routing:** wrap the app with **`FileRouter`** (even a single route). Unhandled back pops the JS stack when **`canGoBack()`**.
- **Without `FileRouter`:** wrap the app with **`BackHandlerRoot`** so the same hooks get a back-handler context. Unhandled back calls **`didHandleBack(false)`** (host may finish the Activity / default behavior).

Without **`FileRouter`** or **`BackHandlerRoot`**, the hooks are inert; subscribe to **`tamer-router:back`** on **`GlobalEventEmitter`** and call **`didHandleBack`** yourself.

```tsx
import { BackHandlerRoot, useBackHandler, usePreventBack } from '@tamer4lynx/tamer-router'

// Minimal app without react-router FileRouter — still needs tamer-router native (lynx.ext.json)
root.render(
  <BackHandlerRoot>
    <MyScreen />
  </BackHandlerRoot>,
)

// Return true to consume the back event (e.g. close a modal instead of popping)
useBackHandler(() => {
  if (modalOpen) {
    setModalOpen(false)
    return true
  }
  return false
}, modalOpen)

usePreventBack(unsavedChanges)
```

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
  layoutFilename: '_layout.tsx',
})
```

Optional `output` overrides where the route module is written (default: `node_modules/.tamer-router/_generated_routes.tsx` under the app root).

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
| `<BackHandlerRoot />` | Wraps children with back-handler context only (use with `useBackHandler` / `usePreventBack` when **not** using `FileRouter`). Do **not** nest with `FileRouter` — use one root. |

### Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTamerRouter()` | `{ push, replace, back, pop, tabReplace, canGoBack }` | Stack-aware navigation |
| `useTamerNavigate()` | `{ push, replace, back, tabReplace }` | Navigation actions |
| `useScreenOptions(options)` | `void` | Set per-screen header/title options |
| `useBackHandler(handler, enabled?)` | `void` | Intercept system back; return `true` to consume |
| `usePreventBack(enabled?)` | `void` | Consume all back events while `enabled` |

### Plugin

| API | Description |
|-----|-------------|
| `tamerRouterPlugin(options)` | Rsbuild plugin. Options: `root`, `output?` (default: `node_modules/.tamer-router/_generated_routes.tsx`), `srcAlias?`, `layoutFilename?` |

### Other exports

| Export | Description |
|--------|-------------|
| `Outlet`, `Slot` | Re-exported from react-router; render child route content |
| `useLocation`, `useNavigate`, `useOutlet`, `useParams` | Re-exported from react-router (import from `@tamer4lynx/tamer-router` so you do not need a direct `react-router` dependency for these hooks) |
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
