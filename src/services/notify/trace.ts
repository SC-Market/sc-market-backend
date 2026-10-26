/**
 * Records what the legacy notification code delivers during one call, for
 * shadow-mode parity checks (shadow.ts). The legacy write points (in-app
 * inserts, the push preference decision, email enqueueing) report into the
 * active trace, if there is one; outside a trace they do nothing.
 */
import { AsyncLocalStorage } from "node:async_hooks"

export interface LegacyTrace {
  /** notification_object_id -> action_type_id, for objects written in this trace. */
  objects: Map<string, number>
  inApp: { userId: string; objectId: string }[]
  push: { userId: string; action: string | null; contractorId: string | null; enabled: boolean }[]
  email: { userId: string; action: string; contractorId: string | null }[]
}

const storage = new AsyncLocalStorage<LegacyTrace>()

export function currentTrace(): LegacyTrace | undefined {
  return storage.getStore()
}

export async function traceLegacy<T>(fn: () => Promise<T>): Promise<{ result: T; trace: LegacyTrace }> {
  const trace: LegacyTrace = { objects: new Map(), inApp: [], push: [], email: [] }
  const result = await storage.run(trace, fn)
  return { result, trace }
}

/** Run without any active trace (the shadow planner's own queries). */
export function outsideTrace<T>(fn: () => Promise<T>): Promise<T> {
  return storage.exit(fn)
}
