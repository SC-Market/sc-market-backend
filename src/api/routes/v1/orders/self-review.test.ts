/**
 * Sellers could review their own orders (buying from their own shop or org)
 * to inflate ratings.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: {
    knex: () => ({
      where: () => ({
        first: async () => ({
          owner_user_id: null,
          owner_contractor_id: "org",
        }),
      }),
    }),
  },
  getKnex: vi.fn(),
}))
vi.mock("./database.js", () => ({
  getOrder: vi.fn(),
  getOrderReview: vi.fn(async () => null),
  createOrderReview: vi.fn(),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  isOrgMemberIgnoringToken: vi.fn(async () => false),
}))

const orderDb = await import("./database.js")
const { isOrgMemberIgnoringToken: is_member } = await import("../util/permissions.js")
const { post_order_review } = await import("./reviews.js")

function res() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
}
const body = { content: "great", rating: 5, role: "customer" }

beforeEach(() => vi.clearAllMocks())

describe("post_order_review", () => {
  it("refuses a customer reviewing an order they also sold (assigned)", async () => {
    ;(orderDb.getOrder as Mock).mockResolvedValue({
      order_id: "o1",
      customer_id: "me",
      assigned_id: "me",
      contractor_id: null,
      shop_id: null,
    })
    const r = res()
    await post_order_review(
      {
        params: { order_id: "o1" },
        user: { user_id: "me" },
        body,
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
    expect(orderDb.getOrderReview).not.toHaveBeenCalled()
  })

  it("refuses a customer who is a member of the shop's owning org", async () => {
    ;(orderDb.getOrder as Mock).mockResolvedValue({
      order_id: "o1",
      customer_id: "me",
      assigned_id: null,
      contractor_id: null,
      shop_id: "s1",
    })
    ;(is_member as Mock).mockResolvedValue(true)
    const r = res()
    await post_order_review(
      {
        params: { order_id: "o1" },
        user: { user_id: "me" },
        body,
      } as unknown as Request,
      r,
      vi.fn(),
    )
    expect(r.status).toHaveBeenCalledWith(403)
  })
})
