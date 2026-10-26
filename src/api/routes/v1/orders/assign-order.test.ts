/**
 * Assigning an org order (PUT /api/orders/:order_id { assigned_to }) checked
 * the ASSIGNER's org membership where it meant the ASSIGNEE's. So a manager
 * could assign any account on the site, even one outside the org, and an
 * acting site admin (manage_orders via the admin bypass, but not a member)
 * was refused when assigning a real member.
 *
 * Rule: the assigner needs manage_orders (or claim_orders for a self-claim of
 * an unassigned order), and the assignee must be a member of the org.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(),
  is_member: vi.fn(),
}))
vi.mock("../contractors/database.js", () => ({
  getContractor: vi.fn(async ({ contractor_id }: { contractor_id: string }) => ({
    contractor_id,
  })),
  getContractorRoleLegacy: vi.fn(),
}))
vi.mock("../profiles/database.js", () => ({
  getUser: vi.fn(async ({ username }: { username: string }) => ({
    user_id: `${username}-id`,
    username,
  })),
}))
vi.mock("./database.js", () => ({
  updateOrder: vi.fn(async (order_id: string, body: object) => [
    { order_id, ...body },
  ]),
}))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createOrderAssignedNotification: vi.fn() },
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: { sendOrderAssignedMessage: vi.fn() },
}))
vi.mock("../../../../services/chats/chat-participant.service.js", () => ({
  chatParticipantService: { ensureOrderChatParticipants: vi.fn() },
}))

const { has_permission, is_member } = await import("../util/permissions.js")
const orderDb = await import("./database.js")
const { handleAssignedUpdate } = await import("./helpers.js")

const hasPermission = has_permission as unknown as Mock
const isMember = is_member as unknown as Mock
const updateOrder = orderDb.updateOrder as unknown as Mock

const ORDER = { order_id: "o1", contractor_id: "org-1", assigned_id: null }

function grant(...permissions: string[]) {
  hasPermission.mockImplementation(async (_c: string, _u: string, p: string) =>
    permissions.includes(p),
  )
}
function members(...userIds: string[]) {
  isMember.mockImplementation(async (_c: string, u: string) =>
    userIds.includes(u),
  )
}
function mockRes() {
  const res: { statusCode?: number; body?: unknown; headersSent: boolean } & Record<string, unknown> = {
    headersSent: false,
  }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((body: unknown) => {
    res.body = body
    res.headersSent = true
    return res
  })
  return res
}

async function assign(asUser: string, assigned_to: string) {
  const res = mockRes()
  await handleAssignedUpdate(
    {
      order: { ...ORDER },
      user: { user_id: `${asUser}-id`, username: asUser },
      body: { assigned_to },
    },
    res,
  )
  return res
}

describe("handleAssignedUpdate: who may be assigned", () => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses a manager assigning someone outside the org (was allowed)", async () => {
    grant("manage_orders")
    members("manager-id")
    const res = await assign("manager", "outsider")
    expect(res.statusCode).toBe(400)
    expect(updateOrder).not.toHaveBeenCalled()
    expect(isMember).toHaveBeenCalledWith("org-1", "outsider-id")
  })

  it("lets a non-member with manage_orders (acting site admin) assign a member (was refused)", async () => {
    grant("manage_orders")
    members("clerk-id")
    const res = await assign("admin", "clerk")
    expect(res.statusCode).toBeUndefined()
    expect(updateOrder).toHaveBeenCalledWith("o1", { assigned_id: "clerk-id" })
  })

  it("lets a manager assign another member", async () => {
    grant("manage_orders")
    members("manager-id", "clerk-id")
    const res = await assign("manager", "clerk")
    expect(res.statusCode).toBeUndefined()
    expect(updateOrder).toHaveBeenCalledWith("o1", { assigned_id: "clerk-id" })
  })

  it("lets a Claim Orders member claim an unassigned order for themselves", async () => {
    grant("claim_orders")
    members("clerk-id")
    const res = await assign("clerk", "clerk")
    expect(res.statusCode).toBeUndefined()
    expect(updateOrder).toHaveBeenCalledWith("o1", { assigned_id: "clerk-id" })
  })

  it("lets a manager assign a member who has no Claim Orders permission", async () => {
    // Only the manager holds manage_orders; the clerk holds nothing.
    hasPermission.mockImplementation(
      async (_c: string, u: string, p: string) =>
        u === "manager-id" && p === "manage_orders",
    )
    members("manager-id", "clerk-id")
    const res = await assign("manager", "clerk")
    expect(res.statusCode).toBeUndefined()
    expect(updateOrder).toHaveBeenCalledWith("o1", { assigned_id: "clerk-id" })
    expect(hasPermission).not.toHaveBeenCalledWith("org-1", "clerk-id", "claim_orders")
  })

  it("refuses a member without Claim Orders claiming the order for themselves", async () => {
    grant()
    members("clerk-id")
    const res = await assign("clerk", "clerk")
    expect(res.statusCode).toBe(403)
    expect(updateOrder).not.toHaveBeenCalled()
  })

  it("does not let a Claim Orders member assign someone else", async () => {
    grant("claim_orders")
    members("clerk-id", "other-id")
    const res = await assign("clerk", "other")
    expect(res.statusCode).toBe(403)
    expect(updateOrder).not.toHaveBeenCalled()
  })
})
