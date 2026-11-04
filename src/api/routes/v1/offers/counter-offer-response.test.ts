/**
 * A counter-offer (PUT /api/offer/:session_id with a CounterOfferBody)
 * answers `{ data: { result: "Success" } }`, like the other changes on this
 * route (reject, assign); it used to answer `{ data: { status: "Success" } }`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("./database.js", () => ({
  createOrderOffer: vi.fn(async () => [{ id: "offer-2" }]),
  updateOrderOffer: vi.fn(),
}))
vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn(async () => ({ user_id: "customer" })),
}))
vi.mock("../market/helpers.js", () => ({
  verify_listings: vi.fn(async () => []),
}))
vi.mock("./counter-offer-items.js", () => ({
  validateCounterOfferItems: vi.fn(async () => null),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(),
}))
vi.mock("../orders/helpers.js", () => ({
  validateOrderLimits: vi.fn(),
  initiateOrder: vi.fn(),
  runOrderCreatedSideEffects: vi.fn(),
}))
vi.mock("../../../../services/allocation/stock-timing.service.js", () => ({
  getShopV2StockPolicy: vi.fn(async () => ({ hold_on_offer: false })),
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: vi.fn(async () => undefined),
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createOfferNotification: vi.fn() },
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: { sendOfferStatusUpdate: vi.fn() },
}))
vi.mock("../chats/database.js", () => ({
  getChat: vi.fn(async () => ({ chat_id: "chat-1" })),
}))
vi.mock("../chats/helpers.js", () => ({ sendSystemMessage: vi.fn() }))

const { offer_put_session_id } = await import("./controller.js")
const offerDb = await import("./database.js")

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: Mock; json: Mock }
}

describe("PUT /api/offer/:session_id counter-offer", () => {
  beforeEach(() => vi.clearAllMocks())

  it("answers { data: { result } } like the route's other changes", async () => {
    const req = {
      user: { user_id: "customer", username: "customer", role: "user" },
      params: { session_id: "session-1" },
      offer_session: {
        id: "session-1",
        customer_id: "customer",
        assigned_id: "seller",
        contractor_id: null,
        shop_id: null,
        status: "active",
      },
      most_recent_offer: { id: "offer-1", actor_id: "seller" },
      body: {
        session_id: "session-1",
        status: "counteroffered",
        kind: "Delivery",
        cost: "1000",
        title: "Counter",
        description: "Counter-offer",
        payment_type: "one-time",
        market_listings: [],
      },
    } as unknown as Request
    const res = mockRes()
    await offer_put_session_id(req, res, vi.fn())
    expect(res.status).not.toHaveBeenCalled()
    expect(offerDb.updateOrderOffer).toHaveBeenCalledWith("offer-1", {
      status: "counteroffered",
    })
    expect(res.json).toHaveBeenCalledWith({ data: { result: "Success" } })
  })
})
