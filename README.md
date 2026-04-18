# tamer-router

Native-first file-based routing for Lynx. The generated route manifest drives one base route in the Lynx tree plus a flat list of **`nav-screen`** overlays, while **Stack**, **Tab**, and **Rail** provide the Expo Router-style authoring surface in `_layout.tsx`.

- Rsbuild plugin: scans a folder and generates a route tree
- Conventions: `index` → index route, `[param]` → dynamic segment, `_layout.tsx` → layout wrapper
- `FileRouter` keeps one base route mounted and pushes later routes as sibling native overlays
- Route paths come from file placement only
- `Stack.Screen` declaration order determines the default screen for a layout base path
- `Tab` / `Rail` branch base paths resolve to their explicit `index` file or the first declared screen
- direct `Tab` / `Rail` child switches reuse the same branch overlay instead of pushing a new `nav-screen`
- `useTamerRouter()` / `useTamerNavigate()` / `useNavigate()` return a **callable** `navigate` (React Router–style: `navigate(-1)`, `navigate('/path')`, `navigate('/path', { replace: true })`) plus `push`, `replace`, `back`, `pop`, and `canGoBack`
- **`Navigate`** component for declarative redirects (`replace` or `push` on mount)
- generated routes augment `Href`, `RoutePath`, and `RouteParams` so navigation APIs autocomplete like Expo Router
- System back: native **`TamerRouterNativeModule`** feeds the shared back-handler registry through either **`tamer-router:back`**, **`backButtonPressed`**, or the Android callback registration path. **`FileRouter`** runs **`useBackHandler` / `usePreventBack`** callbacks first (newest registration first); then one **`didHandleBack(consumed)`** acknowledges the native request when supported. If nothing consumes, the router applies default back (pop when **`canGoBack()`**, else host exit policy via **`exitOnRootHardwareBack`**).

## Install

```bash
npm install @tamer4lynx/tamer-router @tamer4lynx/tamer-navigation @tamer4lynx/tamer-app-shell
```

Stack layouts require **tamer-app-shell**. `tamer-router` auto-imports **`@tamer4lynx/tamer-navigation`** at runtime, so you no longer need a separate manual import in your app entry.

### Intercepting back (`useBackHandler` / `usePreventBack`)

The API is modeled after React Native [**`BackHandler`**](https://reactnative.dev/docs/backhandler): subscriptions run **newest first**; return **`true`** to consume the press; return **`false`** to let the next handler or the default action run. Unmounting a hook removes that subscription (like `subscription.remove()`).

| React Native `BackHandler` | Tamer / Lynx |
|----------------------------|----------------|
| `addEventListener('hardwareBackPress', handler)` | `useBackHandler(handler)` under **`BackHandlerRoot`** or **`FileRouter`** (needs **`TamerRouterNativeModule`** wiring) |
| Last registered runs first | Same: internal registry invokes **newest first** |
| Return `true` → consumed | `didHandleBack(true)`; no router default |
| Return `false` → bubble | Try older handler, then **`onUnhandled`** (FileRouter: pop or root policy) |
| Default when nothing consumes | `onUnhandled` returns `false` → **`didHandleBack(false)`** → host may finish the Activity |
| `subscription.remove()` | Effect cleanup on `useBackHandler` |

`BackHandler.exitApp()` is not replicated; exiting the app is host-defined (typically after **`didHandleBack(false)`**).

You **do not** need **Stack**, **Tabs**, or file-based routing to use these hooks.

- With file-based routing: use **`FileRouter`**. Unhandled back pops when **`canGoBack()`**; at root, **`exitOnRootHardwareBack`** controls whether the host may finish the activity.
- Without `FileRouter`: wrap with **`BackHandlerRoot`**. Pass **`onUnhandled?: () => boolean`** — return **`false`** to let the host handle back (**`didHandleBack(false)`** is called once by the listener). Omit **`onUnhandled`** for the same default.

Without **`FileRouter`** or **`BackHandlerRoot`**, the hooks are inert; if you wire native back manually, forward it into your own listener and call **`didHandleBack`** yourself when your host expects an acknowledgement.

```tsx
import { BackHandlerRoot, useBackHandler, usePreventBack } from '@tamer4lynx/tamer-router'

// Minimal app without FileRouter — still needs tamer-router native (lynx.ext.json)
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

**Option B: Stack layout**

Use `Stack` in `_layout.tsx`. File names define the route paths, and `Stack.Screen` only controls screen order and screen options:

```tsx
// src/pages/_layout.tsx
import { Stack } from '@tamer4lynx/tamer-router'
import { useSystemUI } from '@tamer4lynx/tamer-system-ui'

export default function Layout() {
  const { setStatusBar, setNavigationBar } = useSystemUI()

  useEffect(() => {
    setStatusBar({ color: '#fff', style: 'light' })
    setNavigationBar({ color: '#fff', style: 'light' })
  }, [])

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#555' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
    </Stack>
  )
}
```

`Tab` and `Rail` render one branch-owned screen. Direct child switches update the active child in place, preserve visited child state, and do not create intra-tab back history.

### 3. File structure example

```
src/
  pages/
    _layout.tsx      # layout for / and children (Stack)
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
  const navigate = useTamerRouter()
  const goAbout = useCallback(() => {
    'background only'
    navigate('/about')
  }, [navigate])
  return (
    <view>
      <text bindtap={goAbout}>Go to About</text>
    </view>
  )
}
```

`useTamerRouter()` / `useTamerNavigate()` / `useNavigate()` return a **function** you can call like React Router’s `navigate`:

- `navigate(-1)` — go back one step (same as `back()`)
- `navigate(-2)` — schedule additional backs after overlay close delays (stacked history)
- `navigate('/about')` — `push`
- `navigate('/about', { replace: true })` — `replace`

The same value still has `push`, `replace`, `back`, `pop`, and `canGoBack`:

```tsx
import { useTamerNavigate } from '@tamer4lynx/tamer-router'

