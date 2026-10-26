/**
 * GET /api/v2/stock-lots?spectrum_id=<org> returned any org's stock (lots,
 * locations, notes, owners) to any logged-in user. Only members may read it.
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
vi.mock("../../v1/util/permissions.js", () => ({
  is_member: vi.fn(async () => false),
  has_permission: vi.fn(async () => false),
}))

const { StockLotsV2Controller } = await import("./StockLotsV2Controller.js")

describe("getStockLots spectrum_id scope", () => {
  it("refuses a non-member before querying lots", async () => {
    const db = createFakeKnex({
      contractors: [{ contractor_id: "org", spectrum_id: "ORG" }],
    })
    h.db = db
    await expect(
      new StockLotsV2Controller().getStockLots(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "ORG",
        1,
        20,
        { user: { user_id: "stranger", role: "user" } } as never,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(Object.keys(db.tables)).not.toContain("listing_item_lots as sl")
  })
})
