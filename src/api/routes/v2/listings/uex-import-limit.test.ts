/**
 * POST /api/v2/listings/import-uex with confirm=true created one listing per
 * client-supplied entry, unbounded and unvalidated.
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
    [{ ...item, title: "" }],
    [{ ...item, title: "x".repeat(501) }],
    [{ ...item, price: -5 }],
    [{ ...item, quantity: 0 }],
  ])("rejects an invalid entry %#", async (bad) => {
    await expect(run([bad])).rejects.toMatchObject({ name: "ValidationError" })
    expect(withTransaction).not.toHaveBeenCalled()
  })
})
