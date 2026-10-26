/**
 * Characterization: market (bid) and V2 order-push notifications as they behave
 * today (see orders.char.test.ts).
 */
import { describe, expect, it } from "vitest"
import * as w from "../../../test-utils/notif-char/world.js"
import { notificationService } from "../notification.service.js"
import { ListingsV2Controller } from "../../../api/routes/v2/listings/ListingsV2Controller.js"
import type { DBMarketBid, DBMarketListingComplete } from "../../../clients/database/db-models.js"

/** The V1 listing shape the V1 bid route passes (market listings V1 tables are legacy). */
function v1Listing(id: string, seller: { user_seller_id?: string; contractor_seller_id?: string }) {
  return {
    type: "unique",
    listing: {
      listing_id: id,
      sale_type: "auction",
      price: 1000,
      quantity_available: 1,
      status: "active",
      internal: false,
      user_seller_id: seller.user_seller_id ?? null,
      contractor_seller_id: seller.contractor_seller_id ?? null,
      timestamp: new Date("2026-10-01T00:00:00Z"),
      expiration: new Date("2026-11-01T00:00:00Z"),
    },
    details: { title: "Auctioned Gladius", description: "", item_type: "Ship", item_name: null, game_item_id: null },
    images: [],
    accept_offers: false,
    details_id: id,
  } as unknown as DBMarketListingComplete
}

describe("market_item_bid (10), V1 route", () => {
  it("org seller: manage_market members get in-app + push; push ignores org-scoped prefs; no email; webhook", async () => {
    const bidder = await w.user("bidder")
    const boss = await w.user("boss")
    const trader = await w.user("trader")
    const clerk = await w.user("clerk")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: trader, perms: ["manage_market"] },
      { user: clerk, perms: ["manage_orders"] },
    ])
    await w.emailOptIn(boss, ["market_item_bid"], acme)
    await w.emailOptIn(trader, ["market_item_bid"])
    await w.pushPref(boss, "market_item_bid", false, acme)
    await w.pushPref(trader, "market_item_bid", false)
    await w.webhook("org-hook", { org: acme }, ["market_item_bid"])
    const bid = {
      bid_id: "00000000-0000-4000-8999-000000000b1d",
      user_bidder_id: bidder.user_id,
      contractor_bidder_id: null,
      listing_id: "00000000-0000-4000-8999-0000000001a1",
      bid: 1500,
      timestamp: new Date("2026-10-20T00:00:00Z"),
    } as unknown as DBMarketBid
    w.nameId(bid.bid_id, "bid:b1")
    w.nameId(bid.listing_id, "listing:v1")

    await notificationService.createMarketBidNotification(
      v1Listing(bid.listing_id, { contractor_seller_id: acme.contractor_id }),
      bid,
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss market_item_bid (bid:b1)",
        "in_app  user:trader market_item_bid (bid:b1)",
        "push    push:trader [market_listing] New Bid",
        "webhook org-hook SC Market - Bid Received",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })

  it("personal seller", async () => {
    const bidder = await w.user("bidder")
    const seller = await w.user("seller")
    await w.webhook("seller-hook", { user: seller }, ["market_item_bid"])
    const bid = {
      bid_id: "00000000-0000-4000-8999-000000000b2d",
      user_bidder_id: bidder.user_id,
      listing_id: "00000000-0000-4000-8999-0000000001a2",
      bid: 900,
      timestamp: new Date("2026-10-20T00:00:00Z"),
    } as unknown as DBMarketBid
    w.nameId(bid.bid_id, "bid:b2")
    w.nameId(bid.listing_id, "listing:v1b")

    await notificationService.createMarketBidNotification(
      v1Listing(bid.listing_id, { user_seller_id: seller.user_id }),
      bid,
    )

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:seller market_item_bid (bid:b2)",
        "push    push:seller [market_listing] New Bid",
        "webhook seller-hook SC Market - Bid Received",
      ]
    `)
  })
})

describe("market_item_bid (10), V2 auctions", () => {
  it("org shop: manage_market members; shop and org webhooks (deduplicated)", async () => {
    const bidder = await w.user("bidder")
    const boss = await w.user("boss")
    const trader = await w.user("trader")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: trader, perms: ["manage_market"] },
    ])
    const shop = await w.shop("acme-shop", { org: acme })
    await w.pushPref(boss, "market_item_bid", false, acme)
    await w.webhook("shop-hook", shop, ["market_item_bid"])
    await w.webhook("org-hook", { org: acme }, ["market_item_bid"])
    const { listing_id } = await w.listing("auction", {
      shop,
      seller: { org: acme },
      title: "Prospector auction",
      price: 1000000,
      saleType: "auction",
    })

    // What AuctionsV2Controller.placeBid does after the bid commits.
    const detail = await new ListingsV2Controller().getListingDetail(listing_id)
    await notificationService.createMarketBidNotificationV2(
      detail,
      1200000,
      bidder.user_id,
      "00000000-0000-4000-8999-000000000b3d",
    )
    w.nameId("00000000-0000-4000-8999-000000000b3d", "bid:b3")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "in_app  user:boss market_item_bid (bid:b3)",
        "in_app  user:trader market_item_bid (bid:b3)",
        "push    push:trader [market_listing_v2] New Bid",
        "webhook shop-hook SC Market - Bid Received",
        "webhook org-hook SC Market - Bid Received",
      ]
    `)
    expect(obs).toMatchSnapshot()
  })
})

