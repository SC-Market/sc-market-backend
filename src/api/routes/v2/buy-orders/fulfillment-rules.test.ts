/**
 * Buy-order fulfillment ignored price_max, the quality range and targeting:
 * a seller could fill any order (even private ones aimed at another supplier,
 * or their own) at any price, creating an order the buyer has to pay.
 */

import { describe, it, expect } from "vitest"
import { createFakeKnex } from "../../../../test-utils/fake-knex-tables.js"
import { buyOrderFulfillmentProblem } from "./fulfillment-rules.js"

const db = () =>
  createFakeKnex({
    contractor_members: [{ contractor_id: "org-s", user_id: "org-seller" }],
    supplier_relationships: [
      {
        aggregator_id: "buyer",
        supplier_id: "roster-seller",
        supplier_contractor_id: null,
        status: "active",
      },
    ],
  }) as never

const base = {
  buyer_id: "buyer",
  price_max: "1000",
  quality_tier_min: null,
  quality_tier_max: null,
  expires_at: null,
  visibility: "public",
  target_supplier_id: null,
  target_supplier_contractor_id: null,
}

describe("buyOrderFulfillmentProblem", () => {
  it("rejects a price above price_max", async () => {
    expect(
      await buyOrderFulfillmentProblem(db(), base, "seller", 5000, {}),
    ).toMatchObject({
      field: "listing_id",
    })
  })

  it("accepts a price at or below price_max", async () => {
    expect(
      await buyOrderFulfillmentProblem(db(), base, "seller", 1000, {}),
    ).toBeNull()
  })

  it("rejects quality outside the requested range", async () => {
    const bo = { ...base, quality_tier_min: 4, quality_tier_max: 5 }
    expect(
      await buyOrderFulfillmentProblem(db(), bo, "seller", 10, {
        quality_tier: 2,
      }),
    ).toMatchObject({
      field: "variant_id",
    })
  })

  it("rejects a private order aimed at another supplier", async () => {
    const bo = {
      ...base,
      visibility: "private",
      target_supplier_id: "someone-else",
    }
    expect(
      await buyOrderFulfillmentProblem(db(), bo, "seller", 10, {}),
    ).not.toBeNull()
    expect(
      await buyOrderFulfillmentProblem(
        db(),
        { ...bo, target_supplier_id: "seller" },
        "seller",
        10,
        {},
      ),
    ).toBeNull()
    expect(
      await buyOrderFulfillmentProblem(
        db(),
        {
          ...bo,
          target_supplier_id: null,
          target_supplier_contractor_id: "org-s",
        },
        "org-seller",
        10,
        {},
      ),
    ).toBeNull()
  })

  it("rejects a roster-only order for a seller not on the roster", async () => {
    const bo = { ...base, visibility: "roster_only" }
    expect(
      await buyOrderFulfillmentProblem(db(), bo, "stranger", 10, {}),
    ).not.toBeNull()
    expect(
      await buyOrderFulfillmentProblem(db(), bo, "roster-seller", 10, {}),
    ).toBeNull()
  })

  it("rejects fulfilling your own or an expired order", async () => {
    expect(
      await buyOrderFulfillmentProblem(db(), base, "buyer", 10, {}),
    ).not.toBeNull()
    expect(
      await buyOrderFulfillmentProblem(
        db(),
        { ...base, expires_at: new Date(Date.now() - 1000) },
        "s",
        10,
        {},
      ),
    ).not.toBeNull()
  })
})
