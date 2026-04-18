import type { ComponentType, ReactNode } from '@lynx-js/react'

export type PrimitiveRouteParam = string | number | boolean | null | undefined

export interface HrefObject<Path extends string = string> {
  pathname: Path
  params?: Record<string, PrimitiveRouteParam>
}

export interface GeneratedRouteTypes {
  paths: string
  href: string | HrefObject<string>
  paramsByPath: Record<string, Record<string, PrimitiveRouteParam>>
}

export type RoutePath = GeneratedRouteTypes['paths']
export type Href = GeneratedRouteTypes['href']
export type RouteParams<Path extends string = RoutePath> =
  Path extends keyof GeneratedRouteTypes['paramsByPath']
    ? GeneratedRouteTypes['paramsByPath'][Path]
    : Record<string, PrimitiveRouteParam>

export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue }

export type ScreenOptions = Record<string, SerializableValue>

export type LayoutKind = 'slot' | 'stack' | 'tab' | 'rail'

export interface GeneratedScreenDeclaration {
  name: string
  path?: string
  options?: ScreenOptions
}

export interface GeneratedLayoutChild {
  name: string
  kind: 'page' | 'branch'
  segmentPath: string
  targetPath: string
  options?: ScreenOptions
}

export interface GeneratedLayoutDefinition {
  id: string
  basePath: string
  kind: LayoutKind
  component: ComponentType<any>
  screens: GeneratedScreenDeclaration[]
  children: GeneratedLayoutChild[]
}

export interface GeneratedRouteDefinition {
  id: string
  routePath: string
  component: ComponentType<any>
  layoutIds: string[]
  childNameByLayoutId: Record<string, string>
  matcher: RegExp
  paramNames: string[]
  score: number
}

export interface GeneratedRoutesManifest {
  layouts: Record<string, GeneratedLayoutDefinition>
  routes: GeneratedRouteDefinition[]
  initialPath: string
  defaultPathByBasePath: Record<string, string>
}

export type { ReactNode }

export interface TransitionOptions {
  mode?: 'stack' | 'scroll'
  direction?: 'left' | 'right'
  tab?: boolean
  layoutInstanceKey?: string
  /** When using callable `navigate(href, options)`, set `replace: true` to call `replace` instead of `push`. */
  replace?: boolean
}

export interface TransitionConfig {
  enabled?: boolean
  direction?: 'left' | 'right'
  mode?: 'stack' | 'scroll'
}

export interface LinkingConfig {
  prefixes?: string[]
  config?: Record<string, unknown>
}
