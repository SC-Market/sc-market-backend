import type { Knex } from "knex"

/**
 * Orders written with status 'pending' get 'not-started'.
 *
 * 'pending' is not an order status (orders use not-started, in-progress,
 * fulfilled, cancelled; the column defaults to 'not-started'). POST
 * /api/v2/requisitions wrote it until the requisition fix, so those orders
 * matched no status filter and no active/past bucket. 'pending' remains a
 * real status on other tables (offer_sessions, offers, deliveries, ...); only
 * orders is touched here.
 *
 * Rows only: no ALTER, no index. Runs outside a single migration transaction
 * so each batch commits on its own and holds its row locks briefly, with
 * lock_timeout 5s per batch. Idempotent: a second run finds no rows.
 *
 * The orders BEFORE UPDATE trigger log_status_change appends one row per
 * order to order_status_update (the status history log), as for any status
 * change.
 */
export const config = { transaction: false }

export const PENDING_ORDERS_BATCH_SIZE = 1000

/** Updates every 'pending' order, `batchSize` per transaction. Returns the count. */
export async function normalizePendingOrders(
  knex: Knex,
  batchSize: number = PENDING_ORDERS_BATCH_SIZE,
): Promise<number> {
  let total = 0
  for (;;) {
    const updated = await knex.transaction(async (trx) => {
      await trx.raw("SET LOCAL lock_timeout = '5s'")
      const result = await trx.raw(
        `UPDATE orders SET status = 'not-started'
          WHERE status = 'pending'
            AND order_id IN (SELECT order_id FROM orders WHERE status = 'pending' LIMIT ?)`,
        [batchSize],
      )
      return result.rowCount as number
    })
    total += updated
    if (updated === 0) return total
  }
}

export async function up(knex: Knex): Promise<void> {
  await normalizePendingOrders(knex)
}

/** Nothing to undo: 'pending' was never a valid order status. */
export async function down(): Promise<void> {}
