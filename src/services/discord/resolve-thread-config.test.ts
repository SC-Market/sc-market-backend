/**
 * Unit tests for DiscordService.resolveThreadConfig — the single source of the
 * server/channel that order & offer threads are created in and linked to.
 * The channels themselves live in discord_channel_setups (see
 * channel-setups.pg.test.ts for the database side).
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("./channel-setups.js", () => ({ getThreadChannel: vi.fn() }))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({}))
vi.mock("../../api/routes/v1/util/webhooks.js", () => ({}))
vi.mock("../../clients/aws/sqs.js", () => ({ sendMessage: vi.fn() }))
vi.mock("../../clients/aws/sqs-config.js", () => ({
  checkDiscordSQSConfiguration: vi.fn(),
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { discordService } from "./discord.service.js"
import { getThreadChannel } from "./channel-setups.js"

const getThread = getThreadChannel as unknown as Mock

const channels: Record<string, { guild_id: string; channel_id: string }> = {
  "shop:shop-1": { guild_id: "1000000000000000001", channel_id: "2000000000000000001" },
  "org:org-1": { guild_id: "1000000000000000002", channel_id: "2000000000000000002" },
  "user:user-1": { guild_id: "1000000000000000003", channel_id: "2000000000000000003" },
}

describe("resolveThreadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getThread.mockImplementation(
      async ({ owner_type, owner_id }: { owner_type: string; owner_id: string }) =>
        channels[`${owner_type}:${owner_id}`] ?? null,
    )
  })

  it("prefers the shop's own thread channel", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: "shop-1",
      contractor_id: "org-1",
      assigned_id: "user-1",
    })

    expect(result).toEqual(channels["shop:shop-1"])
    expect(getThread).toHaveBeenCalledTimes(1)
  })

  it("uses the org's channel when the shop has none of its own", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: "shop-2",
      contractor_id: "org-1",
      assigned_id: "user-1",
    })

    expect(result).toEqual(channels["org:org-1"])
    expect(getThread).not.toHaveBeenCalledWith({ owner_type: "user", owner_id: "user-1" })
  })

  it("does not fall through to the assignee for org work", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: null,
      contractor_id: "org-without-channel",
      assigned_id: "user-1",
    } as never)

    expect(result).toBeNull()
  })

  it("uses the assigned user's channel for personal work", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: null,
      contractor_id: null,
      assigned_id: "user-1",
    } as never)

    expect(result).toEqual(channels["user:user-1"])
  })

  it("returns null when nothing is set up", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: null,
      contractor_id: null,
      assigned_id: null,
    } as never)

    expect(result).toBeNull()
  })
})
