/**
 * Buy-order match alerts push a listing link to buyers, who are strangers to
 * the seller. They used to fire for every new listing, so org-internal
 * (private) and link-only (unlisted) listings were pushed to non-members, and
 * the link pointed at /market/listing/<id>, which is not a route.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import knexFactory from "knex"
import { MockClient, createTracker, type Tracker } from "knex-mock-client"

const h = vi.hoisted(() => ({ db: null as unknown, send: vi.fn() }))
vi.mock("../../clients/database/knex-db.js", () => ({
  getKnex: () => h.db,
  database: { knex: () => h.db },
}))
vi.mock("../push-notifications/push-notification.service.js", () => ({
  pushNotificationService: { sendPushNotification: h.send },
}))

const { checkBuyOrderMatches } = await import("./buy-order-matching.service.js")

const LISTING_ID = "abcdef12-3456-4789-8abc-def012345678"
const MATCH = {
  listing_id: LISTING_ID,
  game_item_id: "item-1",
  shop_id: "shop-1",
  price: 1000,
  title: "Pembroke Helmet",
}

let tracker: Tracker

function setup(listingRow: Record<string, unknown> | undefined) {
  const db = knexFactory({ client: MockClient, dialect: "pg" })
  h.db = db
  tracker = createTracker(db)
  tracker.on.select(/from "listings"/).response(listingRow)
  tracker.on.select(/from "shops"/).response({ shop_id: "shop-1", owner_user_id: "seller" })
  tracker.on
    .select(/from "buy_orders_v2"/)
    .response([{ buy_order_id: "bo-1", buyer_id: "buyer", game_item_name: "Pembroke Helmet" }])
}

beforeEach(() => {
  h.send.mockReset()
  h.send.mockResolvedValue(undefined)
})

describe("buy-order match alerts", () => {
  it("only consider the listing if it is publicly listed (active + public)", async () => {
    setup(undefined)
    await checkBuyOrderMatches(MATCH)
    const q = tracker.history.select.find((x) => x.sql.includes('from "listings"'))
    expect(q?.sql).toMatch(/"l"\."status" = (\?|\$\d+) and \("l"\."visibility" = (\?|\$\d+)\)/)
    expect(q?.bindings).toEqual(expect.arrayContaining([LISTING_ID, "active", "public"]))
  })

  it("never alert on a private, unlisted or inactive listing", async () => {
    // The publicly-listed lookup finds nothing for such a listing.
    setup(undefined)
    await checkBuyOrderMatches(MATCH)
    expect(h.send).not.toHaveBeenCalled()
    expect(tracker.history.select.some((x) => x.sql.includes("buy_orders_v2"))).toBe(false)
  })

  it("alert the buyer about a public listing, linking to its market page", async () => {
    setup({ listing_id: LISTING_ID, title: "Pembroke Helmet" })
    await checkBuyOrderMatches(MATCH)
    expect(h.send).toHaveBeenCalledTimes(1)
    const [buyer, payload, action] = h.send.mock.calls[0]
    expect(buyer).toBe("buyer")
    expect(action).toBe("buy_order_match")
    expect(payload.data.url).toMatch(/\/market\/abcdef12--pembroke-helmet$/)
  })
})
