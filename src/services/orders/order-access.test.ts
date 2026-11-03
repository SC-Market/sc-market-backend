import { describe, it, expect } from "vitest"
import {
  canActOnOffer,
  canActOnOrder,
  canRespondToOffer,
  canViewOrder,
  canViewOrderDetailV2,
  isRelatedToOffer,
} from "./order-access.js"

const personal = { customer_id: "customer", assigned_id: "assignee", contractor_id: null }
const org = { customer_id: "customer", assigned_id: "assignee", contractor_id: "org-1" }

describe("canActOnOrder", () => {
  it.each([
    [personal, { userId: "customer", isSiteAdmin: false }, true],
    [personal, { userId: "assignee", isSiteAdmin: false }, true],
    [personal, { userId: "admin", isSiteAdmin: true }, true],
    [personal, { userId: "manager", isSiteAdmin: false, orgManager: true }, false], // no org: perms mean nothing
    [org, { userId: "manager", isSiteAdmin: false, orgManager: true }, true],
    [org, { userId: "claimer", isSiteAdmin: false, orgClaimer: true }, true],
    [org, { userId: "member", isSiteAdmin: false }, false],
    [org, { userId: "stranger", isSiteAdmin: false }, false],
  ])("%#", (order, actor, expected) => expect(canActOnOrder(order, actor)).toBe(expected))

  it("offers use the same rule", () => expect(canActOnOffer).toBe(canActOnOrder))
})

describe("canViewOrder (v1 detail, chats)", () => {
  it.each([
    [personal, { userId: "customer", isSiteAdmin: false, isOrgMember: false }, true],
    [personal, { userId: "assignee", isSiteAdmin: false, isOrgMember: false }, true],
    [personal, { userId: "admin", isSiteAdmin: true, isOrgMember: false }, true],
    [personal, { userId: "x", isSiteAdmin: false, isOrgMember: true }, false], // no org to be a member of
    [org, { userId: "member", isSiteAdmin: false, isOrgMember: true }, true], // any member, no permission needed
    [org, { userId: "stranger", isSiteAdmin: false, isOrgMember: false }, false],
  ])("%#", (order, viewer, expected) => expect(canViewOrder(order, viewer)).toBe(expected))
})

describe("canViewOrderDetailV2", () => {
  it.each([
    [{ userId: "customer", handlesShopOrders: false }, true],
    [{ userId: "assignee", handlesShopOrders: false }, true],
    [{ userId: "seller", handlesShopOrders: true }, true],
    [{ userId: "stranger", handlesShopOrders: false }, false],
  ])("%#", (viewer, expected) => expect(canViewOrderDetailV2(org, viewer)).toBe(expected))
})

describe("isRelatedToOffer (offer chats)", () => {
  it.each([
    [personal, { userId: "customer" }, true],
    [personal, { userId: "assignee" }, true],
    [personal, { userId: "manager", orgManager: true }, false],
    [org, { userId: "manager", orgManager: true }, true],
    [org, { userId: "claimer" }, false],
    [org, { userId: "stranger" }, false],
  ])("%#", (session, viewer, expected) => expect(isRelatedToOffer(session, viewer)).toBe(expected))
})

describe("canRespondToOffer", () => {
  const active = (s: typeof personal | typeof org) => ({ ...s, status: "active" })
  it.each([
    // [session, last actor, user, expected]
    [active(personal), "customer", { userId: "assignee" }, true],
    [active(personal), "customer", { userId: "customer" }, false],
    [active(personal), "assignee", { userId: "customer" }, true],
    [active(personal), "assignee", { userId: "assignee" }, false],
    [active(org), "customer", { userId: "manager", orgManager: true }, true],
    [active(org), "customer", { userId: "assignee" }, false], // the assignee needs manage_orders on an org offer
    [active(org), "manager", { userId: "customer" }, true],
    [active(org), "manager", { userId: "manager", orgManager: true }, false],
  ] as const)("%#", (session, last, user, expected) => expect(canRespondToOffer(session, last, user)).toBe(expected))

  it("nobody responds to a session that isn't active", () => {
    for (const status of ["closed", "accepted", "rejected"])
      expect(canRespondToOffer({ ...personal, status }, "customer", { userId: "assignee" })).toBe(false)
  })
})
