import type { ComponentType, ReactNode } from '@lynx-js/react'

type GeneratedRoutes = {
  Routes?: ComponentType<{ children?: ReactNode }> | (() => ReactNode)
  knownPaths?: string[]
  /** Initial MemoryRouter path for coordinator mode (no initData.route). */
  coordinatorInitialPath?: string
}

let REGISTRY: GeneratedRoutes = {}

/** Generated module calls this at top-level so `<FileRouter />` resolves zero-arg. */
export function setTamerGeneratedRoutes(g: GeneratedRoutes): void {
  REGISTRY = { ...REGISTRY, ...g }
}

export function getTamerGeneratedRoutes(): GeneratedRoutes {
  return REGISTRY
}
