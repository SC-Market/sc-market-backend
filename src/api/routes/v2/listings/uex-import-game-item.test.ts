/**
 * The web UEX import created every listing with game_item_id null, so imports
 * never reached item price pages. A title naming exactly one game item is now
 * linked; anything else stays unlinked.
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
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: vi.fn(async (fn: (trx: unknown) => unknown) => fn(h.db)),
}))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canManageShop: vi.fn(async () => true),
  canViewShopPrivate: vi.fn(),
  getShopById: vi.fn(),
}))
vi.mock("../../../../services/market-v2/variant.service.js", () => ({
  getOrCreateVariant: vi.fn(async () => "v1"),
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")
const { getOrCreateVariant } =
  await import("../../../../services/market-v2/variant.service.js")

describe("importFromUex game item linking", () => {
  it("links unique name matches and leaves the rest unlinked", async () => {
    const db = createFakeKnex({
      shops: [{ shop_id: "s1", owner_user_id: "u1", owner_contractor_id: null }],
    })
    Object.assign(db, {
      raw: vi.fn(async () => ({
        rows: [{ title: "Arrowhead Sniper Rifle", id: "gi-1", exact: true }],
      })),
    })
    h.db = db

    const result = await new ListingsV2Controller().importFromUex(
      {
        uex_username: "x",
        shop_id: "s1",
        confirm: true,
        listings: [
          { title: "Arrowhead Sniper Rifle", description: "", price: 100, quantity: 1 },
          { title: "Mystery box", description: "", price: 50, quantity: 2 },
        ],
      },
      { user: { user_id: "u1", role: "user", rsi_confirmed: true } } as never,
    )

    expect(result.imported).toBe(2)
    const items = db.tables.listing_items
    expect(items.map((i) => i.game_item_id)).toEqual(["gi-1", null])
    expect(db.tables.listing_item_lots.map((l) => l.game_item_id)).toEqual(["gi-1", null])
    expect(vi.mocked(getOrCreateVariant).mock.calls.map((c) => c[0])).toEqual(["gi-1", null])
  })
})
