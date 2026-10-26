import { Knex } from "knex"

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
 * have them; the same names make this a no-op where it does.
 * contractor_members had no index leading with user_id (its unique index is
 * (contractor_id, user_id)), so "orgs this user belongs to" scanned the table.
 * listings.shop_id, shops.owner_* and order_market_items_v2.order_id are
 * already indexed by their migrations.
 *
 * Built with CREATE INDEX CONCURRENTLY so writes to these hot tables are never
 * blocked, which needs `config.transaction = false` (it can't run in a
 * transaction block). All statements run on one pinned connection because
 * they change session settings:
 * - statement_timeout 0: the build itself may take longer than the 60s
 *   migration default.
 * - lock_timeout 2min instead of 5s: the SHARE UPDATE EXCLUSIVE lock this
 *   waits for doesn't conflict with reads or writes, so waiting longer never
 *   queues the site's queries; it only waits out older transactions (a
 *   background matview refresh can run for minutes).
 * A build that fails leaves an INVALID index behind; the next run drops and
 * rebuilds it.
 */
export const config = { transaction: false }

const INDEXES: Array<{ name: string; table: string; columns: string }> = [
  { name: "idx_market_orders_order_id", table: "market_orders", columns: "(order_id)" },
  { name: "idx_market_orders_listing_id", table: "market_orders", columns: "(listing_id)" },
  { name: "idx_orders_customer_id", table: "orders", columns: "(customer_id)" },
  { name: "idx_contractor_members_user_id", table: "contractor_members", columns: "(user_id)" },
]

async function onPinnedConnection(
  knex: Knex,
  fn: (run: (sql: string, bindings?: readonly Knex.RawBinding[]) => Promise<any>) => Promise<void>,
): Promise<void> {
  const conn = await knex.client.acquireConnection()
  const run = (sql: string, bindings: readonly Knex.RawBinding[] = []) =>
    knex.raw(sql, bindings).connection(conn)
  // Session settings this migration overrides, restored before the
  // connection goes back to the pool.
  const saved = await run(
    "SELECT current_setting('statement_timeout') AS st, current_setting('lock_timeout') AS lt",
  )
  const { st, lt } = saved.rows[0]
  try {
    await run("SET statement_timeout = 0")
    await run("SET lock_timeout = '2min'")
    await fn(run)
  } finally {
    await run("SELECT set_config('statement_timeout', ?, false), set_config('lock_timeout', ?, false)", [st, lt])
    await knex.client.releaseConnection(conn)
  }
}

export async function up(knex: Knex): Promise<void> {
  await onPinnedConnection(knex, async (run) => {
    for (const { name, table, columns } of INDEXES) {
      const invalid = await run(
        `SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = ? AND n.nspname = 'public' AND NOT i.indisvalid`,
        [name],
      )
      if (invalid.rows.length > 0) {
        await run(`DROP INDEX CONCURRENTLY IF EXISTS public.${name}`)
      }
      await run(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON public.${table} ${columns}`)
    }
  })
}

export async function down(knex: Knex): Promise<void> {
  // Only the index this migration introduced; the others predate it.
  await onPinnedConnection(knex, async (run) => {
    await run("DROP INDEX CONCURRENTLY IF EXISTS public.idx_contractor_members_user_id")
  })
}
