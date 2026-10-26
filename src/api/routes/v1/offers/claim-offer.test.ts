/**
 * Claiming an org offer on the site (PUT /api/offer/:session_id with
 * { assigned_to: <self> }) must follow the same rule as the Discord Claim
 * button (clients/discord_api/claim.ts): an org member with Claim Orders may
 * claim an active, unassigned offer for themselves. Before this, both
 * related_to_offer and can_respond_to_offer demanded manage_orders, so those
 * members got a 403 on the site while the same click in Discord worked.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { Request, Response, NextFunction, RequestHandler } from "express"

vi.mock("./database.js", () => ({
  getOfferSessions: vi.fn(),
  getMostRecentOrderOffer: vi.fn(),
  updateOfferSession: vi.fn(),
}))
vi.mock("../util/permissions.js", () => ({
  has_permission: vi.fn(),
  is_member: vi.fn(),
}))
vi.mock("../profiles/database.js", () => ({ getUser: vi.fn() }))
vi.mock("../../../../clients/database/knex-db.js", () => ({ database: {} }))
vi.mock("../../../../clients/cdn/cdn.js", () => ({ cdn: {} }))

import { related_to_offer, can_respond_to_offer } from "./middleware.js"
import { offer_put_session_id } from "./controller.js"
import * as offerDb from "./database.js"
import * as profileDb from "../profiles/database.js"
import { has_permission, is_member } from "../util/permissions.js"

const getOfferSessions = offerDb.getOfferSessions as unknown as Mock
const getMostRecentOrderOffer = offerDb.getMostRecentOrderOffer as unknown as Mock
const updateOfferSession = offerDb.updateOfferSession as unknown as Mock
const getUser = profileDb.getUser as unknown as Mock
const hasPermission = has_permission as unknown as Mock
const isMember = is_member as unknown as Mock

const ORG_OFFER = {
  id: "session-1",
  customer_id: "customer",
  assigned_id: null as string | null,
  contractor_id: "org-1",
  status: "active",
}

function grant(...permissions: string[]) {
  hasPermission.mockImplementation(async (_c: string, _u: string, p: string) =>
    permissions.includes(p),
  )
}

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & { status: Mock; json: Mock }
}

/** Run the PUT /api/offer/:session_id chain: related_to_offer → can_respond_to_offer → handler. */
async function put(userId: string, username: string, body: Record<string, unknown>) {
  const req = {
    user: { user_id: userId, username, role: "user" },
    params: { session_id: ORG_OFFER.id },
    body,
  } as unknown as Request
  const res = mockRes()
  const chain: RequestHandler[] = [
    related_to_offer as RequestHandler,
    can_respond_to_offer as RequestHandler,
    offer_put_session_id,
  ]
  for (const handler of chain) {
    let advanced = false
    const next: NextFunction = () => {
      advanced = true
    }
    await handler(req, res, next)
    if (!advanced) break
  }
  return res
}

describe("claiming an org offer on the site", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getOfferSessions.mockResolvedValue([{ ...ORG_OFFER }])
    // The customer acted last, so it's the seller's turn to respond.
    getMostRecentOrderOffer.mockResolvedValue({ id: "offer-1", actor_id: "customer" })
    getUser.mockImplementation(async ({ username }: { username: string }) => ({
      user_id: `${username}-id`,
      username,
    }))
    // Everyone is an org member unless a test says otherwise.
    isMember.mockResolvedValue(true)
  })

  it("lets a member with only Claim Orders claim an unassigned offer for themselves", async () => {
    grant("claim_orders")
    const res = await put("member-id", "member", { assigned_to: "member" })
    expect(res.status).not.toHaveBeenCalledWith(403)
    expect(updateOfferSession).toHaveBeenCalledWith("session-1", { assigned_id: "member-id" })
  })

  it("lets a Claim Orders member claim even when it's the customer's turn", async () => {
    grant("claim_orders")
    getMostRecentOrderOffer.mockResolvedValue({ id: "offer-1", actor_id: "member-id" })
    const res = await put("member-id", "member", { assigned_to: "member" })
    expect(res.status).not.toHaveBeenCalledWith(403)
    expect(updateOfferSession).toHaveBeenCalledWith("session-1", { assigned_id: "member-id" })
  })

  it("does not let a Claim Orders member assign the offer to someone else", async () => {
    grant("claim_orders")
    const res = await put("member-id", "member", { assigned_to: "other" })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(updateOfferSession).not.toHaveBeenCalled()
  })

  it("does not let a Claim Orders member take an offer that is already claimed", async () => {
    grant("claim_orders")
    getOfferSessions.mockResolvedValue([{ ...ORG_OFFER, assigned_id: "someone" }])
    const res = await put("member-id", "member", { assigned_to: "member" })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(updateOfferSession).not.toHaveBeenCalled()
  })

  it("does not let a Claim Orders member claim a closed offer", async () => {
    grant("claim_orders")
    getOfferSessions.mockResolvedValue([{ ...ORG_OFFER, status: "closed" }])
    const res = await put("member-id", "member", { assigned_to: "member" })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(updateOfferSession).not.toHaveBeenCalled()
  })

  it("still rejects members without Claim Orders or Manage Orders", async () => {
    grant()
    const res = await put("member-id", "member", { assigned_to: "member" })
    expect(res.status).toHaveBeenCalledWith(403)
    expect(updateOfferSession).not.toHaveBeenCalled()
  })

  it("lets Manage Orders members assign the offer to another member", async () => {
    grant("manage_orders")
    const res = await put("manager-id", "manager", { assigned_to: "other" })
    expect(res.status).not.toHaveBeenCalledWith(403)
    expect(updateOfferSession).toHaveBeenCalledWith("session-1", { assigned_id: "other-id" })
  })

  it("refuses assigning the offer to someone outside the org", async () => {
    grant("manage_orders")
    isMember.mockImplementation(async (_c: string, u: string) => u !== "outsider-id")
    const res = await put("manager-id", "manager", { assigned_to: "outsider" })
    expect(res.status).toHaveBeenCalledWith(400)
    expect(updateOfferSession).not.toHaveBeenCalled()
  })

  it("still makes Claim Orders members unable to accept the offer", async () => {
    grant("claim_orders")
    const res = await put("member-id", "member", { status: "accepted" })
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
