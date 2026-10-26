import type { Knex } from "knex"

/**
 * Requisition orders get the shop_id of their offer session.
 *
 * POST /api/v2/requisitions stored the supplier's shop only on the offer
 * session, so orders.shop_id stayed null and the seller's v2 order list
 * (which finds a shop's orders by orders.shop_id) missed those orders. The
 * controller now sets it at creation; this fills in the existing rows.
 *
 * Rows only: no ALTER, no index. Only kind = 'requisition' orders with a null
 * shop_id whose session has a shop are touched. Runs outside a single
 * migration transaction so each batch commits on its own and holds its row
 * locks briefly, with lock_timeout 5s per batch. Idempotent: a second run
 * finds no rows.
 */
export const config = { transaction: false }

export const REQUISITION_SHOP_BATCH_SIZE = 1000

/** Backfills orders.shop_id, `batchSize` orders per transaction. Returns the count. */
export async function backfillRequisitionOrderShops(
  knex: Knex,
  batchSize: number = REQUISITION_SHOP_BATCH_SIZE,
): Promise<number> {
  let total = 0
  for (;;) {
    const updated = await knex.transaction(async (trx) => {
      await trx.raw("SET LOCAL lock_timeout = '5s'")
      const result = await trx.raw(
        `UPDATE orders o SET shop_id = os.shop_id
           FROM offer_sessions os
          WHERE os.id = o.offer_session_id
            AND os.shop_id IS NOT NULL
            AND o.kind = 'requisition'
            AND o.shop_id IS NULL
            AND o.order_id IN (
              SELECT o2.order_id
                FROM orders o2
                JOIN offer_sessions os2 ON os2.id = o2.offer_session_id
               WHERE o2.kind = 'requisition'
                 AND o2.shop_id IS NULL
                 AND os2.shop_id IS NOT NULL
               LIMIT ?
            )`,
        [batchSize],
      )
      return result.rowCount as number
    })
    total += updated
    if (updated === 0) return total
  }
}

export async function up(knex: Knex): Promise<void> {
  await backfillRequisitionOrderShops(knex)
}

/** Data fix only: nothing to undo (the old null shop_id was the bug). */
export async function down(): Promise<void> {}
