/**
 * Records what the legacy destination senders (webhooks, Discord alert
 * channels, the staff webhook) address during one call, for the destination
 * shadow comparison (destinations.ts). The legacy transports report into the
 * active trace, if there is one; outside a trace they do nothing.
 *
 * A destination is recorded when the legacy code addresses it, before its
 * own skip rules (test accounts, the webhook URL allowlist), because
 * notify()'s plan addresses the same destinations and applies those rules in
 * its adapters.
 *
 * Separate from trace.ts (the user channels' shadow trace), which goes with
 * the legacy user senders (≥ 2026-11-10).
 */
import { AsyncLocalStorage } from "node:async_hooks"

export interface LegacyDestinationSend {
  /** "webhook:<webhook_id>", "webhook:staff" or "discord_channel:<channel id>". */
  ref: string
  body: unknown
}

const storage = new AsyncLocalStorage<LegacyDestinationSend[]>()

export function recordLegacyDestination(ref: string, body: unknown): void {
  storage.getStore()?.push({ ref, body })
}

export async function traceLegacyDestinations<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; sends: LegacyDestinationSend[] }> {
  const sends: LegacyDestinationSend[] = []
  const result = await storage.run(sends, fn)
  return { result, sends }
}

/** Run without any active destination trace (the shadow planner, the live path). */
export function outsideDestinationTrace<T>(fn: () => Promise<T>): Promise<T> {
  return storage.exit(fn)
}
