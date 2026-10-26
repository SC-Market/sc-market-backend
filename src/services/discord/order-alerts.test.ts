/**
 * Offer alerts posted to the channels set up with /setup alerts. The Claim button only
 * works for org offers (claim_orders is an org permission), so personal alert
 * channels must not show one: it could only ever reply "cannot be claimed".
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import { createFakeKnex, type FakeKnex } from "../../test-utils/fake-knex-tables.js"

const state: { db: FakeKnex } = { db: createFakeKnex() }

vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => state.db,
  database: {},
}))
vi.mock("./channel-setups.js", () => ({
  getAlertChannels: vi.fn(
    async (target: { shop_id?: string | null; contractor_id?: string | null; user_id?: string | null }) => {
      if (target.contractor_id === "org-1") return ["chan-org"]
      if (target.user_id === "seller-1") return ["chan-me"]
      return []
    },
  ),
}))
vi.mock("../../services/discord/discord.service.js", () => ({
  discordService: { postChannelMessage: vi.fn(async () => undefined) },
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUser: vi.fn(async () => ({
    user_id: "cust-1",
    username: "buyer",
    display_name: "Buyer",
    avatar: null,
  })),
}))
vi.mock("../../api/routes/v1/offers/database.js", () => ({
  getMostRecentOrderOffer: vi.fn(async () => ({
    id: "offer-1",
    title: "Medical Supplies",
    description: "x5 please",
    cost: "5000",
    kind: "Delivery",
    collateral: null,
  })),
}))
vi.mock("../../api/routes/v1/market/database.js", () => ({
  getOfferMarketListings: vi.fn(async () => []),
  getMarketListingComplete: vi.fn(async () => null),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { postOfferAlert } from "./order-alerts.js"
import { discordService } from "../../services/discord/discord.service.js"
import { getAlertChannels } from "./channel-setups.js"
import type { DBOfferSession } from "../../clients/database/db-models.js"

const postChannelMessage = discordService.postChannelMessage as unknown as Mock

function session(overrides: Partial<DBOfferSession>): DBOfferSession {
  return {
    id: "sess-1",
    customer_id: "cust-1",
    assigned_id: null,
    contractor_id: null,
    status: "active",
    ...overrides,
  } as DBOfferSession
}

describe("postOfferAlert", () => {
  beforeEach(() => {
    postChannelMessage.mockClear()
    state.db = createFakeKnex()
  })

  it("adds a Claim Offer button for an org offer", async () => {
    await postOfferAlert(session({ contractor_id: "org-1", shop_id: "shop-1" }))

    expect(getAlertChannels).toHaveBeenLastCalledWith({
      shop_id: "shop-1",
      contractor_id: "org-1",
      user_id: null,
    })
    expect(postChannelMessage).toHaveBeenCalledTimes(1)
    const [channel, message] = postChannelMessage.mock.calls[0]
    expect(channel).toBe("chan-org")
    expect(message.components).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "Claim Offer", custom_id: "claim_offer:sess-1" },
        ],
      },
    ])
  })

  it("posts a personal offer alert without a Claim button", async () => {
    await postOfferAlert(session({ assigned_id: "seller-1" }))

    expect(postChannelMessage).toHaveBeenCalledTimes(1)
    const [channel, message] = postChannelMessage.mock.calls[0]
    expect(channel).toBe("chan-me")
    expect(message.components).toEqual([])
    expect(message.embeds[0].title).toBe("New Offer: Medical Supplies")
  })
})
