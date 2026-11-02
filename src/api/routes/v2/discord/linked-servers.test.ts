/**
 * Threads and alerts in a Discord server linked by the install flow
 * (DiscordLinkedServersV2Controller). Linking, permissions, channel setups and
 * Discord are mocked; this checks who may do what and which channels may be
 * picked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Request } from "express"

const h = vi.hoisted(() => ({
  resolve: vi.fn(),
  mayManage: vi.fn(),
  isLinked: vi.fn(),
  listIds: vi.fn(),
  unlink: vi.fn(),
  listOwner: vi.fn(),
  setThread: vi.fn(),
  addFeed: vi.fn(),
  removeKind: vi.fn(),
  channels: vi.fn(),
  guild: vi.fn(),
}))
vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(
    () => ({}),
  ),
)
vi.mock("../../../../services/discord/linked-guilds.js", () => ({
  GUILD_ID: /^[0-9]{15,22}$/,
  resolveLinkedGuildOwner: h.resolve,
  mayManageOwnerDiscord: h.mayManage,
  isGuildLinked: h.isLinked,
  listLinkedGuildIds: h.listIds,
  unlinkGuild: h.unlink,
}))
vi.mock("../../../../services/discord/channel-setups.js", () => ({
  listOwner: h.listOwner,
  setThreadChannel: h.setThread,
  addFeedChannel: h.addFeed,
  removeKind: h.removeKind,
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: { fetchGuildChannels: h.channels, fetchGuild: h.guild },
}))

const { DiscordLinkedServersV2Controller } =
  await import("./DiscordLinkedServersV2Controller.js")

const USER = "11111111-2222-4333-8444-555555555555"
const SHOP = "aaaaaaaa-2222-4333-8444-555555555555"
const GUILD = "223456789012345678"
const TEXT = "323456789012345678"
const FORUM = "423456789012345678"
const VOICE = "523456789012345678"
const OWNER = { owner_type: "shop", owner_id: SHOP }

const req = { user: { user_id: USER } } as unknown as Request
const controller = () => new DiscordLinkedServersV2Controller()

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.resolve.mockResolvedValue({ ...OWNER, path_key: "my-shop" })
  h.mayManage.mockResolvedValue(true)
  h.isLinked.mockResolvedValue(true)
  h.listOwner.mockResolvedValue([])
  h.guild.mockResolvedValue({ id: GUILD, name: "Traders", icon: null })
  h.channels.mockResolvedValue([
    { id: TEXT, type: 0, name: "orders", position: 1 },
    { id: FORUM, type: 15, name: "order-posts", position: 2 },
    { id: VOICE, type: 2, name: "voice", position: 0 },
  ])
})

describe("DiscordLinkedServersV2Controller", () => {
  it("refuses someone who may not manage the shop's Discord integration", async () => {
    h.mayManage.mockResolvedValue(false)
    await expect(
      controller().getLinkedDiscordServers(req, SHOP),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      controller().updateLinkedDiscordServer(req, GUILD, {
        shop: SHOP,
        thread_channel_id: TEXT,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(h.setThread).not.toHaveBeenCalled()
  })

  it("only targets servers linked to that owner", async () => {
    h.isLinked.mockResolvedValue(false)
    await expect(
      controller().updateLinkedDiscordServer(req, GUILD, {
        shop: SHOP,
        thread_channel_id: TEXT,
      }),
    ).rejects.toMatchObject({ name: "NotFoundError" })
    await expect(
      controller().unlinkDiscordServer(req, GUILD, SHOP),
    ).rejects.toMatchObject({ name: "NotFoundError" })
    expect(h.setThread).not.toHaveBeenCalled()
    expect(h.unlink).not.toHaveBeenCalled()
  })

  it("only takes channels of that server, of a kind that fits", async () => {
    await expect(
      controller().updateLinkedDiscordServer(req, GUILD, {
        shop: SHOP,
        thread_channel_id: VOICE,
      }),
    ).rejects.toThrow(/text or forum/)
    await expect(
      controller().updateLinkedDiscordServer(req, GUILD, {
        shop: SHOP,
        alert_channel_ids: [FORUM],
      }),
    ).rejects.toThrow(/text or announcement/)
    await expect(
      controller().updateLinkedDiscordServer(req, GUILD, {
        shop: SHOP,
        thread_channel_id: "623456789012345678",
      }),
    ).rejects.toThrow(/text or forum/)
    expect(h.setThread).not.toHaveBeenCalled()
    expect(h.addFeed).not.toHaveBeenCalled()
  })

  it("sets order threads and alerts in the linked server", async () => {
    const out = await controller().updateLinkedDiscordServer(req, GUILD, {
      shop: SHOP,
      thread_channel_id: FORUM,
      alert_channel_ids: [TEXT],
    })
    expect(h.setThread).toHaveBeenCalledWith(
      OWNER,
      { guild_id: GUILD, channel_id: FORUM },
      null,
    )
    expect(h.addFeed).toHaveBeenCalledWith(
      OWNER,
      { guild_id: GUILD, channel_id: TEXT },
      null,
      "alerts",
    )
    expect(out.channels.map((c) => c.channel_id)).toEqual([TEXT, FORUM])
    expect(out).toMatchObject({
      guild_id: GUILD,
      name: "Traders",
      bot_in_server: true,
    })
  })

  it("says so when the bot left the server", async () => {
    h.channels.mockRejectedValue(
      Object.assign(new Error("Missing Access"), { code: 50001 }),
    )
    h.listIds.mockResolvedValue([GUILD])
    const { servers } = await controller().getLinkedDiscordServers(req, SHOP)
    expect(servers).toEqual([
      expect.objectContaining({
        guild_id: GUILD,
        bot_in_server: false,
        channels: [],
        name: null,
      }),
    ])
    await expect(
      controller().updateLinkedDiscordServer(req, GUILD, {
        shop: SHOP,
        thread_channel_id: TEXT,
      }),
    ).rejects.toThrow(/isn't in that server/)
  })
})
