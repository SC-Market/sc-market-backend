/**
 * notifyNewOrder: the one set of new-order notifications, shared by an
 * accepted offer / cart checkout and Buy now (owner decision 2026-11-02).
 * What createOrderNotification sends to whom, under which settings, is the
 * characterization suite's (orders.char.test.ts, cutover.char.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DBOrder } from "../../clients/database/db-models.js"

const h = vi.hoisted(() => ({
  createOrderNotification: vi.fn(async (_o: unknown) => undefined),
  postOrderAlert: vi.fn(async (_o: unknown) => undefined),
}))
vi.mock("./notification.service.js", () => ({
  notificationService: { createOrderNotification: h.createOrderNotification },
}))
vi.mock("../discord/order-alerts.js", () => ({ postOrderAlert: h.postOrderAlert }))
vi.mock("../../logger/logger.js", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const { notifyNewOrder } = await import("./new-order.js")

const ORDER = {
  order_id: "o-1",
  customer_id: "buyer",
  shop_id: "shop-1",
  contractor_id: "org-1",
  assigned_id: null,
} as unknown as DBOrder

describe("notifyNewOrder", () => {
  beforeEach(() => {
    h.createOrderNotification.mockReset().mockResolvedValue(undefined)
    h.postOrderAlert.mockReset().mockResolvedValue(undefined)
  })

  it("sends the normal order notifications and the Discord alert post, with the order", async () => {
    await notifyNewOrder(ORDER)
    expect(h.createOrderNotification).toHaveBeenCalledWith(ORDER)
    expect(h.postOrderAlert).toHaveBeenCalledWith(ORDER)
  })

  it("a failed notification still posts the alert, and never fails the order", async () => {
    h.createOrderNotification.mockRejectedValue(new Error("db down"))
    await expect(notifyNewOrder(ORDER)).resolves.toBeUndefined()
    expect(h.postOrderAlert).toHaveBeenCalledWith(ORDER)
  })

  it("a failed alert post never fails the order", async () => {
    h.postOrderAlert.mockRejectedValue(new Error("discord down"))
    await expect(notifyNewOrder(ORDER)).resolves.toBeUndefined()
  })
})
