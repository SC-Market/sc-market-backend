import type { Knex } from "knex"
import logger from "../logger/logger.js"

/**
 * Indexes behind GET /api/v2/orders (OrdersV2Controller.getOrders) and the
 * order detail/seller lookups:
 *
 *   orders.customer_id = $1
 *   OR EXISTS (market_orders JOIN listings ... WHERE market_orders.order_id =
 *              orders.order_id AND listings.shop_id IN (user's shops))
 *   ... shops.owner_contractor_id IN (contractor_members WHERE user_id = $1)
 *
 * idx_market_orders_order_id, idx_market_orders_listing_id and
 * idx_orders_customer_id were only ever created by the hand-applied legacy
 * file config/postgres/9-order-performance-indices.sql, so a database may not
 * have them; the same names make this a no-op where they exist.
 * contractor_members had no index leading with user_id (its unique index is
 * (contractor_id, user_id)).
 *
 * Built by a background task after the server is serving, NOT by a
 * migration: as migration 20261027000000 this stopped the a7c75ff image from
 * going live (CREATE INDEX CONCURRENTLY first waits for every older
 * transaction, which can outlast the deploy's health checks). Here it can
 * wait as long as it needs without holding up startup.
 */
export const ORDER_LOOKUP_INDEXES: ReadonlyArray<{ name: string; table: string; columns: string }> = [
  { name: "idx_market_orders_order_id", table: "market_orders", columns: "(order_id)" },
  { name: "idx_market_orders_listing_id", table: "market_orders", columns: "(listing_id)" },
  { name: "idx_orders_customer_id", table: "orders", columns: "(customer_id)" },
  { name: "idx_contractor_members_user_id", table: "contractor_members", columns: "(user_id)" },
]

/**
 * Session advisory lock key, so only one container builds at a time (old and
 * new containers overlap during a deploy). Arbitrary constant.
 */
export const ORDER_LOOKUP_INDEXES_LOCK_KEY = 726_100_027

export type EnsureIndexesResult =
  | { status: "locked" }
  | { status: "done"; created: string[]; rebuilt: string[]; failed: string[] }

/**
 * Create any missing index with CREATE INDEX CONCURRENTLY IF NOT EXISTS, and
 * drop + rebuild one a failed build left INVALID. Idempotent.
 *
 * `knex` must be a pool of its own (createDedicatedKnex) whose sessions allow
 * long statements and lock waits: everything runs on one pinned connection,
 * which also holds the advisory lock. Never throws.
 */
export async function ensureOrderLookupIndexes(knex: Knex): Promise<EnsureIndexesResult> {
  let conn: unknown
  try {
    conn = await knex.client.acquireConnection()
  } catch (error) {
    logger.error("Order lookup indexes: no database connection", { error })
    return { status: "done", created: [], rebuilt: [], failed: ORDER_LOOKUP_INDEXES.map((i) => i.name) }
  }
  const run = (sql: string, bindings: readonly Knex.RawBinding[] = []) =>
    knex.raw(sql, bindings).connection(conn)

  const created: string[] = []
  const rebuilt: string[] = []
  const failed: string[] = []
  let locked = false
  try {
    const lock = await run("SELECT pg_try_advisory_lock(?) AS ok", [ORDER_LOOKUP_INDEXES_LOCK_KEY])
    locked = lock.rows[0]?.ok === true
    if (!locked) {
      logger.info("Order lookup indexes: another container is building them")
      return { status: "locked" }
    }

    for (const { name, table, columns } of ORDER_LOOKUP_INDEXES) {
      try {
        const existing = await run(
          `SELECT i.indisvalid AS valid FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = ? AND n.nspname = 'public'`,
          [name],
        )
        const row = existing.rows[0]
        if (row?.valid === true) continue
        if (row) {
          await run(`DROP INDEX CONCURRENTLY IF EXISTS public.${name}`)
        }
        const started = Date.now()
        await run(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON public.${table} ${columns}`)
        ;(row ? rebuilt : created).push(name)
        logger.info("Order lookup indexes: built", { index: name, rebuilt: !!row, ms: Date.now() - started })
      } catch (error) {
        failed.push(name)
        logger.warn("Order lookup indexes: build failed, will retry on next start", {
          index: name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return { status: "done", created, rebuilt, failed }
  } catch (error) {
    logger.error("Order lookup indexes: task failed", { error })
    return { status: "done", created, rebuilt, failed: ORDER_LOOKUP_INDEXES.map((i) => i.name) }
  } finally {
    if (locked) {
      await run("SELECT pg_advisory_unlock(?)", [ORDER_LOOKUP_INDEXES_LOCK_KEY]).catch(() => undefined)
    }
    await knex.client.releaseConnection(conn).catch(() => undefined)
  }
}
