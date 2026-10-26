/**
 * notification_deliveries: idempotency and audit for notify().
 *
 * A delivery is claimed by inserting its idempotency key; only the caller
 * whose insert succeeded sends. The same event for the same entity,
 * recipient and channel therefore goes out once, even if the request that
 * raised it is retried.
 */
import { createHash } from "node:crypto"
import { getKnex } from "../../clients/database/knex-db.js"
import logger from "../../logger/logger.js"

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped" | "shadow"

export function idempotencyKey(parts: (string | null | undefined)[]): string {
  return createHash("sha256").update(parts.map((p) => p ?? "").join("\u0000")).digest("hex")
}

export interface DeliveryClaim {
  idempotencyKey: string
  eventKey: string
  channel: string
  userId: string | null
  contractorId: string | null
  entityId: string | null
  destinationRef?: string | null
  status?: DeliveryStatus
}

/** Claim deliveries; returns the keys this caller won (not delivered before). */
export async function claimDeliveries(claims: DeliveryClaim[]): Promise<Set<string>> {
  if (!claims.length) return new Set()
  const rows: { idempotency_key: string }[] = await getKnex()("notification_deliveries")
    .insert(
      claims.map((c) => ({
        idempotency_key: c.idempotencyKey,
        event_key: c.eventKey,
        channel: c.channel,
        user_id: c.userId,
        contractor_id: c.contractorId,
        entity_id: c.entityId,
        destination_ref: c.destinationRef ?? null,
        status: c.status ?? "pending",
      })),
    )
    .onConflict("idempotency_key")
    .ignore()
    .returning("idempotency_key")
  return new Set(rows.map((r) => r.idempotency_key))
}

export async function finishDelivery(
  key: string,
  status: Exclude<DeliveryStatus, "pending" | "shadow">,
  error?: string,
): Promise<void> {
  try {
    await getKnex()("notification_deliveries")
      .where({ idempotency_key: key })
      .update({
        status,
        attempts: getKnex().raw("attempts + 1"),
        last_error: error ? error.slice(0, 2000) : null,
        sent_at: status === "sent" ? getKnex().fn.now() : null,
      })
  } catch (err) {
    // Bookkeeping must never fail a delivery that already happened.
    logger.warn("Failed to record notification delivery", {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export const DELIVERY_RETENTION_DAYS = 90

/** Delete delivery rows past the retention window. */
export async function pruneDeliveries(): Promise<number> {
  return getKnex()("notification_deliveries")
    .where("created_at", "<", getKnex().raw(`NOW() - INTERVAL '${DELIVERY_RETENTION_DAYS} days'`))
    .delete()
}
