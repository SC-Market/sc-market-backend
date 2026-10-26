import { describe, it, expect } from "vitest"
import { fulfillmentOrderColumns, rankFulfillmentOptions } from "./buy-order-fulfillment.js"

describe("fulfillmentOrderColumns", () => {
  const now = new Date("2026-10-25T00:00:00Z")

  it("links a personal shop's order to the shop and assigns the owner", () => {
    expect(
      fulfillmentOrderColumns(
        { shop_id: "shop-1", owner_user_id: "seller", owner_contractor_id: null },
        "buyer",
        250,
        4,
        now,
      ),
    ).toEqual({
      customer_id: "buyer",
      shop_id: "shop-1",
      contractor_id: null,
      assigned_id: "seller",
      cost: 1000,
      status: "pending",
      created_at: now,
      updated_at: now,
    })
  })

  it("links an org shop's order to the shop and org, unassigned for members to claim", () => {
    const cols = fulfillmentOrderColumns(
      { shop_id: "shop-2", owner_user_id: null, owner_contractor_id: "org-1" },
      "buyer",
      10,
      3,
      now,
    )
    expect(cols).toMatchObject({ shop_id: "shop-2", contractor_id: "org-1", assigned_id: null, cost: 30 })
  })
})

describe("rankFulfillmentOptions", () => {
  function row(variant_id: string, price_per_unit: number, problem: string | null, available = 5) {
    return {
      shop_id: "shop-1",
      shop_name: "Shop",
      listing_id: "listing-1",
      listing_title: "Listing",
      item_id: "item-1",
      variant_id,
      variant_display_name: "Tier 3",
      variant_attributes: { quality_tier: 3 },
      available,
      price_per_unit,
      problem,
    }
  }

  it("lists what fulfill accepts first, cheapest first, then the rejected ones", () => {
    const ranked = rankFulfillmentOptions([
      row("too-pricey", 50, "Listing price 50 is above the buyer's maximum of 40"),
      row("ok-dear", 40, null),
      row("ok-cheap", 30, null, 1),
      row("ok-cheap-more", 30, null, 9),
    ])
    expect(ranked.map((r) => r.variant_id)).toEqual(["ok-cheap-more", "ok-cheap", "ok-dear", "too-pricey"])
  })
})
