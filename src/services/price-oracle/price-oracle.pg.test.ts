/**
 * Price oracle on the FULL schema: the snapshot job's and the feed's real SQL.
 * Only public, active, aged, fixed-price listings of real shops count; test
 * shops, unlisted, young, placeholder and auction listings don't.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import {
  PG_TEST_URL,
  createTestDatabase,
  dropTestDatabase,
} from "../../test-utils/pg-test-db.js"
import { buildSchema } from "../../test-utils/full-schema.js"

process.env.TZ = "UTC"

const DB = "pgtest_price_oracle"
const state: { db: Knex | null } = { db: null }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const svc = await import("./price-oracle.service.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const TESTER = uuid("b", 9)
const GAME_ITEM = uuid("8", 1)
const OLD = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
let variant: string
let seq = 0

function db() {
  return state.db!
}

async function listing(
  shop: string,
  owner: string,
  price: number,
  opts: {
    visibility?: string
    created_at?: Date
    sale_type?: string
    qty?: number
  } = {},
) {
  seq++
  const listing_id = uuid("e", seq)
  const item_id = uuid("f", seq)
  await db()("listings").insert({
    listing_id,
    seller_id: owner,
    seller_type: "user",
    shop_id: shop,
    title: `Rifle ${seq}`,
    status: "active",
    sale_type: opts.sale_type ?? "fixed",
    visibility: opts.visibility ?? "public",
    created_at: opts.created_at ?? OLD,
  })
  await db()("listing_items").insert({
    item_id,
    listing_id,
    game_item_id: GAME_ITEM,
    pricing_mode: "unified",
    base_price: price,
  })
  await db()("listing_item_lots").insert({
    item_id,
    variant_id: variant,
    quantity_total: opts.qty ?? 2,
    owner_id: owner,
    listed: true,
  })
}

describe.skipIf(!PG_TEST_URL)("price oracle (real SQL)", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 4 },
    })
    const sellers = [1, 2, 3, 4].map((n) => uuid("b", n))
    for (const [i, user_id] of sellers.entries()) {
      await db()("accounts").insert({
        user_id,
        username: `po_seller${i}`,
        display_name: `Seller ${i}`,
      })
      await db()("shops").insert({
        shop_id: uuid("c", i + 1),
        slug: `po-shop-${i}`,
        name: `PO Shop ${i}`,
        owner_user_id: user_id,
      })
    }
    await db()("accounts").insert({
      user_id: TESTER,
      username: "~po_tester",
      display_name: "Tester",
      is_test: true,
    })
    await db()("shops").insert({
      shop_id: uuid("c", 9),
      slug: "po-test-shop",
      name: "PO Test Shop",
      owner_user_id: TESTER,
    })
    await db()("game_items").insert({
      id: GAME_ITEM,
      name: "PO Rifle",
      type: "Weapon",
    })
    const [v] = await db()("item_variants")
      .insert({ game_item_id: GAME_ITEM, attributes: { quality_tier: 3 } })
      .returning("variant_id")
    variant = v.variant_id

    // Counted: three real shops (shop 1 twice: one seller, lowest ask 10,000).
    await listing(uuid("c", 1), sellers[0], 10_000)
    await listing(uuid("c", 1), sellers[0], 10_500)
    await listing(uuid("c", 2), sellers[1], 12_000)
    await listing(uuid("c", 3), sellers[2], 14_000)
    // Not counted.
    await listing(uuid("c", 9), TESTER, 100) // test shop
    await listing(uuid("c", 4), sellers[3], 200, { visibility: "unlisted" })
    await listing(uuid("c", 4), sellers[3], 300, { created_at: new Date() }) // too young
    await listing(uuid("c", 4), sellers[3], 1) // placeholder
    await listing(uuid("c", 4), sellers[3], 400, { sale_type: "auction" })
  }, 240_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("the snapshot job writes today's row from eligible asks only, idempotently", async () => {
    const now = new Date()
    expect(await svc.snapshotGameItemPrices(db(), now)).toBe(1)
    expect(await svc.snapshotGameItemPrices(db(), now)).toBe(1)
    const rows = await db()("game_item_price_daily").where(
      "game_item_id",
      GAME_ITEM,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ask_count: 4,
      seller_count: 3,
      quantity_available: "8",
      lowest_ask: "10000",
      median_ask: "12000",
      highest_ask: "14000",
    })
  })

  it("the feed document and index agree and identify no seller", async () => {
    const doc = await svc.getPriceDocument(GAME_ITEM, db())
    expect(doc?.current).toMatchObject({
      seller_count: 3,
      ask_count: 4,
      lowest_ask: 10_000,
      median_ask: 12_000,
    })
    expect(doc?.trend_30d.daily).toHaveLength(1)
    const index = await svc.getPriceIndex(db())
    expect(index.items).toHaveLength(1)
    expect(index.items[0]).toMatchObject({
      name: "PO Rifle",
      lowest_ask: 10_000,
      median_ask: 12_000,
      seller_count: 3,
    })
    const text = JSON.stringify([doc, index])
    for (const secret of [
      "PO Shop",
      "po-shop",
      "Seller ",
      "PO Test Shop",
      uuid("b", 1),
      uuid("c", 1),
      uuid("e", 1),
    ]) {
      expect(text).not.toContain(secret)
    }
  })
})
