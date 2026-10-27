/**
 * Query-cost bounds on v2 lists, against the FULL schema.
 *
 * - GET /orders turned a negative page_size into a negative LIMIT, which
 *   Postgres rejects: a 500. It is now a 400 (shared clampPagination).
 * - GET /shops/{id}/customers had no page_size cap. It stays 0-based (the
 *   frontend sends MUI's 0-based page) but is capped at 100.
 * - GET /shops/by-owner ran a rating query and two image queries per shop;
 *   GET /shops/{id}/customers an image query per customer. Both are now one
 *   query.
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
} from "../../../test-utils/pg-test-db.js"
import { buildSchema } from "../../../test-utils/full-schema.js"

process.env.TZ = "UTC"

const DB = "pgtest_v2_pagination_bounds"
const state: { db: Knex | null } = { db: null }

vi.mock("../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {
    get knex() {
      return state.db
    },
  },
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: {
    getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`),
  },
}))
vi.mock("../../../services/notifications/notification.service.js", () => ({
  notificationService: {},
}))
vi.mock("../../../services/allocation/allocation-mode.service.js", () => ({
  getShopAllocationMode: vi.fn(),
}))
vi.mock("../v1/util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(async () => false),
}))
vi.mock("../v1/contractors/database.js", () => ({
  isContractorOwner: vi.fn(async () => false),
}))
vi.mock("../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { OrdersV2Controller } = await import("./orders/OrdersV2Controller.js")
const { ShopsV2Controller } = await import("./shops/ShopsV2Controller.js")
const { ValidationError } = await import("../v1/util/errors.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const OWNER = uuid("b", 1)
const SHOP = (n: number) => uuid("c", n)
const IMG = (n: number) => uuid("d", n)
const CUSTOMERS = 105

const asUser = (user_id: string) =>
  ({
    headers: {},
    user: { user_id, role: "user", rsi_confirmed: true, banned: false },
  }) as never

/** Counts the queries `fn` sends. */
async function countQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queries: number }> {
  let queries = 0
  const listener = () => {
    queries++
  }
  state.db!.on("query", listener)
  try {
    return { result: await fn(), queries }
  } finally {
    state.db!.removeListener("query", listener)
  }
}

describe.skipIf(!PG_TEST_URL)(
  "v2 pagination bounds and per-row queries",
  () => {
    beforeAll(async () => {
      const conn = await createTestDatabase(DB)
      await buildSchema(conn)
      state.db = knexFactory({
        client: "pg",
        connection: conn,
        pool: { min: 0, max: 4 },
      })
      const db = state.db
      await db("image_resources").insert([
        { resource_id: IMG(1), filename: "banner.png" },
        {
          resource_id: IMG(2),
          filename: "logo.png",
          external_url: "https://ext.test/logo.png",
        },
      ])
      await db("accounts").insert({
        user_id: OWNER,
        username: "pgb_owner",
        display_name: "Owner",
      })
      await db("accounts").insert(
        Array.from({ length: CUSTOMERS }, (_, i) => ({
          user_id: uuid("e", i + 1),
          username: `pgb_customer${i + 1}`,
          display_name: `Customer ${i + 1}`,
        })),
      )
      await db("shops").insert([
        {
          shop_id: SHOP(1),
          slug: "pgb-shop-1",
          name: "One",
          owner_user_id: OWNER,
          banner: IMG(1),
          logo: IMG(2),
        },
        {
          shop_id: SHOP(2),
          slug: "pgb-shop-2",
          name: "Two",
          owner_user_id: OWNER,
        },
      ])
      const orders = Array.from({ length: CUSTOMERS }, (_, i) => ({
        order_id: uuid("f", i + 1),
        customer_id: uuid("e", i + 1),
        shop_id: SHOP(1),
        assigned_id: OWNER,
        kind: "Delivery",
        cost: 100,
        title: "Order",
        description: "",
        status: "fulfilled",
      }))
      await db("orders").insert(orders)
      await db("shop_ratings").insert([
        {
          shop_id: SHOP(1),
          order_id: orders[0].order_id,
          reviewer_id: orders[0].customer_id,
          rating: 4,
        },
        {
          shop_id: SHOP(1),
          order_id: orders[1].order_id,
          reviewer_id: orders[1].customer_id,
          rating: 5,
        },
      ])
    }, 180_000)

    afterAll(async () => {
      await state.db?.destroy()
      await dropTestDatabase(DB)
    })

    it("GET /orders: a negative or zero page_size or page is a 400, not a 500", async () => {
      const orders = (page?: number, pageSize?: number) =>
        new OrdersV2Controller().getOrders(
          undefined,
          undefined,
          undefined,
          undefined,
          page,
          pageSize,
          undefined,
          undefined,
          asUser(OWNER),
        )
      await expect(orders(1, -1)).rejects.toBeInstanceOf(ValidationError)
      await expect(orders(1, 0)).rejects.toBeInstanceOf(ValidationError)
      await expect(orders(-3, 10)).rejects.toBeInstanceOf(ValidationError)
      await expect(orders(501, 10)).rejects.toBeInstanceOf(ValidationError)
      const res = await orders(1, 1000)
      expect(res).toMatchObject({ page: 1, page_size: 100 })
    })

    it("GET /shops/{id}/customers: 0-based, capped at 100, avatar resolution in one query", async () => {
      const customers = (page?: number, pageSize?: number) =>
        new ShopsV2Controller().getShopCustomers(
          asUser(OWNER),
          SHOP(1),
          page,
          pageSize,
        )
      const { result: first, queries } = await countQueries(() =>
        customers(0, 1000),
      )
      expect(first).toMatchObject({ total: CUSTOMERS, page: 0, page_size: 100 })
      expect(first.items).toHaveLength(100)
      // getShopById + customers + count; no per-customer query.
      expect(queries).toBeLessThanOrEqual(3)
      const second = await customers(1, 100)
      expect(second.items).toHaveLength(CUSTOMERS - 100)
      await expect(customers(-1, 10)).rejects.toBeInstanceOf(ValidationError)
      await expect(customers(0, -10)).rejects.toBeInstanceOf(ValidationError)
    })

    it("GET /shops/by-owner: ratings and image URLs in one query", async () => {
      const { result, queries } = await countQueries(() =>
        new ShopsV2Controller().getShopsByOwner("pgb_owner"),
      )
      // The owner lookup and the shops query.
      expect(queries).toBe(2)
      expect(
        result.map((s) => [
          s.slug,
          s.banner_url,
          s.logo_url,
          s.rating,
          s.rating_count,
        ]),
      ).toEqual([
        [
          "pgb-shop-1",
          "https://cdn.sc-market.space/banner.png",
          "https://ext.test/logo.png",
          4.5,
          2,
        ],
        ["pgb-shop-2", null, null, 0, 0],
      ])
    })
  },
)
