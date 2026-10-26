/**
 * A manage_market member of an org could transfer the org's shop to their own
 * account (no owner check, no recipient acceptance). Transfer is now an
 * owner-only action, recorded in the org audit log.
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
  knex.fn = { now: () => "now()" }
  knex.raw = () => ({})
  return { getKnex: () => knex, database: { knex } }
})
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../v1/util/permissions.js", () => ({
  has_permission: vi.fn(),
  is_member: vi.fn(),
}))
vi.mock("../../v1/contractors/database.js", () => ({
  isContractorOwner: vi.fn(),
}))
vi.mock(
  "../../../../services/shops/shop-permissions.service.js",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../../services/shops/shop-permissions.service.js")
      >()
    return { ...original, getShopById: vi.fn() }
  },
)
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: {
    fetchGuild: vi.fn(),
    fetchChannel: vi.fn(),
    fetchGuildMember: vi.fn(),
  },
}))

const { ShopsV2Controller } = await import("./ShopsV2Controller.js")
const { has_permission } = await import("../../v1/util/permissions.js")
const { isContractorOwner } = await import("../../v1/contractors/database.js")
const { getShopById } =
  await import("../../../../services/shops/shop-permissions.service.js")

const orgShop = {
  shop_id: "s1",
  slug: "org-shop",
  owner_user_id: null,
  owner_contractor_id: "org1",
  official_server_id: null,
  discord_thread_channel_id: null,
}

function asUser(user_id: string) {
  return { user: { user_id, role: "user" } } as never
}

describe("transferShop", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.queried.length = 0
    ;(getShopById as Mock).mockResolvedValue(orgShop)
  })

  it("refuses a manage_market member who is not the org owner", async () => {
    ;(has_permission as Mock).mockResolvedValue(true) // manage_market
    ;(isContractorOwner as Mock).mockResolvedValue(false)

    await expect(
      new ShopsV2Controller().transferShop(asUser("member"), "s1", {
        target_type: "user",
        target_id: "member",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(isContractorOwner).toHaveBeenCalledWith("member", "org1")
    expect(h.queried).toEqual([])
  })

  it("refuses a non-owner on a user-owned shop", async () => {
    ;(getShopById as Mock).mockResolvedValue({
      ...orgShop,
      owner_user_id: "alice",
      owner_contractor_id: null,
    })
    await expect(
      new ShopsV2Controller().transferShop(asUser("mallory"), "s1", {
        target_type: "user",
        target_id: "mallory",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(h.queried).toEqual([])
  })
})
