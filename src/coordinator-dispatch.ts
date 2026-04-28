import type { CoordinatorNavDispatchAction } from './types.js'

type DispatchPayload = { action?: string }

export function parseCoordinatorNavDispatchPayload(
  payload: DispatchPayload | undefined,
): CoordinatorNavDispatchAction | null {
  if (!payload?.action) return null
  try {
    return JSON.parse(payload.action) as CoordinatorNavDispatchAction
  } catch {
    return null
  }
}
