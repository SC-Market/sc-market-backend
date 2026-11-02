/**
 * POST /api/v2/listings/import-uex with confirm=true created one listing per
 * client-supplied entry, unbounded and unvalidated. The batch size is capped;
 * each entry is validated on its own and an invalid one is skipped.
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
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: vi.fn(async () => {
    throw new Error("must not create listings")
  }),
}))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canManageShop: vi.fn(async () => true),
  canViewShopPrivate: vi.fn(),
  getShopById: vi.fn(),
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")
const { withTransaction } =
  await import("../../../../clients/database/transaction.js")

const item = { title: "Gun", description: "A gun", price: 100, quantity: 1 }
const req = {
  user: { user_id: "u1", role: "user", rsi_confirmed: true },
} as never

function run(listings: unknown[]) {
  h.db = createFakeKnex({
    shops: [{ shop_id: "s1", owner_user_id: "u1", owner_contractor_id: null }],
  })
  return new ListingsV2Controller().importFromUex(
    {
      uex_username: "x",
      shop_id: "s1",
      confirm: true,
      listings: listings as never,
    },
    req,
  )
}

describe("importFromUex confirm", () => {
  it("rejects more than 100 listings", async () => {
    await expect(
      run(Array.from({ length: 101 }, () => item)),
    ).rejects.toMatchObject({
      name: "ValidationError",
    })
    expect(withTransaction).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...item, title: "" }, "invalid_title"],
    [{ ...item, title: "x".repeat(501) }, "invalid_title"],
    [{ ...item, price: 0 }, "no_price"],
    [{ ...item, price: -5 }, "invalid_price"],
    [{ ...item, quantity: 0 }, "invalid_quantity"],
  ])("skips an invalid entry %# without writing", async (bad, reason) => {
    await expect(run([bad])).resolves.toEqual({
      imported: 0,
      skipped: 1,
      total: 1,
      results: [{ index: 0, title: bad.title, status: "skipped", reason }],
    })
    expect(withTransaction).not.toHaveBeenCalled()
  })
})
