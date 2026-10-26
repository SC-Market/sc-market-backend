/**
 * POST /api/v2/requisitions against the FULL schema, built from empty by the
 * migrations (src/test-utils/full-schema.ts).
 *
 * Requisition orders were written with status "pending", which is not an
 * order status (orders use not-started | in-progress | fulfilled | cancelled),
 * so they matched no status filter. They now start as not-started like every
 * other order, and GET /requisitions filters by the statuses orders store.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"

process.env.TZ = "UTC"

const DB = "pgtest_v2_requisitions"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: (cb: (trx: Knex.Transaction) => Promise<unknown>) => state.db!.transaction(cb),
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`) },
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { RequisitionsV2Controller } = await import("./RequisitionsV2Controller.js")

const uuid = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const BUYER = uuid("b", 1)
const SUPPLIER = uuid("b", 2)
const SHOP = uuid("c", 1)
const GAME_ITEM = uuid("8", 1)

const asUser = (user_id: string, username: string) =>
  ({ user: { user_id, username, role: "user", rsi_confirmed: true, banned: false } }) as never

describe.skipIf(!PG_TEST_URL)("Requisition orders on the full schema", () => {
  let orderId: string

  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    const db = state.db
    await db("accounts").insert([
      // The legacy SQL seeds a sample account; keep these names unique.
      { user_id: BUYER, username: "requisitions_buyer", display_name: "Buyer" },
      { user_id: SUPPLIER, username: "requisitions_supplier", display_name: "Supplier" },
    ])
    await db("shops").insert({ shop_id: SHOP, slug: "requisitions-shop", name: "Supplier Shop", owner_user_id: SUPPLIER })
    await db("game_items").insert({ id: GAME_ITEM, name: "Requisitions Test Ore", type: "Other" })
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("creates the order as not-started", async () => {
    const res = await new RequisitionsV2Controller().createRequisition(
      {
        target_supplier_id: SUPPLIER,
        title: "Need ore",
        items: [{ game_item_id: GAME_ITEM, quantity: 5, price_per_unit: 200 }],
      },
      asUser(BUYER, "requisitions_buyer"),
    )
    orderId = res.order_id
    expect(res.status).toBe("not-started")

    const order = await state.db!("orders").where({ order_id: orderId }).first()
    expect(order).toMatchObject({
      kind: "requisition",
      status: "not-started",
      cost: "1000",
      customer_id: BUYER,
      assigned_id: SUPPLIER,
      offer_session_id: res.offer_session_id,
      // The supplier's shop, so the seller's v2 order list finds it.
      shop_id: SHOP,
    })
  })

  it("lists and returns it by the order status it stores", async () => {
    const controller = new RequisitionsV2Controller()
    const supplier = asUser(SUPPLIER, "requisitions_supplier")

    const notStarted = await controller.getRequisitions(supplier, "supplier", "not-started")
    expect(notStarted.requisitions.map((r) => r.order_id)).toEqual([orderId])
    expect(notStarted.requisitions[0].status).toBe("not-started")

    const fulfilled = await controller.getRequisitions(supplier, "supplier", "fulfilled")
    expect(fulfilled.total).toBe(0)

    const detail = await controller.getRequisition(orderId, asUser(BUYER, "requisitions_buyer"))
    expect(detail.status).toBe("not-started")
  })
})
