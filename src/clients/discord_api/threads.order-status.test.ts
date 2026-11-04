/**
 * POST /threads/order/status (the bot's /order status) has the same access
 * check as v1 PUT /orders/:id and the public API (userRelatedToOrder): a
 * linked Discord user who isn't party to the order is refused before any
 * status change is tried.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import express from "express"
import request from "supertest"

vi.mock("../database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../api/routes/v1/orders/database.js", () => ({
  getOrder: vi.fn(),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUserByDiscordId: vi.fn(),
}))
vi.mock("../../api/routes/v1/orders/helpers.js", () => ({
  handleStatusUpdate: vi.fn(),
}))
vi.mock("../../api/routes/v1/util/permissions.js", () => ({
  has_permission: vi.fn(async () => false),
  is_member: vi.fn(async () => false),
}))
vi.mock("../messaging/websocket.js", () => ({ chatServer: {} }))
vi.mock("../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const { threadRouter } = await import("./threads.js")
const orderDb = await import("../../api/routes/v1/orders/database.js")
const profileDb = await import("../../api/routes/v1/profiles/database.js")
const { handleStatusUpdate } =
  await import("../../api/routes/v1/orders/helpers.js")

const USERS: Record<string, { user_id: string; role: string }> = {
  "d-customer": { user_id: "customer", role: "user" },
  "d-assignee": { user_id: "assignee", role: "user" },
  "d-stranger": { user_id: "stranger", role: "user" },
}

function app() {
  const a = express()
  a.use(express.json())
  a.use("/threads", threadRouter)
  return a
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(orderDb.getOrder as Mock).mockResolvedValue({
    order_id: "order-1",
    customer_id: "customer",
    assigned_id: "assignee",
    contractor_id: null,
    status: "in-progress",
    thread_id: "thread-1",
  })
  ;(profileDb.getUserByDiscordId as Mock).mockImplementation(
    async (id: string) => USERS[id] ?? null,
  )
})

describe("POST /threads/order/status", () => {
  it("refuses a linked Discord user who isn't party to the order", async () => {
    const res = await request(app())
      .post("/threads/order/status")
      .send({
        order_id: "order-1",
        discord_id: "d-stranger",
        status: "cancelled",
      })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({
      error: "You are not authorized to change this order",
    })
    expect(handleStatusUpdate).not.toHaveBeenCalled()
  })

  it.each(["d-customer", "d-assignee"])(
    "lets the order's party %s through to the status rules",
    async (discord_id) => {
      const res = await request(app())
        .post("/threads/order/status")
        .send({ thread_id: "thread-1", discord_id, status: "cancelled" })
      expect(res.status).toBe(200)
      expect(handleStatusUpdate).toHaveBeenCalledTimes(1)
    },
  )
})
