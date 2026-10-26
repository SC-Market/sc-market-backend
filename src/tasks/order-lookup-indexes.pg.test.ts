/**
 * The order lookup index task against a real, throwaway Postgres.
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/tasks/order-lookup-indexes.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../test-utils/pg-test-db.js"

vi.mock("../logger/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { ensureOrderLookupIndexes, ORDER_LOOKUP_INDEXES, ORDER_LOOKUP_INDEXES_LOCK_KEY } = await import(
  "./order-lookup-indexes.js"
)

const DB = "pgtest_order_lookup_indexes"

describe.skipIf(!PG_TEST_URL)("ensureOrderLookupIndexes", () => {
  let db: Knex
  let other: Knex

  beforeAll(async () => {
    const connection = await createTestDatabase(DB)
    db = knexFactory({ client: "pg", connection, pool: { min: 0, max: 1 } })
    other = knexFactory({ client: "pg", connection, pool: { min: 0, max: 1 } })
    await db.raw(`
      CREATE TABLE orders (order_id uuid PRIMARY KEY, customer_id uuid);
      CREATE TABLE market_orders (order_id uuid, listing_id uuid);
      CREATE TABLE contractor_members (contractor_id uuid, user_id uuid);
      CREATE INDEX idx_orders_customer_id ON orders (customer_id);
    `)
  })

  afterAll(async () => {
    await db?.destroy()
    await other?.destroy()
    if (PG_TEST_URL) await dropTestDatabase(DB)
  })

  const validity = async () =>
    Object.fromEntries(
      (
        await db.raw(
          `SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
           WHERE c.relname = ANY(?)`,
          [ORDER_LOOKUP_INDEXES.map((i) => i.name)],
        )
      ).rows.map((r: { relname: string; indisvalid: boolean }) => [r.relname, r.indisvalid]),
    )

  it("builds the missing indexes and leaves existing ones alone", async () => {
    const result = await ensureOrderLookupIndexes(db)
    expect(result).toEqual({
      status: "done",
      created: ["idx_market_orders_order_id", "idx_market_orders_listing_id", "idx_contractor_members_user_id"],
      rebuilt: [],
      failed: [],
    })
    expect(await validity()).toEqual({
      idx_market_orders_order_id: true,
      idx_market_orders_listing_id: true,
      idx_orders_customer_id: true,
      idx_contractor_members_user_id: true,
    })
  })

  it("is a no-op on the next start", async () => {
    expect(await ensureOrderLookupIndexes(db)).toEqual({ status: "done", created: [], rebuilt: [], failed: [] })
  })

  it("rebuilds an INVALID index", async () => {
    await db.raw("UPDATE pg_index SET indisvalid = false WHERE indexrelid = 'idx_market_orders_order_id'::regclass")
    const result = await ensureOrderLookupIndexes(db)
    expect(result).toMatchObject({ rebuilt: ["idx_market_orders_order_id"], failed: [] })
    expect((await validity()).idx_market_orders_order_id).toBe(true)
  })

  it("skips while another container holds the lock", async () => {
    const conn = await other.client.acquireConnection()
    try {
      await other.raw("SELECT pg_advisory_lock(?)", [ORDER_LOOKUP_INDEXES_LOCK_KEY]).connection(conn)
      expect(await ensureOrderLookupIndexes(db)).toEqual({ status: "locked" })
    } finally {
      await other.raw("SELECT pg_advisory_unlock(?)", [ORDER_LOOKUP_INDEXES_LOCK_KEY]).connection(conn)
      await other.client.releaseConnection(conn)
    }
  })

  it("reports a failed build instead of throwing", async () => {
    await db.raw("DROP INDEX idx_contractor_members_user_id; ALTER TABLE contractor_members RENAME TO contractor_members_gone")
    const result = await ensureOrderLookupIndexes(db)
    expect(result).toMatchObject({ status: "done", failed: ["idx_contractor_members_user_id"] })
  })
})
