import { describe, it, expect } from "vitest"
import {
  allowedOrderActions,
  canChangeOrderStatus,
  isOrderClosed,
  nextOrderFields,
  ORDER_STATUS_VALUES,
  type OrderStatusActor,
} from "./order-status.rules.js"

const personal = (status = "not-started") => ({
  status,
  contractor_id: null,
  assigned_id: "assignee",
  customer_id: "customer",
})
const org = (status = "not-started") => ({
  status,
  contractor_id: "org-1",
  assigned_id: "assignee",
  customer_id: "customer",
})
const actor = (
  userId: string,
  extra: Partial<OrderStatusActor> = {},
): OrderStatusActor => ({
  userId,
  isSiteAdmin: false,
  isOrgManager: false,
  ...extra,
})
const ADMIN = actor("admin", { isSiteAdmin: true })
const MANAGER = actor("manager", { isOrgManager: true })

function verdict(
  order: ReturnType<typeof org>,
  a: OrderStatusActor,
  status: string,
) {
  const d = canChangeOrderStatus(order, a, status)
  return d.allowed ? "ok" : `${d.httpStatus} ${d.reason}`
}

describe("canChangeOrderStatus", () => {
  it.each([
    // [order, actor, status, expected]
    ["personal", "assignee", "not-started", "ok"],
    ["personal", "assignee", "in-progress", "ok"],
    ["personal", "assignee", "fulfilled", "ok"],
    ["personal", "assignee", "cancelled", "ok"],
    ["personal", "customer", "in-progress", "403 forbidden"],
    ["personal", "customer", "fulfilled", "403 forbidden"],
    ["personal", "customer", "cancelled", "ok"],
    ["personal", "stranger", "cancelled", "ok"], // the route's access check limits who gets here
    ["personal", "stranger", "fulfilled", "403 forbidden"],
    ["personal", "manager", "fulfilled", "403 forbidden"], // org permission means nothing without an org
    ["personal", "admin", "fulfilled", "ok"],
    ["org", "assignee", "fulfilled", "ok"],
    ["org", "manager", "in-progress", "ok"],
    ["org", "manager", "cancelled", "ok"],
    ["org", "customer", "cancelled", "ok"],
    ["org", "customer", "fulfilled", "403 forbidden"],
    ["org", "stranger", "cancelled", "403 forbidden"],
    ["org", "admin", "fulfilled", "403 forbidden"], // admins pass org orders only through has_permission (isOrgManager)
  ] as const)("%s order, %s -> %s: %s", (kind, who, status, expected) => {
    const a = who === "admin" ? ADMIN : who === "manager" ? MANAGER : actor(who)
    expect(verdict(kind === "org" ? org() : personal(), a, status)).toBe(
      expected,
    )
  })

  it("refuses an unknown status first, with the 400 message", () => {
    expect(
      canChangeOrderStatus(org("fulfilled"), actor("stranger"), "shipped"),
    ).toEqual({
      allowed: false,
      httpStatus: 400,
      reason: "invalid_status",
      message: "Invalid status!",
    })
  })

  it("locks closed orders for everyone but a site admin", () => {
    for (const closed of ["fulfilled", "cancelled"]) {
      expect(verdict(org(closed), MANAGER, "not-started")).toBe("400 closed")
      expect(verdict(personal(closed), actor("assignee"), "in-progress")).toBe(
        "400 closed",
      )
      expect(verdict(personal(closed), ADMIN, "in-progress")).toBe("ok")
    }
  })

  it("keeps the messages callers answer with", () => {
    const p = canChangeOrderStatus(personal(), actor("customer"), "fulfilled")
    const o = canChangeOrderStatus(org(), actor("stranger"), "cancelled")
    expect(p.allowed === false && p.message).toBe(
      "Only the assigned user may set the status of this order to fulfilled",
    )
    expect(o.allowed === false && o.message).toBe(
      "You may not set the status of this order to cancelled",
    )
  })
})

describe("isOrderClosed", () => {
  it.each([
    ["fulfilled", true],
    ["cancelled", true],
    ["not-started", false],
    ["in-progress", false],
  ])("%s -> %s", (status, closed) => expect(isOrderClosed(status)).toBe(closed))
})

describe("allowedOrderActions", () => {
  it("customer of an open org order may only cancel", () => {
    expect(allowedOrderActions(org(), actor("customer"))).toEqual({
      fulfilled: false,
      "in-progress": false,
      "not-started": false,
      cancelled: true,
    })
  })
  it("org manager may do everything on an open order, nothing on a closed one", () => {
    expect(
      Object.values(allowedOrderActions(org(), MANAGER)).every(Boolean),
    ).toBe(true)
    expect(
      Object.values(allowedOrderActions(org("fulfilled"), MANAGER)).some(
        Boolean,
      ),
    ).toBe(false)
  })
  it("covers every status", () => {
    expect(Object.keys(allowedOrderActions(personal(), ADMIN)).sort()).toEqual(
      [...ORDER_STATUS_VALUES].sort(),
    )
  })
})

describe("nextOrderFields", () => {
  const now = new Date("2026-11-03T00:00:00Z")
  it.each([
    ["in-progress", { status: "in-progress", assigned_id: "me" }],
    ["fulfilled", { status: "fulfilled", fulfilled_at: now }],
    ["cancelled", { status: "cancelled" }],
    ["not-started", { status: "not-started" }],
  ] as const)("%s", (status, fields) =>
    expect(nextOrderFields(status, "me", now)).toEqual(fields),
  )
})
