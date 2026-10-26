/**
 * GET /api/v2/orders and GET /api/v2/analytics/seller-stats against a real,
 * throwaway Postgres.
 *
 * Both endpoints were 500 for every caller: they read orders.created_at (and
 * the list also orders.updated_at), but the orders table has neither. Its
 * creation time is "timestamp" and its only later timestamp is fulfilled_at.
 * Postgres rejects an unknown column at parse time, so no row data was needed
 * to hit it, which is why mocked-knex tests never caught it.
 *
 * Runs when PG_TEST_URL names a throwaway Postgres server (see
 * src/test-utils/pg-test-db.ts; CI provides one), in its own database:
 *   PG_TEST_URL='postgres://postgres@localhost/postgres?host=/tmp/pg' npx vitest run src/api/routes/v2/orders-analytics-timestamps.pg.test.ts
 *
 * The tables below copy production's column names and types (config/postgres/0-schema.sql
 * plus the knex migrations) for the columns these endpoints touch. Keep them that way:
 * orders must NOT grow created_at/updated_at here unless production has them.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import knexFactory, { type Knex } from "knex"
import { PG_TEST_URL, createTestDatabase, dropTestDatabase } from "../../../test-utils/pg-test-db.js"

// orders."timestamp" is timestamp WITHOUT time zone, which node-postgres reads
// in the process's local zone. Production runs in UTC; pin it so the expected
// ISO strings below hold on a laptop too.
process.env.TZ = "UTC"

const DB = "pgtest_v2_orders_analytics"

const state: { db: Knex | null } = { db: null }

vi.mock("../../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))
vi.mock("../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async (id: string) => `https://cdn.test/${id}`) },
}))
vi.mock("../../../services/notifications/notification.service.js", () => ({
  notificationService: {},
}))
vi.mock("../../../services/allocation/allocation-mode.service.js", () => ({
  getShopAllocationMode: vi.fn(),
}))
// Org permissions: "<contractor_id>:<user_id>:<permission>" entries in perms.
// The shop permission service itself is real.
const perms = new Set<string>()
vi.mock("../v1/util/permissions.js", () => ({
  has_permission: vi.fn(async (contractor_id: string, user_id: string, permission: string) =>
    perms.has(`${contractor_id}:${user_id}:${permission}`),
  ),
  is_member: vi.fn(
    async (contractor_id: string, user_id: string) =>
      !!(await state.db!("contractor_members").where({ contractor_id, user_id }).first()),
  ),
}))
vi.mock("../v1/contractors/database.js", () => ({ isContractorOwner: vi.fn(async () => false) }))
vi.mock("../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { OrdersV2Controller } = await import("./orders/OrdersV2Controller.js")
const { AnalyticsV2Controller } = await import("./analytics/AnalyticsV2Controller.js")

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const USER = (n: number) => uuid("b", n)
const SHOP = (n: number) => uuid("c", n)
const ORG = (n: number) => uuid("a", n)
const ORDER = (n: number) => uuid("d", n)
const LISTING = (n: number) => uuid("e", n)
const ITEM = (n: number) => uuid("f", n)
const VARIANT = (n: number) => uuid("9", n)
const GAME_ITEM = uuid("8", 1)

const asUser = (user_id: string) => ({ user: { user_id, role: "user" } }) as never

async function createSchema(db: Knex) {
  await db.raw(`
    DROP TABLE IF EXISTS order_market_items_v2, variant_pricing, listing_item_lots,
      item_variants, listing_items, listing_photos_v2, image_resources, market_orders, listings, orders,
      contractor_members, shops, accounts CASCADE;

    CREATE TABLE accounts (
      user_id uuid PRIMARY KEY,
      username character varying(100) NOT NULL,
      display_name character varying(100) DEFAULT 'Display Name'::character varying NOT NULL,
      avatar uuid DEFAULT '5226c767-0599-419b-ae71-a7303c441db0'::uuid NOT NULL
    );
    CREATE TABLE shops (
      shop_id uuid PRIMARY KEY,
      slug character varying(50) NOT NULL UNIQUE,
      name character varying(100) NOT NULL,
      logo uuid,
      owner_user_id uuid,
      owner_contractor_id uuid,
      status character varying(20) DEFAULT 'active' NOT NULL
    );
    CREATE TABLE contractor_members (
      contractor_id uuid NOT NULL,
      user_id uuid NOT NULL,
      role character varying(30) NOT NULL
    );
    -- Production's orders: no created_at, no updated_at.
    CREATE TABLE orders (
      order_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      kind character varying(30) NOT NULL,
      cost bigint NOT NULL,
      title character varying(100) DEFAULT '{}'::character varying NOT NULL,
      description character varying(2000) DEFAULT '{}'::character varying NOT NULL,
      assigned_id uuid,
      customer_id uuid NOT NULL,
      contractor_id uuid,
      "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
      status character varying(30) DEFAULT 'not-started'::character varying NOT NULL,
      shop_id uuid,
      fulfilled_at timestamptz DEFAULT NULL
    );
    CREATE TABLE listings (
      listing_id uuid PRIMARY KEY,
      title character varying(500) NOT NULL,
      status character varying(20) DEFAULT 'active' NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL,
      updated_at timestamptz DEFAULT now() NOT NULL,
      shop_id uuid
    );
    CREATE TABLE image_resources (
      resource_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      filename text NOT NULL,
      external_url text
    );
    CREATE TABLE listing_photos_v2 (
      photo_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      listing_id uuid NOT NULL,
      resource_id uuid NOT NULL,
      display_order integer DEFAULT 0 NOT NULL
    );
    CREATE TABLE market_orders (
      order_id uuid,
      listing_id uuid,
      quantity integer DEFAULT 1
    );
    CREATE TABLE listing_items (
      item_id uuid PRIMARY KEY,
      listing_id uuid NOT NULL,
      game_item_id uuid NOT NULL,
      base_price bigint
    );
    CREATE TABLE item_variants (
      variant_id uuid PRIMARY KEY,
      game_item_id uuid NOT NULL,
      attributes jsonb NOT NULL
    );
    CREATE TABLE listing_item_lots (
      lot_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      item_id uuid NOT NULL,
      variant_id uuid NOT NULL,
      quantity_total integer NOT NULL,
      listed boolean DEFAULT true NOT NULL
    );
    CREATE TABLE variant_pricing (
      pricing_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      item_id uuid NOT NULL,
      variant_id uuid NOT NULL,
      price bigint NOT NULL
    );
    CREATE TABLE order_market_items_v2 (
      order_item_id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      order_id uuid NOT NULL,
      listing_id uuid NOT NULL,
      item_id uuid NOT NULL,
      variant_id uuid NOT NULL,
      quantity integer NOT NULL,
      price_per_unit bigint NOT NULL,
      created_at timestamptz DEFAULT now() NOT NULL
    );
  `)
}

/**
 * Users: 1 buyer, 2 personal-shop seller, 3 org member with manage_orders
 * (org shop), 4 unrelated (owns shop 3), 5 org member without order
 * permissions, 6 a second buyer.
 * Orders:
 *   1  buyer 1, shop 1 (user 2), two V2 lines, fulfilled
 *   2  buyer 1, shop 2 (org of user 3), one line, in-progress
 *   3  buyer 1, shop 1, one line, cancelled
 *   4  buyer 4, shop 3 (user 4), one line, bought by user 4 themselves
 *   5  buyer 6, shop 1, V1-era: no market_orders row, no V2 lines, only cost
 *   6  buyer 6, shop 4 (an org nobody here is in), assigned to user 2
 * Like production's cart-checkout orders, none of them needs a market_orders
 * row to be found: orders.shop_id and orders.assigned_id say who sells.
 */
