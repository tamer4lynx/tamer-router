import React from 'react'
import {
  Outlet as TanStackOutletComponent,
  useParams as useTanStackParams,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'

const TanStackOutlet = TanStackOutletComponent as unknown as React.ComponentType<Record<string, never>>

export interface NavigatePathObject {
  pathname?: string
  search?: string
  hash?: string
}

export interface NavigateCompat {
  (delta: number): void
  (to: string, options?: { replace?: boolean }): void
  (to: NavigatePathObject, options?: { replace?: boolean }): void
}

function toHref(target: NavigatePathObject): string {
  const pathname = target.pathname ?? '/'
  const search = target.search ?? ''
  const hash = target.hash ?? ''
  return `${pathname}${search}${hash}`
}

export function Outlet(): JSX.Element {
  return React.createElement(TanStackOutlet)
}

export const Slot = Outlet

export function useLocation() {
  return useRouterState({
    select: (state) => state.location,
  })
}

export function useParams(): Record<string, string | undefined> {
  return useTanStackParams({ strict: false }) as Record<string, string | undefined>
}

export function useOutlet(): React.ReactElement {
  return React.createElement(TanStackOutlet)
}

export function useNavigate(): NavigateCompat {
  const router = useRouter()

  return React.useCallback((to: number | string | NavigatePathObject, options?: { replace?: boolean }) => {
    const history = router.history as {
      back: () => void
      forward?: () => void
      go?: (delta: number) => void
      push: (href: string) => void
      replace: (href: string) => void
    }

    if (typeof to === 'number') {
      if (typeof history.go === 'function') {
        history.go(to)
        return
      }
      if (to < 0) history.back()
      else if (to > 0) history.forward?.()
      return
    }

    if (typeof to === 'string') {
      if (options?.replace) history.replace(to)
      else history.push(to)
      return
    }

    const href = toHref(to as NavigatePathObject)
    if (options?.replace) history.replace(href)
    else history.push(href)
  }, [router])
}
