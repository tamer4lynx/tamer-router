# `@tamer4lynx/tamer-router`

> tamer-router has been substantially refactored. If you were one of the ~2–3 people already using Tamer: the API you're reading here is the current one. Welcome.

File-based routing for Lynx on top of React Router 6 + TamerNav. Covers stack navigation, tab navigation, hardware back handling, and cross-spoke state synchronization.

## Installation

```bash
npm install @tamer4lynx/tamer-router
```

## The two stack patterns

Native stacks can be driven two ways. Both are valid; pick the one that fits your app.

### A — `FileRouter` (file-based, recommended)

```tsx
import { FileRouter } from '@tamer4lynx/tamer-router'

export default function App() {
  return <FileRouter />
}
```

- Routes auto-generated from a `pages/` directory by the build plugin
- Handles coordinator/spoke LynxView wiring, back gestures, and state bridging internally
- `providerConnector` prop bridges React provider state across LynxView boundaries (see below)
- `Stack` / `Tabs` layouts declare navigation chrome per route segment

### B — Raw `TamerNav` (manual coordinator)

Use `TamerNav.push/pop/dispatch/update` from `@tamer4lynx/tamer-navigation` directly and build your own coordinator component. This package still provides the back handler and optional state sync utilities.

```tsx
import { TamerNav } from '@tamer4lynx/tamer-navigation'
import { BackHandlerProvider, useBackHandler } from '@tamer4lynx/tamer-router'

function MyCoordinator() {
  const [stack, setStack] = useState([])

  useBackHandler(() => {
    if (stack.length === 0) return false
    TamerNav.pop({ source: 'system-back' })
    return true
  })

  // push, listen to tamer-nav:dispatch / tamer-nav:popped ...
}

export default function App() {
  return (
    <BackHandlerProvider>
      <MyCoordinator />
    </BackHandlerProvider>
  )
}
```

See `packages/example/src/example_stack.tsx` for a complete manual coordinator reference.

---

## `providerConnector` — bridging state across spokes

Each spoke LynxView gets a **fresh JavaScript context** — module-level singletons (Zustand stores, Redux stores) are re-evaluated per spoke, and React Context set up on the coordinator does not survive into spokes. This is a constraint of the Lynx engine; see `@tamer4lynx/tamer-navigation` for full details.

`providerConnector` is the explicit bridge that fixes this. Pass an array of `TamerStateSync` objects to `FileRouter`:

```tsx
import { FileRouter, createZustandSync } from '@tamer4lynx/tamer-router'
import { myStore } from './store'

const mySync = createZustandSync('myStore', myStore)

export default function App() {
  return <FileRouter providerConnector={[mySync]} />
}
```

On every navigation push, `FileRouter` serializes all connected stores to a single JSON snapshot and passes it to the spoke via `TamerNav.push`. The spoke hydrates on mount and re-serializes on every mutation back through `TamerNav.update`. Coordinators receive mutations as `tamer-nav:dispatch` events.

> **Wrapping `FileRouter` in a provider alone is not enough.** State must go through `providerConnector` to cross the spoke boundary.

### `TamerStateSync` interface

```ts
type TamerStateSync = {
  key: string
  serialize: () => string
  hydrate: (json: string) => void
  subscribe: (listener: () => void) => () => void
  send?: (action: unknown) => void
}
```

Build one manually with `createTamerStateSync`:

```ts
import { createTamerStateSync } from '@tamer4lynx/tamer-router'

const mySync = createTamerStateSync('myKey', {
  getState: () => myStore.getState(),
  subscribe: (listener) => myStore.subscribe(listener),
  hydrate: (json) => myStore.setState(JSON.parse(json)),
  send: (action) => myStore.dispatch(action),  // optional
})
```

---

## Built-in connectors

Nine connectors ship out of the box, all exported from `@tamer4lynx/tamer-router`:

| Connector | Factory | Notes |
|-----------|---------|-------|
| Zustand | `createZustandSync(key, store)` | Works with vanilla and React Zustand |
| Redux | `createReduxSync(key, store, reducer)` | Injects `@@tamer/HYDRATE` action on hydrate |
| TanStack Query | `createTanstackQuerySync(key, queryClient, { dehydrate, hydrate })` | Dehydrates normalized query cache |
| Apollo | `createApolloSync(key, client)` | Normalized cache; subscribe is a no-op |
| SWR | `createSwrSync(key, cache)` | Use with `createTrackedSwrCache()` wrapper |
| Jotai | `createJotaiSync(key, store, atomMap)` | Per-atom serialization via atom map |
| i18next | `createI18nextSync(key, i18n)` | Syncs language code; calls `changeLanguage()` on hydrate |
| Theme | `createThemeSync(key, { getTheme, setTheme, subscribe })` | Generic key-value theme bridge |
| Recoil | `createRecoilSync(key, initial)` | Returns `{ connector, effect, getValue, subscribe, set }` |

---

## Back handler

`FileRouter` sets up `BackHandlerProvider` internally. In manual coordinator setups, wrap your root yourself:

```tsx
import { BackHandlerProvider, useBackHandler, usePreventBack } from '@tamer4lynx/tamer-router'

// In any component inside the provider:
useBackHandler(() => {
  // return true to consume, false to pass to the next handler
  return false
})

// Block back while a form is dirty:
usePreventBack(isDirty)
```

Handlers are LIFO — last registered wins. When no handler returns `true`, `FileRouter` calls `canGoBack() ? back() : TamerNav.pop()`. In manual setups, implement the fallback yourself.

---

## Layouts

```tsx
import { Stack, StackScreen, Tabs, Tab, TabScreen, Slot } from '@tamer4lynx/tamer-router'
```

`Stack` and `Tabs` declare navigation chrome for a route segment. `StackScreen` and `TabScreen` set per-route options (title, tab icon, etc.). `Slot` / `Outlet` renders the active child route.

---

## Navigation hooks

```tsx
import {
  useTamerRouter,       // { push, replace, back, canGoBack, navigate, coordinatorPush }
  useTamerNavigate,
  useLocation,          // re-exported from react-router
  useNavigate,
  useParams,
  useLocalSearchParams,
  useSegments,
  useScreenOptions,
  useTabScreenOptions,
} from '@tamer4lynx/tamer-router'
```

---

## `TamerStateSyncProvider` (standalone spoke setup)

When not using `FileRouter` but still wanting the state bridge in a spoke, mount the provider directly:

```tsx
import { TamerStateSyncProvider, createTamerStateSync } from '@tamer4lynx/tamer-router'

<TamerStateSyncProvider syncs={[mySync]}>
  {children}
</TamerStateSyncProvider>
```

---

## Build plugin

Add `tamerRouterPlugin()` to your Rsbuild config to enable file-based route generation:

```ts
import { tamerRouterPlugin } from '@tamer4lynx/tamer-router/tamer.config'

export default {
  plugins: [tamerRouterPlugin()],
}
```

The plugin scans your `pages/` directory, generates a route manifest, and wires up lazy imports automatically.