async function seed(db: Knex) {
  await db("accounts").insert([
    { user_id: USER(1), username: "buyer" },
    { user_id: USER(2), username: "seller" },
    { user_id: USER(3), username: "orgmember" },
    { user_id: USER(4), username: "other" },
    { user_id: USER(5), username: "plainmember" },
    { user_id: USER(6), username: "buyer2" },
  ])
  await db("shops").insert([
    { shop_id: SHOP(1), slug: "s1", name: "Seller Shop", owner_user_id: USER(2) },
    { shop_id: SHOP(2), slug: "s2", name: "Org Shop", owner_contractor_id: ORG(1) },
    { shop_id: SHOP(3), slug: "s3", name: "Other Shop", owner_user_id: USER(4) },
    { shop_id: SHOP(4), slug: "s4", name: "Far Org Shop", owner_contractor_id: ORG(2) },
  ])
  await db("contractor_members").insert([
    { contractor_id: ORG(1), user_id: USER(3), role: "member" },
    { contractor_id: ORG(1), user_id: USER(5), role: "member" },
  ])
  perms.add(`${ORG(1)}:${USER(3)}:manage_orders`)

  await db("listings").insert([
    { listing_id: LISTING(1), title: "Quantanium", shop_id: SHOP(1), created_at: "2026-10-01T00:00:00Z" },
    { listing_id: LISTING(2), title: "Laranite", shop_id: SHOP(2), created_at: "2026-10-01T00:00:00Z" },
    { listing_id: LISTING(3), title: "Agricium", shop_id: SHOP(3), created_at: "2026-10-01T00:00:00Z" },
  ])
  await db("listing_items").insert([
    { item_id: ITEM(1), listing_id: LISTING(1), game_item_id: GAME_ITEM, base_price: 1000 },
    { item_id: ITEM(2), listing_id: LISTING(2), game_item_id: GAME_ITEM, base_price: 1000 },
    { item_id: ITEM(3), listing_id: LISTING(3), game_item_id: GAME_ITEM, base_price: 1000 },
  ])
  await db("item_variants").insert([
    { variant_id: VARIANT(1), game_item_id: GAME_ITEM, attributes: { quality_tier: 1 } },
    { variant_id: VARIANT(3), game_item_id: GAME_ITEM, attributes: { quality_tier: 3 } },
  ])
  await db("listing_item_lots").insert([
    { item_id: ITEM(1), variant_id: VARIANT(1), quantity_total: 10 },
    { item_id: ITEM(1), variant_id: VARIANT(3), quantity_total: 4 },
  ])
  await db("variant_pricing").insert({ item_id: ITEM(1), variant_id: VARIANT(3), price: 1500 })

  const order = (
    n: number,
    customer: string,
    shop: string,
    status: string,
    ts: string,
    extra: Record<string, unknown> = {},
  ) => ({
    order_id: ORDER(n), kind: "Delivery", cost: 0, customer_id: customer, shop_id: shop, status,
    title: `Order ${n}`, timestamp: ts, fulfilled_at: null, ...extra,
  })
  await db("orders").insert([
    order(1, USER(1), SHOP(1), "fulfilled", "2026-10-02 00:00:00", { fulfilled_at: "2026-10-05T00:00:00Z" }),
    order(2, USER(1), SHOP(2), "in-progress", "2026-10-03 00:00:00"),
    order(3, USER(1), SHOP(1), "cancelled", "2026-10-04 00:00:00"),
    order(4, USER(4), SHOP(3), "not-started", "2026-10-06 00:00:00"),
    order(5, USER(6), SHOP(1), "in-progress", "2025-01-01 00:00:00", {
      cost: 50000, title: "Items Sold to buyer2",
    }),
    order(6, USER(6), SHOP(4), "not-started", "2025-01-02 00:00:00", { assigned_id: USER(2) }),
  ])
  const line = (o: number, l: number, v: number, quantity: number, price_per_unit: number) => ({
    order_id: ORDER(o), listing_id: LISTING(l), item_id: ITEM(l), variant_id: VARIANT(v),
    quantity, price_per_unit,
  })
  await db("order_market_items_v2").insert([
    // Two lines in one order: must still be one order in the list and the count.
    line(1, 1, 1, 3, 1000),
    line(1, 1, 3, 2, 1500),
    line(2, 2, 1, 1, 9000),
    line(3, 1, 1, 2, 1000),
    line(4, 3, 1, 1, 10),
  ])
}

