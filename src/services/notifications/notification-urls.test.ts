/**
 * Where tapping each notification takes you. Every push payload's data.url
 * must open the page for that event (not a generic list or an admin page).
 * Paths are checked against the site's routes (frontend App.tsx).
 */
import { describe, it, expect, vi, beforeAll } from "vitest"

vi.mock("../../api/routes/v1/contractors/database.js", () => ({
  getContractor: vi.fn(async () => ({
    contractor_id: "org-1",
    spectrum_id: "ACME CO",
    name: "Acme Co",
  })),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getUser: vi.fn(async () => ({ username: "alice", avatar: null })),
}))
vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn(async () => null) },
}))

import * as f from "./notification-payload-formatters.js"
import * as v2 from "./notification-payload-formatters-v2.js"

const BASE = "https://sc-market.space"
const path = (url?: string) => (url ?? "").replace(BASE, "")

beforeAll(() => {
  process.env.FRONTEND_URL = BASE
})

const order = {
  order_id: "o1",
  title: "T",
  cost: "1",
  status: "not-started",
} as never
const session = { id: "s1" } as never
const message = { message_id: "m1", author: "u1", content: "hi" } as never

describe("push notification destinations", () => {
  it("orders open the order; order chat opens that chat", async () => {
    expect(
      path(f.formatOrderNotificationPayload(order, "order_create").data?.url),
    ).toBe("/contract/o1")
    expect(
      path(
        (await f.formatOrderMessageNotificationPayload(order, message, "c1"))
          .data?.url,
      ),
    ).toBe("/messages/c1")
    expect(
      path(
        (await f.formatOrderMessageNotificationPayload(order, message)).data
          ?.url,
      ),
    ).toBe("/contract/o1")
  })

  it("offers open the offer; offer chat opens that chat", async () => {
    expect(
      path(f.formatOfferNotificationPayload(session, "create").data?.url),
    ).toBe("/offer/s1")
    expect(
      path(
        (await f.formatOfferMessageNotificationPayload(session, message, "c2"))
          .data?.url,
      ),
    ).toBe("/messages/c2")
  })

  it("reviews open the order", () => {
    const review = { review_id: "r1", order_id: "o1" } as never
    expect(path(f.formatOrderReviewNotificationPayload(review).data?.url)).toBe(
      "/contract/o1",
    )
    expect(
      path(f.formatOrderReviewRevisionNotificationPayload(review).data?.url),
    ).toBe("/contract/o1")
  })

  it("a bid opens the listing", () => {
    const listing = {
      listing: { listing_id: "l1" },
      details: { title: "X" },
    } as never
    expect(
      path(
        f.formatMarketBidNotificationPayload(listing, { bid_id: "b1" } as never)
          .data?.url,
      ),
    ).toBe("/market/l1")
  })

  it("an org invite opens the org's page, where it can be accepted or declined", async () => {
    const p = await f.formatContractorInviteNotificationPayload({
      invite_id: "i1",
      contractor_id: "org-1",
    } as never)
    expect(path(p.data?.url)).toBe("/contractor/ACME%20CO")
    expect(p.body).toContain("Acme Co")
  })

  it("an admin alert opens its link, else the notifications page (not /admin)", () => {
    expect(
      f.formatAdminAlertNotificationPayload({
        alert_id: "a",
        title: "t",
        content: "c",
        link: "https://x.test/news",
      } as never).data?.url,
    ).toBe("https://x.test/news")
    expect(
      path(
        f.formatAdminAlertNotificationPayload({
          alert_id: "a",
          title: "t",
          content: "c",
          link: null,
        } as never).data?.url,
      ),
    ).toBe("/notifications")
  })

  it("V2: a new order opens the order page (/contract, not /orders/:id)", () => {
    const p = v2.formatNewOrderNotificationPayloadV2({
      order_id: "o9",
      total_price: 1,
      items: [],
    } as never)
    expect(path(p.data?.url)).toBe("/contract/o9")
  })
})
