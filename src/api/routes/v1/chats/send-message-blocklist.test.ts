/**
 * A customer on a shop's blocklist could keep messaging the shop through an
 * order/offer chat: the shop blocklist was never consulted.
 */

import { describe, it, expect, vi } from "vitest"
import type { Request, Response } from "express"

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  isBlockedFromShop: vi.fn(async () => true),
}))
vi.mock("./database.js", () => ({ insertMessage: vi.fn() }))
vi.mock("../../../../clients/messaging/websocket.js", () => ({
  chatServer: { emitMessage: vi.fn() },
}))

const chatDb = await import("./database.js")
const { sendMessage } = await import("./controller.js")

describe("sendMessage", () => {
  it("refuses a customer the shop has blocked", async () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response
    await sendMessage(
      {
        user: { user_id: "buyer" },
        body: { content: "hi" },
        chat: { chat_id: "c1" },
        order: { order_id: "o1", shop_id: "s1", customer_id: "buyer" },
      } as unknown as Request,
      res,
      vi.fn(),
    )
    expect(res.status).toHaveBeenCalledWith(403)
    expect(chatDb.insertMessage).not.toHaveBeenCalled()
  })
})
