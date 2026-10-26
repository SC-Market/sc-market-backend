import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request, Response, NextFunction } from "express"

/**
 * Chat access control must fail closed:
 * - a non-participant of a plain DM (no order_id / session_id) is denied;
 * - related_to_chat must stop after the 403 instead of falling through to next().
 */

const h = vi.hoisted(() => ({
  participants: [] as string[],
  relatedToOrder: false,
  relatedToOffer: false,
}))

vi.mock("./database.js", () => ({
  getChatParticipants: vi.fn(async () => h.participants),
  getChat: vi.fn(),
}))
vi.mock("../orders/database.js", () => ({
  getOrder: vi.fn(async ({ order_id }: { order_id: string }) => ({ order_id })),
}))
vi.mock("../offers/database.js", () => ({
  getOfferSessions: vi.fn(async ({ id }: { id: string }) => [{ id }]),
}))
vi.mock("../orders/helpers.js", () => ({
  is_related_to_order: vi.fn(async () => h.relatedToOrder),
}))
vi.mock("../offers/helpers.js", () => ({
  is_related_to_offer: vi.fn(async () => h.relatedToOffer),
}))

const { can_view_chat, related_to_chat } = await import("./middleware.js")

const outsider = { user_id: "outsider" } as never
const dm = { chat_id: "c1", order_id: null, session_id: null } as never

describe("can_view_chat", () => {
  beforeEach(() => {
    h.participants = ["alice", "bob"]
    h.relatedToOrder = false
    h.relatedToOffer = false
  })

  it("denies a non-participant of a DM with no order or session", async () => {
    expect((await can_view_chat(outsider, dm)).result).toBe(false)
  })

  it("allows a participant of a DM", async () => {
    expect(
      (await can_view_chat({ user_id: "alice" } as never, dm)).result,
    ).toBe(true)
  })

  it("allows a non-participant related to the chat's order", async () => {
    h.relatedToOrder = true
    const chat = { chat_id: "c2", order_id: "o1", session_id: null } as never
    expect((await can_view_chat(outsider, chat)).result).toBe(true)
  })

  it("denies a non-participant unrelated to the chat's order", async () => {
    const chat = { chat_id: "c2", order_id: "o1", session_id: null } as never
    expect((await can_view_chat(outsider, chat)).result).toBe(false)
  })

  it("denies a non-participant unrelated to the chat's offer session", async () => {
    const chat = { chat_id: "c3", order_id: null, session_id: "s1" } as never
    expect((await can_view_chat(outsider, chat)).result).toBe(false)
  })
})

describe("related_to_chat", () => {
  it("does not call next() after responding 403", async () => {
    h.participants = ["alice", "bob"]
    const req = { user: outsider, chat: dm } as unknown as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response
    const next = vi.fn() as NextFunction
    await related_to_chat(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
