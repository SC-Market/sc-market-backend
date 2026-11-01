/**
 * GET /api/v2/stock-lots had no shop filter: a shop's Stock page showed lots
 * from the seller's other shops, and lot lookups for an org shop's listing
 * (scoped to the user's own shops) found nothing. `shop_id` scopes to one
 * shop, for anyone who may see that shop's private data.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, vi } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canViewShopPrivate: vi.fn(async (_shop: unknown, userId: string) => userId === "member"),
}))

const { StockLotsV2Controller } = await import("./StockLotsV2Controller.js")

function getLots(shopId: string, userId: string) {
  return new StockLotsV2Controller().getStockLots(
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    1, 20, shopId,
    { user: { user_id: userId, role: "user" } } as never,
  )
}

describe("getStockLots shop_id scope", () => {
  it("refuses a user who cannot see the shop, before querying lots", async () => {
    const db = createFakeKnex({
      shops: [{ shop_id: "s1", owner_user_id: null, owner_contractor_id: "org" }],
    })
    h.db = db
    await expect(getLots("s1", "stranger")).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(Object.keys(db.tables)).not.toContain("listing_item_lots as sl")
  })

  it("404s an unknown shop", async () => {
    h.db = createFakeKnex({ shops: [] })
    await expect(getLots("nope", "member")).rejects.toMatchObject({ name: "NotFoundError" })
  })
})
