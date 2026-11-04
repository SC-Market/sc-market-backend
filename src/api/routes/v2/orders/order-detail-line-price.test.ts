/**
 * GET /api/v2/orders/{id}: market_listings_v2[].price is the unit price the
 * order was placed at (its order_market_items_v2 lines), not the listing's
 * current listing_items.base_price, which the seller may have changed since.
 */

import { describe, it, expect, vi } from "vitest"
import type { Request as ExpressRequest } from "express"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown }))

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(
    () => h.db,
  ),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
  external_resource_regex: /^$/,
}))
vi.mock("../../v1/util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(),
}))

const { OrdersV2Controller } = await import("./OrdersV2Controller.js")

/** The fake knex, plus the listing photo lookup (a join it doesn't model): no photo. */
function seed(lines: Array<{ variant_id: string; price_per_unit: string }>) {
  const fake = createFakeKnex({
    accounts: [
      {
        user_id: "buyer",
        username: "buyer",
        display_name: "Buyer",
        avatar: null,
      },
    ],
    shops: [
      {
        shop_id: "shop-1",
        name: "S",
        slug: "s",
        owner_user_id: "owner",
        owner_contractor_id: null,
      },
    ],
    orders: [
      {
        order_id: "o1",
        customer_id: "buyer",
        assigned_id: "owner",
        shop_id: "shop-1",
        status: "not-started",
        cost: 0,
      },
    ],
    listings: [{ listing_id: "L1", title: "Laser Rifle" }],
    // The seller has raised the price since the order was placed.
    listing_items: [{ item_id: "I1", listing_id: "L1", base_price: "900" }],
    item_variants: [
      {
        variant_id: "v1",
        display_name: "Standard",
        short_name: "STD",
        attributes: {},
      },
      {
        variant_id: "v2",
        display_name: "Q900",
        short_name: "Q900",
        attributes: {},
      },
    ],
    order_market_items_v2: lines.map((l, i) => ({
      order_item_id: `oi${i}`,
      order_id: "o1",
      listing_id: "L1",
      item_id: "I1",
      quantity: 2,
      ...l,
    })),
    market_orders: [],
  })
  const noPhoto = {
    join: () => noPhoto,
    where: () => noPhoto,
    orderBy: () => noPhoto,
    select: () => noPhoto,
    first: async () => undefined,
  }
  h.db = Object.assign(
    (table: string) =>
      table.startsWith("listing_photos_v2") ? noPhoto : fake(table),
    { raw: (sql: string) => sql, tables: fake.tables },
  )
}

async function listingPrice(): Promise<number> {
  const req = {
    user: { user_id: "buyer", role: "user" },
  } as unknown as ExpressRequest
  const detail = await new OrdersV2Controller(req).getOrderDetail("o1", req)
  expect(detail.market_listings_v2).toHaveLength(1)
  return detail.market_listings_v2[0].price
}

describe("v2 order detail: listing price", () => {
  it("is the order line's unit price, not the listing's current price", async () => {
    seed([{ variant_id: "v1", price_per_unit: "500" }])
    expect(await listingPrice()).toBe(500)
  })

  it("is the lowest line price when the variants were priced differently", async () => {
    seed([
      { variant_id: "v2", price_per_unit: "750" },
      { variant_id: "v1", price_per_unit: "500" },
    ])
    expect(await listingPrice()).toBe(500)
  })
})
