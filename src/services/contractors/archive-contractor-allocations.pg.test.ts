/**
 * Archiving an org cancels its open orders. A status update to "cancelled"
 * releases the order's V1 split-lot allocations (stock_allocations) back into
 * the listing's lots; archiving cancelled the orders without doing so, so the
 * allocated units stayed hidden in unlisted lots. Full schema, real SQL.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"

const DB = "pgtest_archive_contractor_allocations"
const state: { db: Knex | null } = { db: null }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../clients/database/transaction.js", () => ({
  withTransaction: (cb: (trx: Knex.Transaction) => Promise<unknown>) => state.db!.transaction(cb),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))
// setupTests.ts fakes these; the archive needs the real ones.
vi.mock("../../api/routes/v1/profiles/database.js", async (importActual) => importActual())
vi.mock("../../api/routes/v1/contractors/database.js", async (importActual) => importActual())
vi.mock("../../api/routes/v1/transactions/database.js", async (importActual) => importActual())
vi.mock("../audit-log/audit-log.service.js", () => ({ auditLogService: { record: vi.fn(async () => undefined) } }))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { archiveContractor } = await import("./archive-contractor.service.js")
const { AllocationService } = await import("../allocation/allocation.service.js")

const OWNER = "a0000000-0000-4000-8000-000000000001"
const BUYER = "a0000000-0000-4000-8000-000000000002"
const ORG = "c0000000-0000-4000-8000-000000000001"
const LISTING = "e0000000-0000-4000-8000-000000000001"
const LOT = "f0000000-0000-4000-8000-000000000001"
const ORDER = "d0000000-0000-4000-8000-000000000001"

describe.skipIf(!PG_TEST_URL)("archiving an org releases its orders' V1 allocations", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({ client: "pg", connection: conn, pool: { min: 0, max: 4 } })
    const db = state.db
    await db("accounts").insert([
      { user_id: OWNER, username: "archalloc_owner", display_name: "Owner" },
      { user_id: BUYER, username: "archalloc_buyer", display_name: "Buyer" },
    ])
    await db("contractors").insert({
      contractor_id: ORG,
      spectrum_id: "ARCHALLOC",
      kind: "Independent",
      size: 1,
      name: "Archive Alloc Org",
      // Seeded image_resources rows (the column defaults point at others).
      avatar: "5226c767-0599-419b-ae71-a7303c441db0",
      banner: "0008300c-fc6a-4e4e-9488-7d696f00e8b2",
    })
    await db("market_listings").insert({
      listing_id: LISTING,
      sale_type: "sale",
      price: 100,
      quantity_available: 10,
      status: "active",
      contractor_seller_id: ORG,
    })
    await db("stock_lots").insert({ lot_id: LOT, listing_id: LISTING, quantity_total: 10, owner_id: OWNER, listed: true })
    await db("orders").insert({
      order_id: ORDER,
      kind: "Delivery",
      cost: 300,
      title: "Org order",
      description: "",
      customer_id: BUYER,
      contractor_id: ORG,
      status: "not-started",
    })
    await db("market_orders").insert({ order_id: ORDER, listing_id: LISTING, quantity: 3 })
    // The seller allocates 3 by hand: split into an unlisted lot of 3.
    await new AllocationService(db).manualAllocate(ORDER, [{ lot_id: LOT, quantity: 3 }])
  }, 240_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("puts the allocated units back in the listed lot", async () => {
    const db = state.db!
    expect((await db("stock_lots").where({ lot_id: LOT }).first()).quantity_total).toBe(7)
    expect(await db("stock_allocations").where({ order_id: ORDER, status: "active" })).toHaveLength(1)

    const contractor = await db("contractors").where({ contractor_id: ORG }).first()
    await archiveContractor({ contractor, actorId: OWNER, reason: "test" })

    expect((await db("orders").where({ order_id: ORDER }).first()).status).toBe("cancelled")
    expect(await db("stock_allocations").where({ order_id: ORDER, status: "active" })).toHaveLength(0)
    const lots = await db("stock_lots").where({ listing_id: LISTING })
    expect(lots.map((l) => [l.listed, l.quantity_total])).toEqual([[true, 10]])
  })
})
