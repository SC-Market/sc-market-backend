/**
 * Reviews are only allowed on finished orders: fulfilled, or cancelled (a
 * no-show seller must stay reviewable). Open orders are refused with 409
 * ORDER_NOT_FINISHED.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))
vi.mock("./database.js", () => ({
  getOrder: vi.fn(),
  getOrderReview: vi.fn(async () => null),
  createOrderReview: vi.fn(async (data: object) => [
    { review_id: "r1", ...data },
  ]),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  isOrgMemberIgnoringToken: vi.fn(async () => false),
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createOrderReviewNotification: vi.fn() },
}))

const orderDb = await import("./database.js")
const { post_order_review } = await import("./reviews.js")

function res() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}

async function review(status: string, role: "customer" | "contractor") {
  ;(orderDb.getOrder as Mock).mockResolvedValue({
    order_id: "o1",
    status,
    customer_id: "buyer",
    assigned_id: "seller",
    contractor_id: null,
    shop_id: null,
  })
  const r = res()
  await post_order_review(
    {
      params: { order_id: "o1" },
      user: { user_id: role === "customer" ? "buyer" : "seller" },
      body: { content: "ok", rating: 4, role },
    } as unknown as Request,
    r,
    vi.fn(),
  )
  return r
}

beforeEach(() => vi.clearAllMocks())

describe("post_order_review status gate", () => {
  for (const status of ["not-started", "in-progress"]) {
    for (const role of ["customer", "contractor"] as const) {
      it(`refuses a ${role} review while the order is ${status}`, async () => {
        const r = await review(status, role)
        expect(r.status).toHaveBeenCalledWith(409)
        const body = (r.json as Mock).mock.calls[0][0]
        expect(body.error.code).toBe("ORDER_NOT_FINISHED")
        expect(orderDb.createOrderReview).not.toHaveBeenCalled()
      })
    }
  }

  for (const status of ["fulfilled", "cancelled"]) {
    for (const role of ["customer", "contractor"] as const) {
      it(`allows a ${role} review once the order is ${status}`, async () => {
        const r = await review(status, role)
        expect(r.status).not.toHaveBeenCalledWith(409)
        expect(orderDb.createOrderReview).toHaveBeenCalledTimes(1)
      })
    }
  }

  it("still refuses a non-party before revealing the order status", async () => {
    ;(orderDb.getOrder as Mock).mockResolvedValue({
      order_id: "o1",
      status: "in-progress",
      customer_id: "buyer",
      assigned_id: "seller",
      contractor_id: null,
      shop_id: null,
    })
    const r = res()
    await post_order_review(
      {
        params: { order_id: "o1" },
        user: { user_id: "stranger" },
        body: { content: "ok", rating: 4, role: "customer" },
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
  })
})
