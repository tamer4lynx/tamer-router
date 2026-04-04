import React from 'react'
import { useMatchRoute, useRouter, type AnyRoute, type MatchRouteOptions, type RegisteredRouter, type RoutePaths } from '@tanstack/react-router'
import type { ViewProps } from '@lynx-js/types'
import { useTamerNavigate, type TamerToOptions, type TransitionOptions } from './FileRouter.js'

interface LinkActiveOptions extends Omit<MatchRouteOptions, 'fuzzy'> {
  exact?: boolean
}

export interface LinkRenderState {
  href: string
  isActive: boolean
}

export type LinkProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = Omit<ViewProps, 'children' | 'bindtap'> & TamerToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  children?: React.ReactNode | ((state: LinkRenderState) => React.ReactNode)
  replace?: boolean
  disabled?: boolean
  onTap?: () => void
  transition?: TransitionOptions
  activeOptions?: LinkActiveOptions
}

export interface LinkHrefFn {
  <TRouteTree extends AnyRoute = RegisteredRouter['routeTree']>(to: RoutePaths<TRouteTree>): string
  <
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TFrom extends RoutePaths<TRouteTree> | string = '/',
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
    TMaskTo extends string = '',
  >(to: TamerToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>): string
  (to: string): string
}

function useResolvedHref(): LinkHrefFn {
  const router = useRouter()

  return React.useMemo<LinkHrefFn>(() => (
    (to: string | Record<string, unknown>) => {
      if (typeof to === 'string') return to
      return router.buildLocation(to as never).href
    }
  ) as LinkHrefFn, [router])
}

export function useLinkHref(): LinkHrefFn {
  return useResolvedHref()
}

export function Link<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>({
  children,
  replace = false,
  disabled = false,
  onTap,
  transition,
  activeOptions,
  to,
  from,
  params,
  search,
  hash,
  state,
  mask,
  ...rest
}: LinkProps<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>): JSX.Element {
  const hrefFor = useResolvedHref()
  const matchRoute = useMatchRoute()
  const navigate = useTamerNavigate()

  const routeOptions = React.useMemo(() => ({
    to,
    from,
    params,
    search,
    hash,
    state,
    mask,
  }), [to, from, params, search, hash, state, mask])

  const href = hrefFor(routeOptions)
  const isActive = (matchRoute as (options: Record<string, unknown>) => unknown)({
    ...routeOptions,
    caseSensitive: activeOptions?.caseSensitive,
    includeSearch: activeOptions?.includeSearch,
    pending: activeOptions?.pending,
    fuzzy: activeOptions?.exact === false,
  }) !== false

  const handleTap = React.useCallback(() => {
    'background only'
    if (disabled) return
    onTap?.()
    if (replace) navigate.replace(routeOptions, transition)
    else navigate.push(routeOptions, transition)
  }, [disabled, navigate, onTap, replace, routeOptions, transition])

  return React.createElement(
    'view' as unknown as React.ElementType,
    {
      ...(rest as Record<string, unknown>),
      bindtap: disabled ? undefined : handleTap,
    },
    typeof children === 'function' ? children({ href, isActive }) : children,
  )
}
