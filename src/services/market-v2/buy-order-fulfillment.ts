/**
 * Buy-order fulfillment: which of a seller's listings/variants can fill a
 * standing buy order, and the order row a fulfillment creates.
 *
 * Used by BuyOrdersV2Controller (POST /buy-orders/{id}/fulfill and
 * GET /buy-orders/{id}/fulfillment-options). Whether fulfill accepts an
 * option is decided by buyOrderFulfillmentProblem (fulfillment-rules.ts),
 * which both endpoints call.
 */

import type { Knex } from "knex"
import type { VariantAttributes } from "../../api/routes/v2/types/listings.types.js"
import { getShopsForUser } from "../shops/shop-permissions.service.js"

/** The shop columns that decide who a fulfillment order belongs to. */
export interface FulfillingShop {
  shop_id: string
  owner_user_id: string | null
  owner_contractor_id: string | null
}

/**
 * Columns for the `orders` row a fulfillment creates: linked to the selling
 * shop like any other shop order (shop_id; contractor_id for an org shop;
 * the owner as assignee for a personal shop, unassigned for an org shop so a
 * member can claim it), with the buyer as customer.
 */
export function fulfillmentOrderColumns(
  shop: FulfillingShop,
  buyerId: string,
  pricePerUnit: number,
  quantity: number,
  now: Date = new Date(),
) {
  return {
    customer_id: buyerId,
    shop_id: shop.shop_id,
    contractor_id: shop.owner_contractor_id,
    assigned_id: shop.owner_contractor_id ? null : shop.owner_user_id,
    cost: pricePerUnit * quantity,
    status: "pending",
    created_at: now,
    updated_at: now,
  }
}

/** One listing variant a seller can fill the buy order from. */
export interface FulfillmentOptionRow {
  shop_id: string
  shop_name: string
  listing_id: string
  listing_title: string
  item_id: string
  variant_id: string
  variant_display_name: string | null
  variant_attributes: VariantAttributes | null
  /** Listed stock of this variant in this listing */
  available: number
  /** The listing's price for this variant (what the order would charge) */
  price_per_unit: number
}

/**
 * Order options for the seller: the ones fulfill accepts (no `problem`)
 * first, then cheapest, then most stock.
 */
export function rankFulfillmentOptions<T extends FulfillmentOptionRow & { problem: string | null }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.problem != null) - Number(b.problem != null) ||
      a.price_per_unit - b.price_per_unit ||
      b.available - a.available,
  )
}

/** Shops `userId` can sell from (owns, or has manage_market in the owning org). */
export async function getFulfillingShopIds(userId: string): Promise<string[]> {
  const shops = await getShopsForUser(userId)
  return shops.filter((s) => s.permissions.can_manage).map((s) => s.shop_id)
}

/**
 * Active listings in `shopIds` that sell `gameItemId`, one row per variant
 * with listed stock, priced the way fulfill prices them.
 */
export async function queryFulfillmentOptionRows(
  db: Knex,
  shopIds: string[],
  gameItemId: string,
): Promise<FulfillmentOptionRow[]> {
  if (shopIds.length === 0) return []
  const rows = await db("listing_items as li")
    .join("listings as l", "l.listing_id", "li.listing_id")
    .join("shops as s", "s.shop_id", "l.shop_id")
    .join("listing_item_lots as lot", function () {
      this.on("lot.item_id", "=", "li.item_id").andOn("lot.listed", "=", db.raw("true"))
    })
    .join("item_variants as v", "v.variant_id", "lot.variant_id")
    .leftJoin("variant_pricing as vp", function () {
      this.on("vp.item_id", "=", "li.item_id").andOn("vp.variant_id", "=", "lot.variant_id")
    })
    .whereIn("l.shop_id", shopIds)
    .where("l.status", "active")
    .where("li.game_item_id", gameItemId)
    .where("v.game_item_id", gameItemId)
    .where("lot.quantity_total", ">", 0)
    .groupBy(
      "s.shop_id",
      "s.name",
      "l.listing_id",
      "l.title",
      "li.item_id",
      "li.pricing_mode",
      "li.base_price",
      "v.variant_id",
      "v.display_name",
      "v.attributes",
      "vp.price",
    )
    .select(
      "s.shop_id",
      "s.name as shop_name",
      "l.listing_id",
      "l.title as listing_title",
      "li.item_id",
      "li.pricing_mode",
      "li.base_price",
      "v.variant_id",
      "v.display_name as variant_display_name",
      "v.attributes as variant_attributes",
      "vp.price as variant_price",
      db.raw("SUM(lot.quantity_total)::integer as available"),
    )

  return rows.map((r) => ({
    shop_id: r.shop_id,
    shop_name: r.shop_name,
    listing_id: r.listing_id,
    listing_title: r.listing_title,
    item_id: r.item_id,
    variant_id: r.variant_id,
    variant_display_name: r.variant_display_name,
    variant_attributes: r.variant_attributes,
    available: Number(r.available) || 0,
    price_per_unit: Number(
      r.pricing_mode === "unified" ? r.base_price : (r.variant_price ?? r.base_price),
    ),
  }))
}
