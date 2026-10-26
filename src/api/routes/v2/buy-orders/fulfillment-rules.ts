import type { Knex } from "knex"

interface BuyOrderForFulfillment {
  buyer_id: string
  price_max: string | number | null
  quality_tier_min: number | null
  quality_tier_max: number | null
  expires_at: Date | string | null
  visibility?: string | null
  target_supplier_id?: string | null
  target_supplier_contractor_id?: string | null
}

/**
 * Whether `sellerId` may fulfill this buy order with a variant at `pricePerUnit`.
 *
 * Fulfilling creates an order the buyer must pay, so the seller can't exceed
 * the buyer's price_max, deliver outside the requested quality range, fill
 * their own order, fill an expired order, or fill an order targeted at
 * someone else (private / roster-only), which the search endpoints already
 * hide from them.
 *
 * Returns null when allowed, otherwise { field, message }.
 */
export async function buyOrderFulfillmentProblem(
  db: Knex | Knex.Transaction,
  buyOrder: BuyOrderForFulfillment,
  sellerId: string,
  pricePerUnit: number,
  variantAttributes:
    | { quality_tier?: number | string | null }
    | null
    | undefined,
): Promise<{ field: string; message: string } | null> {
  if (buyOrder.buyer_id === sellerId) {
    return {
      field: "buy_order_id",
      message: "You cannot fulfill your own buy order",
    }
  }
  if (
    buyOrder.expires_at &&
    new Date(buyOrder.expires_at).getTime() < Date.now()
  ) {
    return { field: "status", message: "Buy order has expired" }
  }

  const priceMax =
    buyOrder.price_max == null ? null : Number(buyOrder.price_max)
  if (
    priceMax != null &&
    Number.isFinite(priceMax) &&
    pricePerUnit > priceMax
  ) {
    return {
      field: "listing_id",
      message: `Listing price ${pricePerUnit} is above the buyer's maximum of ${priceMax}`,
    }
  }

  const tier =
    variantAttributes?.quality_tier == null
      ? null
      : Number(variantAttributes.quality_tier)
  if (buyOrder.quality_tier_min != null || buyOrder.quality_tier_max != null) {
    if (
      tier == null ||
      (buyOrder.quality_tier_min != null && tier < buyOrder.quality_tier_min) ||
      (buyOrder.quality_tier_max != null && tier > buyOrder.quality_tier_max)
    ) {
      return {
        field: "variant_id",
        message: "Variant quality is outside the requested range",
      }
    }
  }

  const visibility = buyOrder.visibility || "public"
  if (visibility === "private") {
    const direct =
      buyOrder.target_supplier_id && buyOrder.target_supplier_id === sellerId
    const viaOrg =
      !!buyOrder.target_supplier_contractor_id &&
      !!(await db("contractor_members")
        .where({
          contractor_id: buyOrder.target_supplier_contractor_id,
          user_id: sellerId,
        })
        .first())
    if (!direct && !viaOrg) {
      return {
        field: "buy_order_id",
        message: "This buy order is directed at another supplier",
      }
    }
  } else if (visibility === "roster_only") {
    const memberOrgs = (
      await db("contractor_members")
        .where({ user_id: sellerId })
        .select("contractor_id")
    ).map((r: { contractor_id: string }) => r.contractor_id)
    const rels = await db("supplier_relationships")
      .where({ aggregator_id: buyOrder.buyer_id, status: "active" })
      .select("supplier_id", "supplier_contractor_id")
    const onRoster = rels.some(
      (r: {
        supplier_id: string | null
        supplier_contractor_id: string | null
      }) =>
        r.supplier_id === sellerId ||
        (!!r.supplier_contractor_id &&
          memberOrgs.includes(r.supplier_contractor_id)),
    )
    if (!onRoster) {
      return {
        field: "buy_order_id",
        message: "This buy order is limited to the buyer's suppliers",
      }
    }
  }
  return null
}
