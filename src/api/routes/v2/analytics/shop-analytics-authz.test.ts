/**
 * /api/v2/analytics/seller-stats and /listing-stats returned any shop's
 * sales, views and conversion data to anyone. Their only callers are the
 * seller dashboard widgets, so they now need a logged-in user who can view
 * the shop's private data.
 *
 * Named without "Controller" so the vitest exclusion for DB-backed v2
 * controller tests does not skip it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

const h = vi.hoisted(() => ({ queried: [] as string[] }))
vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => {
    h.queried.push(table)
    throw new Error(`unexpected query on ${table}`)
  }
  knex.raw = () => ({})
  return { getKnex: () => knex, database: { knex } }
})
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  getShopById: vi.fn(),
  canViewShopPrivate: vi.fn(),
}))

const { AnalyticsV2Controller } = await import("./AnalyticsV2Controller.js")
const { getShopById, canViewShopPrivate } =
  await import("../../../../services/shops/shop-permissions.service.js")

const asUser = (user_id: string) =>
  ({ user: { user_id, role: "user" } }) as never

beforeEach(() => {
  vi.clearAllMocks()
  h.queried.length = 0
  ;(getShopById as Mock).mockResolvedValue({
    shop_id: "s1",
    owner_user_id: "owner",
  })
  ;(canViewShopPrivate as Mock).mockResolvedValue(false)
})

describe("shop analytics access", () => {
  it("seller-stats refuses a user who cannot view the shop", async () => {
    await expect(
      new AnalyticsV2Controller().getSellerStats("s1", asUser("stranger")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(h.queried).toEqual([])
  })

  it("listing-stats refuses a user who cannot view the shop", async () => {
    await expect(
      new AnalyticsV2Controller().getListingStats("s1", 20, asUser("stranger")),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(h.queried).toEqual([])
  })

  it("seller-stats refuses anonymous callers", async () => {
    await expect(
      new AnalyticsV2Controller().getSellerStats("s1", {
        user: undefined,
      } as never),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(h.queried).toEqual([])
  })
})
