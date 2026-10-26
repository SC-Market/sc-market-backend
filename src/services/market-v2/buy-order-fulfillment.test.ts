import { describe, it, expect } from "vitest"
import { rankFulfillmentOptions } from "./buy-order-fulfillment.js"

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
