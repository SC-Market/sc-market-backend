/**
 * GET /api/v2/listings/mine?shop_id= / ?spectrum_id= listed any shop's or
 * org's listings, private and unlisted ones included, to any logged-in user.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
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
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  getShopById: vi.fn(),
  canViewShopPrivate: vi.fn(async () => false),
  canManageShop: vi.fn(async () => false),
}))

const { ListingsV2Controller } = await import("./ListingsV2Controller.js")
const { getShopById } =
  await import("../../../../services/shops/shop-permissions.service.js")

const stranger = { user: { user_id: "stranger", role: "user" } } as never

beforeEach(() => {
  vi.clearAllMocks()
  h.db = createFakeKnex({
    contractors: [{ contractor_id: "org", spectrum_id: "ORG" }],
  })
})

describe("getMyListings scope", () => {
  it("refuses another user's shop", async () => {
    ;(getShopById as Mock).mockResolvedValue({
      shop_id: "s1",
      owner_user_id: "owner",
    })
    await expect(
      new ListingsV2Controller().getMyListings(
        undefined,
        1,
        20,
        undefined,
        undefined,
        undefined,
        "s1",
        stranger,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("refuses an org the caller is not a member of", async () => {
    await expect(
      new ListingsV2Controller().getMyListings(
        undefined,
        1,
        20,
        undefined,
        undefined,
        "ORG",
        undefined,
        stranger,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
