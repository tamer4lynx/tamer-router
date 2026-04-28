import { useMemo } from '@lynx-js/react'
import { useLocation, useParams } from 'react-router'
import { getOutermostStackFromPath } from './tamer-stacks.js'

export function useLocalSearchParams(): Record<string, string> {
  const p = useParams() as Record<string, string | undefined>
  return useMemo(() => {
    const o: Record<string, string> = {}
    for (const [k, v] of Object.entries(p)) {
      if (v != null) o[k] = String(v)
    }
    return o
  }, [p])
}

export function useSegments(): string[] {
  const path = useLocation().pathname
  return useMemo(() => path.split('/').filter(Boolean), [path])
}

export function getOutermostStackId(): string | null {
  if (typeof globalThis === 'undefined') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getOutermostStackFromPath((globalThis as any).lynx?.__initData?.route ?? '/')
  } catch {
    return null
  }
}
