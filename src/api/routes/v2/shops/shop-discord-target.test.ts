/**
 * A shop's official_server_id / discord_thread_channel_id were stored as
 * given, so the bot would create threads (and mint invites) in any server it
 * is in. Setting them now requires the bot to see the channel in that server
 * and the user to administer that server.
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
vi.mock("../../../../services/discord/channel-setups.js", () => ({
  getThreadChannel: vi.fn(async () => null),
  setThreadChannel: vi.fn(),
  clearThreadChannel: vi.fn(),
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: {
    fetchGuild: vi.fn(),
    fetchChannel: vi.fn(),
    fetchGuildMember: vi.fn(),
  },
}))
vi.mock("../../v1/profiles/database.js", () => ({ getUserDiscordId: vi.fn() }))

const { ShopsV2Controller } = await import("./ShopsV2Controller.js")
const { has_permission } = await import("../../v1/util/permissions.js")
const { isContractorOwner } = await import("../../v1/contractors/database.js")
const { getShopById } =
  await import("../../../../services/shops/shop-permissions.service.js")
const { discordService } =
  await import("../../../../services/discord/discord.service.js")
const profileDb = await import("../../v1/profiles/database.js")
const { verifyDiscordThreadTarget } =
  await import("../../../../services/discord/verify-discord-target.js")

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

describe("updateShop Discord target", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.queried.length = 0
    ;(getShopById as Mock).mockResolvedValue(orgShop)
    ;(has_permission as Mock).mockResolvedValue(true)
    ;(profileDb.getUserDiscordId as Mock).mockResolvedValue(
      "111111111111111111",
    )
  })

  it("rejects a server the bot is not in, before writing anything", async () => {
    ;(discordService.fetchGuild as Mock).mockRejectedValue(
      new Error("Unknown Guild"),
    )
    ;(discordService.fetchChannel as Mock).mockRejectedValue(
      new Error("Unknown Channel"),
    )

    await expect(
      new ShopsV2Controller().updateShop(asUser("member"), "s1", {
        official_server_id: "222222222222222222",
        discord_thread_channel_id: "333333333333333333",
      }),
    ).rejects.toMatchObject({ name: "ValidationError" })
    expect(h.queried).not.toContain("shops")
  })

  it("rejects a server where the user has no admin rights", async () => {
    ;(discordService.fetchGuild as Mock).mockResolvedValue({
      id: "222222222222222222",
      owner_id: "999999999999999999",
      roles: [{ id: "222222222222222222", permissions: "0" }],
    })
    ;(discordService.fetchChannel as Mock).mockResolvedValue({
      id: "333333333333333333",
      guild_id: "222222222222222222",
    })
    ;(discordService.fetchGuildMember as Mock).mockResolvedValue({ roles: [] })

    await expect(
      new ShopsV2Controller().updateShop(asUser("member"), "s1", {
        official_server_id: "222222222222222222",
        discord_thread_channel_id: "333333333333333333",
      }),
    ).rejects.toMatchObject({ name: "ValidationError" })
    expect(h.queried).not.toContain("shops")
  })
})

describe("verifyDiscordThreadTarget", () => {
  const guild = {
    id: "222222222222222222",
    owner_id: "999999999999999999",
    roles: [
      { id: "222222222222222222", permissions: "0" },
      { id: "444444444444444444", permissions: String(1 << 5) }, // Manage Server
    ],
  }
  beforeEach(() => {
    vi.clearAllMocks()
    ;(profileDb.getUserDiscordId as Mock).mockResolvedValue(
      "111111111111111111",
    )
    ;(discordService.fetchGuild as Mock).mockResolvedValue(guild)
    ;(discordService.fetchChannel as Mock).mockResolvedValue({
      guild_id: guild.id,
    })
  })

  it("allows a member holding Manage Server", async () => {
    ;(discordService.fetchGuildMember as Mock).mockResolvedValue({
      roles: ["444444444444444444"],
    })
    expect(
      await verifyDiscordThreadTarget("u", guild.id, "333333333333333333"),
    ).toBeNull()
  })

  it("rejects a channel from another server", async () => {
    ;(discordService.fetchChannel as Mock).mockResolvedValue({
      guild_id: "555555555555555555",
    })
    expect(
      await verifyDiscordThreadTarget("u", guild.id, "333333333333333333"),
    ).toMatch(/not in that server/)
  })

  it("rejects non-numeric ids", async () => {
    expect(await verifyDiscordThreadTarget("u", "abc", "def")).toMatch(
      /numeric/,
    )
  })
})