const { push, replace, back, navigate } = useTamerNavigate()
```

Declarative redirect (must be under `FileRouter`):

```tsx
import { Navigate } from '@tamer4lynx/tamer-router'

<Navigate to="/login" replace />
```

### Typed routes

Importing `@tamer4lynx/tamer-router/generated-routes` now augments the package types for your app. That means `Link`, `useTamerRouter()`, `useTamerNavigate()`, `Href`, and `RouteParams` all understand the generated routes automatically.

```ts
import '@tamer4lynx/tamer-router/generated-routes'
import { type Href, type RouteParams, useTamerRouter } from '@tamer4lynx/tamer-router'

const route: Href = { pathname: '/user/[id]', params: { id: '42' } }
type UserParams = RouteParams<'/user/[id]'>

const router = useTamerRouter()
router.push('/user/42')
router.replace({ pathname: '/user/[id]', params: { id: 42 } })
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
| `<Stack children screenOptions? titleForPath? />` | Stack layout with AppBar and stack-presented child routes |
| `<Stack.Screen name options? />` | Screen declarator for Stack; `name` must match a sibling file name |
| `<Tab children screenOptions? titleForPath? />` | Tab layout with AppBar plus `TabBar`; direct child switches reuse one branch overlay |
| `<Tab.Screen name options? />` | Screen declarator for Tab; `name` must match a sibling file name |
| `<Rail children screenOptions? titleForPath? />` | Rail layout with AppBar plus `NavigationRail`; direct child switches reuse one branch overlay |
| `<Rail.Screen name options? />` | Screen declarator for Rail; `name` must match a sibling file name |
| `<Tabs />` | Compatibility alias for `<Tab />` |
| `<FileRouter routes linking? basename? transitionConfig? />` | Renders the native-first file router from the generated route manifest |
| `<BackHandlerRoot onUnhandled? />` | Wraps children with back-handler context only (use with `useBackHandler` / `usePreventBack` when **not** using `FileRouter`). **`onUnhandled`** returns whether the event was consumed (`boolean`). Do **not** nest with `FileRouter` — use one root. |
| `<Navigate to replace? />` | On mount, `replace(to)` (default) or `push(to)`; for auth-style redirects |

### Hooks

| Hook | Returns | Description |
|------|---------|-------------|
| `useTamerRouter()` | **NavigateFunction** (callable `navigate` + `push`, `replace`, `back`, `pop`, `canGoBack`) | Stack-aware navigation |
| `useTamerNavigate()` | same | Alias of `useTamerRouter` |
| `useNavigate()` | same | Alias of `useTamerRouter` |
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
| `Outlet`, `Slot` | Render child route content from the internal router context |
| `useLocation`, `useNavigate`, `useOutlet`, `useParams` | Internal router hooks; no direct `react-router` dependency required |
| `./layouts` | Subpath: `Stack`, `Tab`, `Rail`, `Tabs`, `useScreenOptions` |

## Tab and Rail Branch Behavior

- `/tabs` resolves to the branch default target:
  - explicit `index.tsx` when present
  - otherwise the first declared `Tab.Screen` / `Rail.Screen`
- A `Tab` or `Rail` layout owns exactly one stack entry / `nav-screen` per branch overlay.
- Direct child navigation like `push('/tabs/insets')` while already inside `/tabs/*` updates the child inside the same overlay.
- Reusing a lower `/tabs/*` or `/rail/*` branch lifts that existing branch overlay to the top and switches the active child.
- Child switches preserve visited child-local state and do not create intra-tab back history.

## Platform: lynx.ext.json

This package uses **lynx.ext.json** (RFC standard). Linking runs automatically on install when your project has a postinstall script; otherwise run `t4l link`.

### Android hardware back

The host Activity must forward **`onBackPressed`** into the generated lifecycle so **`TamerRouterNativeModule.requestBack`** runs (for example **`GeneratedActivityLifecycle.onBackPressed`** in the Tamer4Lynx template). The native module then forwards that into the shared JS back-handler registry; **`FileRouter`** / **`BackHandlerRoot`** handle the JS side for you.