describe.skipIf(!PG_TEST_URL)("v2 orders + seller-stats on real Postgres", () => {
  beforeAll(async () => {
    state.db = knexFactory({
      client: "pg",
      connection: await createTestDatabase(DB),
      pool: {
        min: 0,
        max: 2,
        afterCreate: (conn: any, done: (err?: Error) => void) =>
          conn.query("SET TIME ZONE 'UTC'", done),
      },
    })
    await createSchema(state.db)
    await seed(state.db)
  })
  afterAll(async () => {
    await state.db?.destroy()
    await dropTestDatabase(DB)
  })

  describe("GET /orders", () => {
    const list = (user: number, args: Partial<Record<string, unknown>> = {}) =>
      new OrdersV2Controller().getOrders(
        args.status as never,
        args.role as never,
        undefined,
        undefined,
        undefined,
        undefined,
        args.sort_by as never,
        args.sort_order as never,
        asUser(USER(user)),
      )

    it("lists the buyer's orders, created_at from orders.timestamp", async () => {
      const res = await list(1)
      expect(res.total).toBe(3)
      expect(res.orders.map((o) => o.order_id)).toEqual([ORDER(3), ORDER(2), ORDER(1)])
      const fulfilled = res.orders.find((o) => o.order_id === ORDER(1))!
      expect(fulfilled.created_at).toBe("2026-10-02T00:00:00.000Z")
      expect(fulfilled.updated_at).toBe("2026-10-05T00:00:00.000Z")
      expect(fulfilled.total_price).toBe(3 * 1000 + 2 * 1500)
      expect(fulfilled.shop_name).toBe("Seller Shop")
      const open = res.orders.find((o) => o.order_id === ORDER(2))!
      expect(open.updated_at).toBe("2026-10-03T00:00:00.000Z")
    })

    it("role=buyer excludes orders the user only sells", async () => {
      const res = await list(4, { role: "buyer" })
      expect(res.orders.map((o) => o.order_id)).toEqual([ORDER(4)])
    })

    it("role=customer is the buyer, as in /offers and V1", async () => {
      const customer = await list(4, { role: "customer" })
      const buyer = await list(4, { role: "buyer" })
      expect(customer.orders.map((o) => o.order_id)).toEqual([ORDER(4)])
      expect(customer).toEqual(buyer)
    })

    it("role=seller: the user's shops' orders and orders assigned to them, each once", async () => {
      const res = await list(2, { role: "seller" })
      // 1 and 3 (two lines in 1), V1-era 5 found through orders.shop_id alone,
      // 6 because it is assigned to user 2.
      expect(res.total).toBe(4)
      expect(res.orders.map((o) => o.order_id).sort()).toEqual(
        [ORDER(1), ORDER(3), ORDER(5), ORDER(6)].sort(),
      )
    })

    it("a V1-era order (no market_orders, no V2 lines) shows its own title, cost and shop", async () => {
      const res = await list(2, { role: "seller" })
      const v1 = res.orders.find((o) => o.order_id === ORDER(5))!
      expect(v1).toMatchObject({
        title: "Items Sold to buyer2",
        total_price: 50000,
        shop_name: "Seller Shop",
        shop_slug: "s1",
        buyer_username: "buyer2",
        item_count: 0,
      })
    })

    it("role=seller includes org shops whose orders the user manages", async () => {
      const res = await list(3, { role: "seller" })
      expect(res.total).toBe(1)
      expect(res.orders.map((o) => o.order_id)).toEqual([ORDER(2)])
    })

    it("role=seller excludes org shops the user is only a member of", async () => {
      const res = await list(5, { role: "seller" })
      expect(res.total).toBe(0)
    })

    it("no role: bought or sold", async () => {
      const res = await list(4)
      expect(res.orders.map((o) => o.order_id)).toEqual([ORDER(4)])
      const seller = await list(2)
      expect(seller.total).toBe(4)
    })

    it.each([
      ["fulfilled", [ORDER(1)]],
      ["in-progress", [ORDER(2)]],
      ["cancelled", [ORDER(3)]],
      ["not-started", []],
    ])("status=%s matches the stored status", async (status, expected) => {
      const res = await list(1, { status })
      expect(res.orders.map((o) => o.order_id)).toEqual(expected)
      expect(res.total).toBe(expected.length)
    })

    it("sorts by updated_at (the admin supplier dashboard's sort)", async () => {
      const res = await list(1, { sort_by: "updated_at", sort_order: "desc" })
      // order 1 was fulfilled on the 5th, after orders 2 and 3 were placed.
      expect(res.orders.map((o) => o.order_id)).toEqual([ORDER(1), ORDER(3), ORDER(2)])
    })

    it("sorts by total_price", async () => {
      const res = await list(1, { sort_by: "total_price", sort_order: "asc" })
      expect(res.orders.map((o) => o.total_price)).toEqual([2000, 6000, 9000])
    })
  })

  describe("GET /orders/{id}", () => {
    const detail = (user: number, order: number) =>
      new OrdersV2Controller().getOrderDetail(ORDER(order), asUser(USER(user)))

    it("names the seller from orders.shop_id, for the shop's owner", async () => {
      const res = await detail(2, 5)
      expect(res.seller).toEqual({ shop_id: SHOP(1), name: "Seller Shop", slug: "s1" })
      expect(res.total_price).toBe(50000)
    })

    it("lets an org member with manage_orders open the org shop's order", async () => {
      const res = await detail(3, 2)
      expect(res.seller.shop_id).toBe(SHOP(2))
    })

    it("refuses an org member without order permissions", async () => {
      await expect(detail(5, 2)).rejects.toMatchObject({ code: "FORBIDDEN" })
    })

    it("lets the assignee open an order of a shop they are not in", async () => {
      const res = await detail(2, 6)
      expect(res.seller.name).toBe("Far Org Shop")
    })
  })

  describe("GET /analytics/seller-stats", () => {
    it("returns sales and inventory for a real shop", async () => {
      const res = await new AnalyticsV2Controller().getSellerStats(SHOP(1), asUser(USER(2)))

      // Only the fulfilled order counts as a sale; cancelled order 3 does not.
      expect(res.sales_by_quality).toEqual([
        // listed Oct 1, ordered Oct 2 = 24h
        { quality_tier: 1, volume: 3, avg_price: 1000, avg_time_to_sale_hours: 24 },
        { quality_tier: 3, volume: 2, avg_price: 1500, avg_time_to_sale_hours: 24 },
      ])
      expect(res.inventory_distribution).toEqual([
        { quality_tier: 1, quantity_available: 10, listing_count: 1, shop_count: 1, avg_price: 1000, min_price: 1000, max_price: 1000 },
        { quality_tier: 3, quantity_available: 4, listing_count: 1, shop_count: 1, avg_price: 1500, min_price: 1500, max_price: 1500 },
      ])
      expect(res.price_premiums).toEqual([
        { quality_tier: 1, premium_percentage: 0 },
        { quality_tier: 3, premium_percentage: 50 },
      ])
    })
  })
})