describe("market_item_offer (11)", () => {
  it("has no sender: the uncalled createMarketOfferNotification(V2) were deleted", () => {
    expect("createMarketOfferNotification" in notificationService).toBe(false)
    expect("createMarketOfferNotificationV2" in notificationService).toBe(false)
  })
})

describe("V2 order push (order_create_v2, no action row)", () => {
  it("createNewOrderNotificationV2 (direct buy-order purchase): push only, ungated, org manage_orders", async () => {
    const buyer = await w.user("buyer")
    const boss = await w.user("boss")
    const clerk = await w.user("clerk")
    const acme = await w.org("acme", [
      { user: boss, perms: "owner" },
      { user: clerk, perms: ["manage_orders"] },
    ])
    const shop = await w.shop("acme-shop", { org: acme })
    // There is no order_create_v2 action, so these preferences cannot apply.
    await w.pushPref(boss, "order_create", false, acme)
    await w.pushPref(boss, "order_create", false)

    await notificationService.createNewOrderNotificationV2(
      {
        order_id: "00000000-0000-4000-8999-0000000000c1",
        buyer_id: buyer.user_id,
        shop_id: shop.shop_id,
        total_price: 30000,
        status: "not-started",
        created_at: "2026-10-20T00:00:00.000Z",
        items: [
          {
            order_item_id: "00000000-0000-4000-8999-0000000000d1",
            listing_id: "00000000-0000-4000-8999-0000000000e1",
            item_id: "00000000-0000-4000-8999-0000000000f1",
            listing_title: "Quantanium",
            variant: { variant_id: "v", attributes: { quality_tier: 4 }, display_name: "Tier 4", short_name: "T4" },
            quantity: 3,
            price_per_unit: 10000,
            subtotal: 30000,
          },
        ],
      } as never,
      shop.shop_id,
    )
    w.nameId("00000000-0000-4000-8999-0000000000c1", "order:v2")

    const obs = await w.observe()
    expect(w.summary(obs)).toMatchInlineSnapshot(`
      [
        "push    push:boss [order_v2] New Order",
        "push    push:clerk [order_v2] New Order",
      ]
    `)
    expect(obs.push).toMatchSnapshot()
  })

  it("createOrderStatusNotificationV2 (no caller) was deleted", () => {
    expect("createOrderStatusNotificationV2" in notificationService).toBe(false)
  })
})

describe("V2 create-order route (removed upstream in a80fedc53)", () => {
  it("POST /api/v2/orders is gone, so its duplicate order push is too", async () => {
    const { OrdersV2Controller } = await import("../../../api/routes/v2/orders/OrdersV2Controller.js")
    expect("createOrder" in OrdersV2Controller.prototype).toBe(false)
  })
})
