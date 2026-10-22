/**
 * Unit tests for the related_to_order middleware — who may act on an order.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response } from "express"

vi.mock("./database.js", () => ({ getOrder: vi.fn() }))
vi.mock("../util/permissions.js", () => ({ has_permission: vi.fn() }))
vi.mock("../../../../clients/database/knex-db.js", () => ({ database: {} }))

import { related_to_order } from "./middleware.js"
import * as orderDb from "./database.js"
import { has_permission } from "../util/permissions.js"

const getOrder = orderDb.getOrder as unknown as Mock
const hasPermission = has_permission as unknown as Mock

const ORG_ORDER = {
  order_id: "order-1",
  customer_id: "customer",
  assigned_id: null,
  contractor_id: "org-1",
}

function run(userId: string) {
  const req = {
    user: { user_id: userId, role: "user" },
    params: { order_id: "order-1" },
  } as unknown as Request
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response
  const next = vi.fn()
  return related_to_order(req, res, next).then(() => ({ res, next }))
}

function grant(...permissions: string[]) {
  hasPermission.mockImplementation(async (_c: string, _u: string, p: string) =>
    permissions.includes(p),
  )
}

describe("related_to_order", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOrder.mockResolvedValue(ORG_ORDER)
  })

  it("lets org members with manage_orders through", async () => {
    grant("manage_orders")
    const { next } = await run("member")
    expect(next).toHaveBeenCalled()
  })

  it("lets org members with only claim_orders through so they can self-claim", async () => {
    grant("claim_orders")
    const { next } = await run("member")
    expect(next).toHaveBeenCalled()
  })

  it("rejects org members without order permissions", async () => {
    grant()
    const { res, next } = await run("member")
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it("lets the customer through without checking org permissions", async () => {
    const { next } = await run("customer")
    expect(next).toHaveBeenCalled()
    expect(hasPermission).not.toHaveBeenCalled()
  })
})
