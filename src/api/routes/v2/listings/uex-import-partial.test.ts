/**
 * One unpriced listing used to reject the whole UEX import. Each listing is
 * now checked on its own: valid ones import, invalid ones come back skipped
 * with a reason, and the preview flags them before the user confirms.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, vi, afterEach } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown, failTitle: null as string | null }))
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
vi.mock("../../../../services/market-v2/game-item-match.service.js", () => ({
  matchGameItemsByName: vi.fn(async () => new Map()),
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")
const { withTransaction } = await import("../../../../clients/database/transaction.js")

const req = { user: { user_id: "u1", role: "user", rsi_confirmed: true } } as never

function freshDb() {
  const db = createFakeKnex({
    shops: [{ shop_id: "s1", owner_user_id: "u1", owner_contractor_id: null }],
  })
  h.db = db
  return db
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(withTransaction).mockClear()
})

describe("importFromUex per-listing results", () => {
  it("imports the priced listings and skips the unpriced one", async () => {
    const db = freshDb()
    const result = await new ListingsV2Controller().importFromUex(
      {
        uex_username: "x",
        shop_id: "s1",
        confirm: true,
        listings: [
          { title: "Gun", description: "", price: 100, quantity: 1 },
          { title: "Free armor", description: "", price: 0, quantity: 1 },
          { title: "Helmet", description: "", price: 50, quantity: 2 },
        ],
      },
      req,
    )

    expect(result).toEqual({
      imported: 2,
      skipped: 1,
      total: 3,
      results: [
        { index: 0, title: "Gun", status: "imported" },
        { index: 1, title: "Free armor", status: "skipped", reason: "no_price" },
        { index: 2, title: "Helmet", status: "imported" },
      ],
    })
    expect(db.tables.listings.map((l) => l.title)).toEqual(["Gun", "Helmet"])
  })

  it("reports a listing that fails to save as skipped and keeps going", async () => {
    freshDb()
    vi.mocked(withTransaction)
      .mockImplementationOnce(async () => {
        throw new Error("boom")
      })
    const result = await new ListingsV2Controller().importFromUex(
      {
        uex_username: "x",
        shop_id: "s1",
        confirm: true,
        listings: [
          { title: "Gun", description: "", price: 100, quantity: 1 },
          { title: "Helmet", description: "", price: 50, quantity: 2 },
        ],
      },
      req,
    )
    expect(result.imported).toBe(1)
    expect(result.results).toEqual([
      { index: 0, title: "Gun", status: "skipped", reason: "failed" },
      { index: 1, title: "Helmet", status: "imported" },
    ])
  })

  it("flags unpriced listings in the preview", async () => {
    freshDb()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "ok",
          data: [
            { operation: "sell", title: "Gun", price: "100", in_stock: "1" },
            { operation: "sell", title: "Free armor", price: "0", in_stock: "1" },
            { operation: "sell", title: "No price field", in_stock: "1" },
          ],
        }),
      })),
    )
    const result = await new ListingsV2Controller().importFromUex(
      { uex_username: "x", shop_id: "s1" },
      req,
    )
    expect(result.preview?.map((p) => [p.title, p.skip_reason])).toEqual([
      ["Gun", undefined],
      ["Free armor", "no_price"],
      ["No price field", "no_price"],
    ])
    expect(withTransaction).not.toHaveBeenCalled()
  })
})
