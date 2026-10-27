/**
 * GET /api/v2/listings/{id} against the FULL schema: test shops' listings
 * (shops.is_test, services/test-accounts/isolation.ts) are visible to test
 * accounts only. Anonymous visitors, real users and site admins get a 404,
 * exactly as for a listing that doesn't exist.
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
} from "../../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../../test-utils/full-schema.js"

const DB = "pgtest_v2_listing_detail_test_shop"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: {
    getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`),
  },
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")
const { NotFoundError } = await import("../../v1/util/errors.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const SELLER = uuid("b", 1)
const REAL = uuid("b", 2)
const ADMIN = uuid("b", 3)
const TESTER = uuid("b", 4)
const OTHER_TESTER = uuid("b", 5)
const SHOP = uuid("c", 1)
const TEST_SHOP = uuid("c", 2)
const PUBLIC = uuid("e", 1)
const TEST_PUBLIC = uuid("e", 2)
const TEST_UNLISTED = uuid("e", 3)

const anon = () => ({ headers: {} }) as never
const asUser = (user_id: string, role = "user") =>
  ({
    headers: {},
    user: { user_id, role, rsi_confirmed: true, banned: false },
  }) as never

const detail = (id: string, req = anon()) =>
  new ListingsV2Controller().getListingDetail(id, req)

describe.skipIf(!PG_TEST_URL)("listing detail: test-shop isolation", () => {
  beforeAll(async () => {
    const conn = await createTestDatabase(DB)
    await buildSchema(conn)
    state.db = knexFactory({
      client: "pg",
      connection: conn,
      pool: { min: 0, max: 4 },
    })
    const db = state.db
    await db("accounts").insert([
      { user_id: SELLER, username: "ld_seller", display_name: "Seller" },
      { user_id: REAL, username: "ld_real", display_name: "Real" },
      { user_id: ADMIN, username: "ld_admin", display_name: "Admin", role: "admin" },
      {
        user_id: TESTER,
        username: "~ld_tester",
        display_name: "Tester",
        is_test: true,
      },
      {
        user_id: OTHER_TESTER,
        username: "~ld_tester2",
        display_name: "Tester 2",
        is_test: true,
      },
    ])
    await db("shops").insert([
      { shop_id: SHOP, slug: "ld-shop", name: "Real Shop", owner_user_id: SELLER },
      {
        shop_id: TEST_SHOP,
        slug: "ld-test-shop",
        name: "Test Shop",
        owner_user_id: TESTER,
      },
    ])
    const listing = (
      listing_id: string,
      shop_id: string,
      seller_id: string,
      visibility = "public",
    ) => ({
      listing_id,
      seller_id,
      seller_type: "user",
      shop_id,
      title: "Listing",
      status: "active",
      sale_type: "fixed",
      visibility,
    })
    await db("listings").insert([
      listing(PUBLIC, SHOP, SELLER),
      listing(TEST_PUBLIC, TEST_SHOP, TESTER),
      listing(TEST_UNLISTED, TEST_SHOP, TESTER, "unlisted"),
    ])
    // The trigger derives shops.is_test from the owner.
    const shop = await db("shops").where("shop_id", TEST_SHOP).first()
    expect(shop.is_test).toBe(true)
  }, 180_000)

  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  it("serves a real shop's listing to everyone", async () => {
    for (const req of [anon(), asUser(REAL), asUser(TESTER)]) {
      const res = await detail(PUBLIC, req)
      expect(res.listing.listing_id).toBe(PUBLIC)
    }
  })

  it.each([
    ["anonymous", anon],
    ["a real user", () => asUser(REAL)],
    ["the real seller of another shop", () => asUser(SELLER)],
    ["a site admin", () => asUser(ADMIN, "admin")],
  ])("is a 404 for %s", async (_who, req) => {
    for (const id of [TEST_PUBLIC, TEST_UNLISTED]) {
      await expect(detail(id, req())).rejects.toBeInstanceOf(NotFoundError)
    }
  })

  it("is served to test accounts", async () => {
    for (const viewer of [TESTER, OTHER_TESTER]) {
      for (const id of [TEST_PUBLIC, TEST_UNLISTED]) {
        const res = await detail(id, asUser(viewer))
        expect(res.listing.listing_id).toBe(id)
        expect(res.seller.shop_id).toBe(TEST_SHOP)
      }
    }
  })
})
