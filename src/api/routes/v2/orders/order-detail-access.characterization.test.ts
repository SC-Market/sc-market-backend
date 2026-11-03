/**
 * Characterization: who may open GET /api/v2/orders/{id} (and the public
 * API's GET /orders/{id}, which calls it) as it behaves today: the buyer,
 * the assignee, or someone who handles the order shop's orders
 * (canManageShopOrders: the owning user, or an org member with
 * manage_market or manage_orders, or an acting site admin via
 * has_permission on an org shop).
 *
 * Note what it does NOT allow, unlike v1 GET /orders/:id: a site admin on a
 * personal shop's order, and a plain org member.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request as ExpressRequest } from "express"
import { createFakeKnex, type FakeKnex } from "../../../../test-utils/fake-knex-tables.js"

const h = vi.hoisted(() => ({ db: null as unknown, perms: {} as Record<string, string[]> }))

vi.mock("../../../../clients/database/knex-db.js", async () =>
  (await import("../../../../test-utils/mock-knex-db.js")).mockKnexDb(() => h.db),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
  external_resource_regex: /^$/,
}))
vi.mock("../../v1/util/permissions.js", () => ({
  has_permission: vi.fn(async (org: string, user: string, perm: string) =>
    (h.perms[user] ?? []).includes(`${org}:${perm}`),
  ),
  is_member: vi.fn(),
}))

const { OrdersV2Controller } = await import("./OrdersV2Controller.js")

let db: FakeKnex

function seed(shop: "user" | "org") {
  db = createFakeKnex({
    accounts: [{ user_id: "buyer", username: "buyer", display_name: "Buyer", avatar: null }],
    shops: [
      shop === "user"
        ? { shop_id: "shop-1", name: "S", slug: "s", owner_user_id: "owner", owner_contractor_id: null }
        : { shop_id: "shop-1", name: "S", slug: "s", owner_user_id: null, owner_contractor_id: "org-1" },
    ],
    orders: [{ order_id: "o1", customer_id: "buyer", assigned_id: "assignee", shop_id: "shop-1", status: "not-started", cost: 5 }],
  })
  h.db = db
}

async function canOpen(userId: string, role = "user"): Promise<string> {
  const req = { user: { user_id: userId, role } } as unknown as ExpressRequest
  try {
    await new OrdersV2Controller(req).getOrderDetail("o1", req)
    return "ok"
  } catch (e) {
    return (e as Error).message
  }
}

beforeEach(() => {
  h.perms = {
    seller: ["org-1:manage_market"],
    clerk: ["org-1:manage_orders"],
    stocker: ["org-1:manage_stock"],
    claimer: ["org-1:claim_orders"],
  }
})

describe("v2 order detail: who may open it", () => {
  it("personal shop", async () => {
    seed("user")
    const rows: string[] = []
    for (const u of ["buyer", "assignee", "owner", "seller", "clerk", "stranger"]) rows.push(`${u}: ${await canOpen(u)}`)
    rows.push(`site admin: ${await canOpen("admin", "admin")}`)
    expect(rows).toMatchInlineSnapshot(`
      [
        "buyer: ok",
        "assignee: ok",
        "owner: ok",
        "seller: You do not have permission to view this order",
        "clerk: You do not have permission to view this order",
        "stranger: You do not have permission to view this order",
        "site admin: You do not have permission to view this order",
      ]
    `)
  })

  it("org shop", async () => {
    seed("org")
    const rows: string[] = []
    for (const u of ["buyer", "assignee", "seller", "clerk", "stocker", "claimer", "stranger"]) rows.push(`${u}: ${await canOpen(u)}`)
    expect(rows).toMatchInlineSnapshot(`
      [
        "buyer: ok",
        "assignee: ok",
        "seller: ok",
        "clerk: ok",
        "stocker: You do not have permission to view this order",
        "claimer: You do not have permission to view this order",
        "stranger: You do not have permission to view this order",
      ]
    `)
  })
})
