/**
 * Characterization: the order status and order access rules as they behave
 * today, run through the real call sites (applyOrderStatusChange,
 * userRelatedToOrder, is_related_to_order). Written before the rules moved
 * into services/orders/, so the move can't change who may do what.
 *
 * Every row is a fact about current behaviour, including the odd ones (see
 * the comments). An intended change must show up here as a reviewed diff.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

const h = vi.hoisted(() => ({
  perms: {} as Record<string, string[]>,
  memberOf: {} as Record<string, string[]>,
}))

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../clients/database/transaction.js", () => ({
  withTransaction: vi.fn(async () => 0),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(async (org: string, user: string, perm: string) =>
    (h.perms[user] ?? []).includes(`${org}:${perm}`),
  ),
  is_member: vi.fn(),
}))
vi.mock("../contractors/database.js", () => ({
  getUserContractors: vi.fn(async (q: Record<string, string>) =>
    (h.memberOf[q["contractor_members.user_id"]] ?? []).map(
      (contractor_id) => ({ contractor_id }),
    ),
  ),
}))
vi.mock("./database.js", () => ({
  updateOrder: vi.fn(async (order_id: string, body: object) => [
    { order_id, ...body },
  ]),
  trackOrderResponse: vi.fn(),
}))
vi.mock("../market/database.js", () => ({
  getMarketListingOrders: vi.fn(async () => []),
}))
vi.mock("../offers/database.js", () => ({
  getOfferSessions: vi.fn(async () => []),
}))
vi.mock("../chats/database.js", () => ({
  getChat: vi.fn(async () => ({ chat_id: "chat-1" })),
}))
vi.mock("../chats/helpers.js", () => ({ sendSystemMessage: vi.fn() }))
vi.mock("../../../../services/notifications/notification.service.js", () => ({
  notificationService: { createOrderStatusNotification: vi.fn() },
}))
vi.mock("../../../../services/discord/discord.service.js", () => ({
  discordService: {
    assignUserToThread: vi.fn(),
    sendOrderStatusUpdate: vi.fn(),
  },
}))
vi.mock("../../../../services/allocation/order-lifecycle.service.js", () => ({
  OrderLifecycleService: class {
    releaseAllocationsForOrder = vi.fn()
    consumeAllocationsForOrder = vi.fn()
  },
}))
vi.mock(
  "../../../../services/allocation/v2-order-allocation.service.js",
  () => ({
    autoAllocateOrder: vi.fn(),
    markOrderAllocationsFulfilled: vi.fn(),
    releaseOrderAllocations: vi.fn(),
  }),
)
vi.mock("../../../../services/shops/shop-metrics.service.js", () => ({
  refreshShopMetrics: vi.fn(async () => undefined),
}))

const {
  applyOrderStatusChange,
  userRelatedToOrderForTest,
  is_related_to_order,
  OrderStatusChangeError,
} = await (async () => {
  const helpers = await import("./helpers.js")
  const middleware = await import("./middleware.js")
  return {
    ...helpers,
    userRelatedToOrderForTest: middleware.userRelatedToOrder,
  }
})()
const orderDb = await import("./database.js")
const { notificationService } =
  await import("../../../../services/notifications/notification.service.js")
const { discordService } =
  await import("../../../../services/discord/discord.service.js")

const updateOrder = orderDb.updateOrder as unknown as Mock

type Actor =
  | "admin"
  | "assignee"
  | "customer"
  | "manager"
  | "claimer"
  | "member"
  | "stranger"
const USERS: Record<Actor, { user_id: string; role: string }> = {
  admin: { user_id: "admin", role: "admin" },
  assignee: { user_id: "assignee", role: "user" },
  customer: { user_id: "customer", role: "user" },
  manager: { user_id: "manager", role: "user" },
  claimer: { user_id: "claimer", role: "user" },
  member: { user_id: "member", role: "user" },
  stranger: { user_id: "stranger", role: "user" },
}

function order(
  kind: "personal" | "org",
  status: string,
  assigned: string | null = "assignee",
) {
  return {
    order_id: "order-1",
    customer_id: "customer",
    assigned_id: assigned,
    contractor_id: kind === "org" ? "org-1" : null,
    status,
    thread_id: "thread-1",
    shop_id: null,
    offer_session_id: null,
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  h.perms = {
    manager: ["org-1:manage_orders"],
    claimer: ["org-1:claim_orders"],
  }
  h.memberOf = {
    manager: ["org-1"],
    claimer: ["org-1"],
    member: ["org-1"],
    assignee: ["org-1"],
  }
})

async function outcome(
  o: never,
  actor: Actor,
  status: string,
): Promise<string> {
  try {
    await applyOrderStatusChange(o, USERS[actor] as never, status)
  } catch (e) {
    if (e instanceof OrderStatusChangeError)
      return `${e.status} ${e.reason}: ${e.message}`
    throw e
  }
  return "ok " + JSON.stringify(updateOrder.mock.calls.map((c) => c[1]))
}

describe("applyOrderStatusChange: who may set which status", () => {
  const ACTORS: Actor[] = [
    "admin",
    "assignee",
    "customer",
    "manager",
    "claimer",
    "member",
    "stranger",
  ]
  const STATUSES = ["not-started", "in-progress", "fulfilled", "cancelled"]

  it("personal order (no org), open", async () => {
    const rows: string[] = []
    for (const actor of ACTORS)
      for (const s of STATUSES) {
        updateOrder.mockClear()
        rows.push(
          `${actor} -> ${s}: ${(await outcome(order("personal", "in-progress"), actor, s)).replace(/"fulfilled_at":"[^"]+"/, '"fulfilled_at":<date>')}`,
        )
      }
    // Note: on a personal order ANYONE reaching this function may cancel
    // (the route's related_to_order middleware limits who reaches it).
    expect(rows).toMatchInlineSnapshot(`
      [
        "admin -> not-started: ok [{"status":"not-started"}]",
        "admin -> in-progress: ok [{"status":"in-progress","assigned_id":"admin"}]",
        "admin -> fulfilled: ok [{"status":"fulfilled","fulfilled_at":<date>}]",
        "admin -> cancelled: ok [{"status":"cancelled"}]",
        "assignee -> not-started: ok [{"status":"not-started"}]",
        "assignee -> in-progress: ok [{"status":"in-progress","assigned_id":"assignee"}]",
        "assignee -> fulfilled: ok [{"status":"fulfilled","fulfilled_at":<date>}]",
        "assignee -> cancelled: ok [{"status":"cancelled"}]",
        "customer -> not-started: 403 forbidden: Only the assigned user may set the status of this order to not-started",
        "customer -> in-progress: 403 forbidden: Only the assigned user may set the status of this order to in-progress",
        "customer -> fulfilled: 403 forbidden: Only the assigned user may set the status of this order to fulfilled",
        "customer -> cancelled: ok [{"status":"cancelled"}]",
        "manager -> not-started: 403 forbidden: Only the assigned user may set the status of this order to not-started",
        "manager -> in-progress: 403 forbidden: Only the assigned user may set the status of this order to in-progress",
        "manager -> fulfilled: 403 forbidden: Only the assigned user may set the status of this order to fulfilled",
        "manager -> cancelled: ok [{"status":"cancelled"}]",
        "claimer -> not-started: 403 forbidden: Only the assigned user may set the status of this order to not-started",
        "claimer -> in-progress: 403 forbidden: Only the assigned user may set the status of this order to in-progress",
        "claimer -> fulfilled: 403 forbidden: Only the assigned user may set the status of this order to fulfilled",
        "claimer -> cancelled: ok [{"status":"cancelled"}]",
        "member -> not-started: 403 forbidden: Only the assigned user may set the status of this order to not-started",
        "member -> in-progress: 403 forbidden: Only the assigned user may set the status of this order to in-progress",
        "member -> fulfilled: 403 forbidden: Only the assigned user may set the status of this order to fulfilled",
        "member -> cancelled: ok [{"status":"cancelled"}]",
        "stranger -> not-started: 403 forbidden: Only the assigned user may set the status of this order to not-started",
        "stranger -> in-progress: 403 forbidden: Only the assigned user may set the status of this order to in-progress",
        "stranger -> fulfilled: 403 forbidden: Only the assigned user may set the status of this order to fulfilled",
        "stranger -> cancelled: ok [{"status":"cancelled"}]",
      ]
    `)
  })

  it("org order, open", async () => {
    const rows: string[] = []
    for (const actor of ACTORS)
      for (const s of STATUSES) {
        updateOrder.mockClear()
        rows.push(
          `${actor} -> ${s}: ${(await outcome(order("org", "not-started"), actor, s)).replace(/"fulfilled_at":"[^"]+"/, '"fulfilled_at":<date>')}`,
        )
      }
    // The admin row passes only because has_permission is mocked false for
    // them here; in production has_permission answers true for an acting
    // site admin, so admins pass the org branch through it.
    expect(rows).toMatchInlineSnapshot(`
      [
        "admin -> not-started: 403 forbidden: You may not set the status of this order to not-started",
        "admin -> in-progress: 403 forbidden: You may not set the status of this order to in-progress",
        "admin -> fulfilled: 403 forbidden: You may not set the status of this order to fulfilled",
        "admin -> cancelled: 403 forbidden: You may not set the status of this order to cancelled",
        "assignee -> not-started: ok [{"status":"not-started"}]",
        "assignee -> in-progress: ok [{"status":"in-progress","assigned_id":"assignee"}]",
        "assignee -> fulfilled: ok [{"status":"fulfilled","fulfilled_at":<date>}]",
        "assignee -> cancelled: ok [{"status":"cancelled"}]",
        "customer -> not-started: 403 forbidden: You may not set the status of this order to not-started",
        "customer -> in-progress: 403 forbidden: You may not set the status of this order to in-progress",
        "customer -> fulfilled: 403 forbidden: You may not set the status of this order to fulfilled",
        "customer -> cancelled: ok [{"status":"cancelled"}]",
        "manager -> not-started: ok [{"status":"not-started"}]",
        "manager -> in-progress: ok [{"status":"in-progress","assigned_id":"manager"}]",
        "manager -> fulfilled: ok [{"status":"fulfilled","fulfilled_at":<date>}]",
        "manager -> cancelled: ok [{"status":"cancelled"}]",
        "claimer -> not-started: 403 forbidden: You may not set the status of this order to not-started",
        "claimer -> in-progress: 403 forbidden: You may not set the status of this order to in-progress",
        "claimer -> fulfilled: 403 forbidden: You may not set the status of this order to fulfilled",
        "claimer -> cancelled: 403 forbidden: You may not set the status of this order to cancelled",
        "member -> not-started: 403 forbidden: You may not set the status of this order to not-started",
        "member -> in-progress: 403 forbidden: You may not set the status of this order to in-progress",
        "member -> fulfilled: 403 forbidden: You may not set the status of this order to fulfilled",
        "member -> cancelled: 403 forbidden: You may not set the status of this order to cancelled",
        "stranger -> not-started: 403 forbidden: You may not set the status of this order to not-started",
        "stranger -> in-progress: 403 forbidden: You may not set the status of this order to in-progress",
        "stranger -> fulfilled: 403 forbidden: You may not set the status of this order to fulfilled",
        "stranger -> cancelled: 403 forbidden: You may not set the status of this order to cancelled",
      ]
    `)
  })

  it("closed orders are locked for everyone but a site admin", async () => {
    const rows: string[] = []
    for (const closed of ["fulfilled", "cancelled"])
      for (const actor of ["admin", "assignee", "customer"] as Actor[]) {
        updateOrder.mockClear()
        rows.push(
          `${closed} ${actor} -> not-started: ${await outcome(order("personal", closed), actor, "not-started")}`,
        )
      }
    expect(rows).toMatchInlineSnapshot(`
      [
        "fulfilled admin -> not-started: ok [{"status":"not-started"}]",
        "fulfilled assignee -> not-started: 400 closed: Cannot change status for closed order",
        "fulfilled customer -> not-started: 400 closed: Cannot change status for closed order",
        "cancelled admin -> not-started: ok [{"status":"not-started"}]",
        "cancelled assignee -> not-started: 400 closed: Cannot change status for closed order",
        "cancelled customer -> not-started: 400 closed: Cannot change status for closed order",
      ]
    `)
  })

  it("an unknown status is refused before anything else, even for a closed order", async () => {
    expect(
      await outcome(order("org", "fulfilled"), "stranger", "shipped"),
    ).toBe("400 invalid_status: Invalid status!")
    expect(await outcome(order("org", "open"), "admin", "")).toBe(
      "400 invalid_status: Invalid status!",
    )
  })

  it("a test account with role admin is not a site admin", async () => {
    const fakeAdmin = { user_id: "x", role: "admin", is_test: true }
    await expect(
      applyOrderStatusChange(
        order("personal", "fulfilled"),
        fakeAdmin as never,
        "cancelled",
      ),
    ).rejects.toThrow("Cannot change status for closed order")
  })

  it("side effects of an allowed change still run, in order", async () => {
    await applyOrderStatusChange(
      order("personal", "not-started"),
      USERS.assignee as never,
      "in-progress",
    )
    expect(discordService.assignUserToThread).toHaveBeenCalledWith(
      "thread-1",
      "assignee",
    )
    expect(orderDb.trackOrderResponse).toHaveBeenCalledWith(
      "order-1",
      "assignee",
      undefined,
    )
    expect(
      notificationService.createOrderStatusNotification,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: "order-1" }),
      "in-progress",
      "assignee",
    )
    expect(discordService.sendOrderStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "in-progress",
    )
  })

  it("a refused change has no side effects", async () => {
    await outcome(order("org", "not-started"), "stranger", "fulfilled")
    expect(updateOrder).not.toHaveBeenCalled()
    expect(
      notificationService.createOrderStatusNotification,
    ).not.toHaveBeenCalled()
    expect(discordService.sendOrderStatusUpdate).not.toHaveBeenCalled()
  })
})

describe("who may see or act on an order", () => {
  const ACTORS: Actor[] = [
    "admin",
    "assignee",
    "customer",
    "manager",
    "claimer",
    "member",
    "stranger",
  ]

  it("userRelatedToOrder (v1 order routes, public API): customer, assignee, admin, or org manage_orders / claim_orders", async () => {
    const rows: string[] = []
    for (const kind of ["personal", "org"] as const)
      for (const actor of ACTORS)
        rows.push(
          `${kind} ${actor}: ${await userRelatedToOrderForTest(order(kind, "not-started"), USERS[actor] as never)}`,
        )
    expect(rows).toMatchInlineSnapshot(`
      [
        "personal admin: true",
        "personal assignee: true",
        "personal customer: true",
        "personal manager: false",
        "personal claimer: false",
        "personal member: false",
        "personal stranger: false",
        "org admin: true",
        "org assignee: true",
        "org customer: true",
        "org manager: true",
        "org claimer: true",
        "org member: false",
        "org stranger: false",
      ]
    `)
  })

  it("is_related_to_order (v1 GET /orders/:id, chat access): customer, assignee, admin, or ANY member of the order's org", async () => {
    const rows: string[] = []
    for (const kind of ["personal", "org"] as const)
      for (const actor of ACTORS)
        rows.push(
          `${kind} ${actor}: ${await is_related_to_order(order(kind, "not-started"), USERS[actor] as never)}`,
        )
    // Differs from userRelatedToOrder: a plain org member (no permission) may
    // view, while a claim_orders member who isn't in the members list may not.
    expect(rows).toMatchInlineSnapshot(`
      [
        "personal admin: true",
        "personal assignee: true",
        "personal customer: true",
        "personal manager: false",
        "personal claimer: false",
        "personal member: false",
        "personal stranger: false",
        "org admin: true",
        "org assignee: true",
        "org customer: true",
        "org manager: true",
        "org claimer: true",
        "org member: true",
        "org stranger: false",
      ]
    `)
  })
})
