/**
 * Migration 20261027010000_orders_pending_status_to_not_started against the
 * FULL schema (src/test-utils/full-schema.ts, which also applies it to an
 * empty orders table): 'pending' orders become 'not-started', in batches,
 * other order statuses and other tables' 'pending' are left alone, and a
 * second run changes nothing.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"
import {
  normalizePendingOrders,
  up,
} from "../../../../../migrations/20261027010000_orders_pending_status_to_not_started.js"

const DB = "pgtest_orders_pending_status"
const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const BUYER = uuid("b", 1)
const PENDING = [1, 2, 3, 4, 5].map((n) => uuid("a", n))
const IN_PROGRESS = uuid("a", 6)
const CANCELLED = uuid("a", 7)
const SESSION = uuid("d", 1)

let db: Knex

describe.skipIf(!PG_TEST_URL)("orders 'pending' status migration", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 2 } })
    await db("accounts").insert({ user_id: BUYER, username: "pendingmig_buyer", display_name: "Buyer" })
    const order = (order_id: string, status: string) => ({
      order_id,
      status,
      kind: "requisition",
      cost: 100,
      title: "t",
      description: "",
      customer_id: BUYER,
    })
    await db("orders").insert([
      ...PENDING.map((id) => order(id, "pending")),
      order(IN_PROGRESS, "in-progress"),
      order(CANCELLED, "cancelled"),
    ])
    // 'pending' is a real offer session status; the migration must not touch it.
    await db("offer_sessions").insert({ id: SESSION, customer_id: BUYER, status: "pending" })
  }, 180_000)

  afterAll(async () => {
    await db?.destroy()
    await dropTestDatabase(DB)
  })

  it("moves every pending order to not-started, batch by batch", async () => {
    expect(await normalizePendingOrders(db, 2)).toBe(5)

    const rows = await db("orders").whereIn("order_id", [...PENDING, IN_PROGRESS, CANCELLED]).select("order_id", "status")
    const status = Object.fromEntries(rows.map((r) => [r.order_id, r.status]))
    for (const id of PENDING) expect(status[id]).toBe("not-started")
    expect(status[IN_PROGRESS]).toBe("in-progress")
    expect(status[CANCELLED]).toBe("cancelled")
    expect(await db("orders").where({ status: "pending" }).count("* as n").first()).toEqual({ n: "0" })

    // The status-history trigger logs the change, once per order.
    const log = await db("order_status_update").whereIn("order_id", PENDING).select("new_status")
    expect(log).toHaveLength(5)
    expect(log.every((l) => l.new_status === "not-started")).toBe(true)

    expect(await db("offer_sessions").where({ id: SESSION }).first()).toMatchObject({ status: "pending" })
  })

  it("is idempotent", async () => {
    await up(db)
    expect(await normalizePendingOrders(db)).toBe(0)
    expect(await db("order_status_update").whereIn("order_id", PENDING).count("* as n").first()).toEqual({ n: "5" })
  })
})
