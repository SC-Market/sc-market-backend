/**
 * Migration 20261027020000_requisition_orders_shop_id against the FULL schema
 * (src/test-utils/full-schema.ts, which also applies it to an empty orders
 * table): requisition orders without a shop_id get their offer session's
 * shop, in batches; orders of other kinds, orders that already have a shop and
 * sessions without a shop are left alone; a second run changes nothing.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"
import {
  backfillRequisitionOrderShops,
  up,
} from "../../../../../migrations/20261027020000_requisition_orders_shop_id.js"

const DB = "pgtest_requisition_orders_shop_id"
const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const BUYER = uuid("b", 1)
const SUPPLIER = uuid("b", 2)
const SHOP = uuid("c", 1)
const OTHER_SHOP = uuid("c", 2)
const MISSING = [1, 2, 3].map((n) => uuid("a", n))
const ALREADY_SET = uuid("a", 4)
const NO_SESSION_SHOP = uuid("a", 5)
const OTHER_KIND = uuid("a", 6)

let db: Knex

describe.skipIf(!PG_TEST_URL)("requisition orders shop_id backfill", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 2 } })
    await db("accounts").insert([
      { user_id: BUYER, username: "reqshopmig_buyer", display_name: "Buyer" },
      { user_id: SUPPLIER, username: "reqshopmig_supplier", display_name: "Supplier" },
    ])
    await db("shops").insert([
      { shop_id: SHOP, slug: "reqshopmig-shop", name: "Supplier Shop", owner_user_id: SUPPLIER },
      { shop_id: OTHER_SHOP, slug: "reqshopmig-other", name: "Other Shop", owner_user_id: SUPPLIER },
    ])
    // One order per session (orders_session_unique); session n belongs to order n.
    const session = (n: number, shop_id: string | null) => ({
      id: uuid("d", n),
      customer_id: BUYER,
      assigned_id: SUPPLIER,
      shop_id,
      status: "active",
    })
    const order = (n: number, kind: string, shop_id: string | null) => ({
      order_id: uuid("a", n),
      kind,
      offer_session_id: uuid("d", n),
      shop_id,
      status: "not-started",
      cost: 100,
      title: "t",
      description: "",
      customer_id: BUYER,
      assigned_id: SUPPLIER,
    })
    await db("offer_sessions").insert([
      session(1, SHOP),
      session(2, SHOP),
      session(3, SHOP),
      session(4, SHOP),
      session(5, null),
      session(6, SHOP),
    ])
    await db("orders").insert([
      order(1, "requisition", null),
      order(2, "requisition", null),
      order(3, "requisition", null),
      order(4, "requisition", OTHER_SHOP),
      order(5, "requisition", null),
      order(6, "Delivery", null),
    ])
  }, 180_000)

  afterAll(async () => {
    await db?.destroy()
    await dropTestDatabase(DB)
  })

  it("gives requisition orders their session's shop, batch by batch", async () => {
    expect(await backfillRequisitionOrderShops(db, 2)).toBe(3)

    const rows = await db("orders")
      .whereIn("order_id", [...MISSING, ALREADY_SET, NO_SESSION_SHOP, OTHER_KIND])
      .select("order_id", "shop_id")
    const shop = Object.fromEntries(rows.map((r) => [r.order_id, r.shop_id]))
    for (const id of MISSING) expect(shop[id]).toBe(SHOP)
    expect(shop[ALREADY_SET]).toBe(OTHER_SHOP)
    expect(shop[NO_SESSION_SHOP]).toBeNull()
    expect(shop[OTHER_KIND]).toBeNull()
  })

  it("is idempotent", async () => {
    await up(db)
    expect(await backfillRequisitionOrderShops(db)).toBe(0)
  })
})
