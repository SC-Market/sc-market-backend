/**
 * Unit tests for DiscordService.resolveThreadConfig — the single source of the
 * server/channel that order & offer threads are created in and linked to.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

const shopFirst = vi.fn()
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => () => ({ where: () => ({ first: shopFirst }) }),
}))

vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractor: vi.fn(),
}))

vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getDiscordIntegrationSettings: vi.fn(),
}))

vi.mock("../../api/routes/v1/util/webhooks.js", () => ({}))
vi.mock("../../clients/aws/sqs.js", () => ({ sendMessage: vi.fn() }))
vi.mock("../../clients/aws/sqs-config.js", () => ({
  checkDiscordSQSConfiguration: vi.fn(),
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { discordService } from "./discord.service.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import * as profileDb from "../../api/routes/v1/profiles/database.js"

const getContractor = contractorDb.getContractor as unknown as Mock
const getUserSettings = profileDb.getDiscordIntegrationSettings as unknown as Mock

describe("resolveThreadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getContractor.mockResolvedValue({
      official_server_id: "org-server",
      discord_thread_channel_id: "org-channel",
    })
    getUserSettings.mockResolvedValue({
      official_server_id: "user-server",
      discord_thread_channel_id: "user-channel",
    })
  })

  it("prefers the shop's config when both shop values are set", async () => {
    shopFirst.mockResolvedValue({
      official_server_id: "shop-server",
      discord_thread_channel_id: "shop-channel",
    })

    const result = await discordService.resolveThreadConfig({
      shop_id: "shop-1",
      contractor_id: "org-1",
      assigned_id: "user-1",
    })

    expect(result).toEqual({
      official_server_id: "shop-server",
      discord_thread_channel_id: "shop-channel",
    })
    expect(getContractor).not.toHaveBeenCalled()
  })

  it("falls back to the org when the shop config is incomplete", async () => {
    shopFirst.mockResolvedValue({
      official_server_id: "shop-server",
      discord_thread_channel_id: null,
    })

    const result = await discordService.resolveThreadConfig({
      shop_id: "shop-1",
      contractor_id: "org-1",
      assigned_id: "user-1",
    })

    expect(result).toEqual({
      official_server_id: "org-server",
      discord_thread_channel_id: "org-channel",
    })
    expect(getUserSettings).not.toHaveBeenCalled()
  })

  it("uses the assigned user's config for non-org entities", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: null,
      contractor_id: null,
      assigned_id: "user-1",
    } as never)

    expect(result).toEqual({
      official_server_id: "user-server",
      discord_thread_channel_id: "user-channel",
    })
    expect(getUserSettings).toHaveBeenCalledWith("user-1")
  })

  it("returns nulls when nothing is configured", async () => {
    const result = await discordService.resolveThreadConfig({
      shop_id: null,
      contractor_id: null,
      assigned_id: null,
    } as never)

    expect(result).toEqual({
      official_server_id: null,
      discord_thread_channel_id: null,
    })
  })
})
