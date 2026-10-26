/**
 * Counter-offers could carry any listing/variant: open an offer to your own
 * shop, counter with someone else's listing, accept, and the order consumes
 * the victim's stock. Items must now belong to the session's seller.
 */

import { describe, it, expect } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"
import { validateCounterOfferItems } from "./counter-offer-items.js"

function db() {
  return createFakeKnex({
    listings: [
      { listing_id: "L-mine", shop_id: "shop-mine", status: "active" },
      { listing_id: "L-victim", shop_id: "shop-victim", status: "active" },
    ],
    shops: [
      {
        shop_id: "shop-mine",
        owner_user_id: "attacker",
        owner_contractor_id: null,
      },
      {
        shop_id: "shop-victim",
        owner_user_id: "victim",
        owner_contractor_id: null,
      },
    ],
    listing_items: [
      { listing_id: "L-mine", item_id: "i1", game_item_id: "g1" },
      { listing_id: "L-victim", item_id: "i2", game_item_id: "g2" },
    ],
    item_variants: [
      { variant_id: "v-g1", game_item_id: "g1" },
      { variant_id: "v-g2", game_item_id: "g2" },
    ],
  }) as never
}

const session = {
  shop_id: "shop-mine",
  contractor_id: null,
  assigned_id: "attacker",
}

describe("validateCounterOfferItems", () => {
  it("rejects a V2 listing from another shop", async () => {
    expect(
      await validateCounterOfferItems(
        db(),
        session,
        [],
        [{ listing_id: "L-victim", variant_id: "v-g2" }],
      ),
    ).toMatch(/shop/)
  })

  it("rejects a variant that is not the listing's item", async () => {
    expect(
      await validateCounterOfferItems(
        db(),
        session,
        [],
        [{ listing_id: "L-mine", variant_id: "v-g2" }],
      ),
    ).toMatch(/variant/i)
  })

  it("rejects another seller's listing on a legacy session without shop_id", async () => {
    expect(
      await validateCounterOfferItems(
        db(),
        { shop_id: null, contractor_id: null, assigned_id: "attacker" },
        [],
        [{ listing_id: "L-victim", variant_id: "v-g2" }],
      ),
    ).toMatch(/seller/)
  })

  it("rejects a V1 listing from another seller", async () => {
    expect(
      await validateCounterOfferItems(
        db(),
        session,
        [
          {
            listing: {
              listing: { user_seller_id: "victim", contractor_seller_id: null },
            },
          },
        ],
        [],
      ),
    ).toMatch(/seller/)
  })

  it("accepts the seller's own listing and variant", async () => {
    expect(
      await validateCounterOfferItems(
        db(),
        session,
        [
          {
            listing: {
              listing: {
                user_seller_id: "attacker",
                contractor_seller_id: null,
              },
            },
          },
        ],
        [{ listing_id: "L-mine", variant_id: "v-g1" }],
      ),
    ).toBeNull()
  })
})
