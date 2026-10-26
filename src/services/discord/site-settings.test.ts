import { describe, expect, it, vi, beforeEach } from "vitest"

const discord = vi.hoisted(() => ({
  fetchGuild: vi.fn(),
  fetchChannel: vi.fn(),
}))
vi.mock("./discord.service.js", () => ({ discordService: discord }))
vi.mock("../../logger/logger.js", () => ({ default: { debug: vi.fn() } }))

const { describeThreadChannel } = await import("./site-settings.js")

/** The shape of @discordjs/rest's DiscordAPIError that matters here. */
function discordError(code: number, message: string) {
  return Object.assign(new Error(message), { name: "DiscordAPIError", code, status: 403 })
}

const ref = { guild_id: "111111111111111111", channel_id: "222222222222222222" }

describe("describeThreadChannel", () => {
  beforeEach(() => {
    discord.fetchGuild.mockResolvedValue({ id: ref.guild_id, name: "Guild", icon: null })
  })

  it("reports a channel the bot can see", async () => {
    discord.fetchChannel.mockResolvedValue({ name: "orders" })
    const d = await describeThreadChannel(ref)
    expect(d).toMatchObject({ channel_name: "orders", guild_name: "Guild", bot_can_see_channel: true })
  })

  it.each([
    [50001, "Missing Access"],
    [10003, "Unknown Channel"],
  ])("Discord error %i (%s) is a 'bot can't see this channel' state, not an error", async (code, message) => {
    discord.fetchChannel.mockRejectedValue(discordError(code, message))
    const d = await describeThreadChannel(ref)
    expect(d).toMatchObject({ channel_id: ref.channel_id, channel_name: null, bot_can_see_channel: false })
  })

  it("other failures leave the state unknown", async () => {
    discord.fetchChannel.mockRejectedValue(new Error("socket hang up"))
    const d = await describeThreadChannel(ref)
    expect(d.bot_can_see_channel).toBeNull()
  })

  it("no channel configured", async () => {
    expect((await describeThreadChannel(null)).bot_can_see_channel).toBeNull()
  })
})
