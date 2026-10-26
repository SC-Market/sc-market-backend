/**
 * Allocation Mode Service
 *
 * The allocation mode decides what happens to stock when an order is created:
 * - 'auto': allocate (decrement listed lots) when the order is created (default)
 * - 'manual': wait for the seller to allocate in the UI
 * - 'none': no physical allocation (legacy behavior)
 *
 * Source of truth: the SHOP's `allocation_mode` order setting (Shop Settings ›
 * Stock Management › Allocation mode; PUT
 * /api/v2/shops/{shopId}/order-settings/allocation_mode). It is
 * the only setting read; user- and org-level `allocation_mode` rows are not
 * consulted. Migration 20261026010000_shop_allocation_mode copied each
 * existing user/org setting onto the shops that owner owns, so no seller's
 * behavior changed when the read moved to the shop.
 *
 * Explicit default, not a fallback: a shop with no setting (or a disabled or
 * unrecognised one) is 'auto'. That is what the Shop Settings page shows when
 * no setting exists, and saving 'auto' there deletes the row.
 */

import * as orderDb from "../../api/routes/v1/orders/database.js"

export type AllocationMode = "auto" | "manual" | "none"

export const DEFAULT_ALLOCATION_MODE: AllocationMode = "auto"

const MODES: readonly AllocationMode[] = ["auto", "manual", "none"]

/**
 * Allocation mode of the shop that is selling.
 *
 * `shopId` is the selling shop (the listing's / order's `shop_id`). An order
 * with no shop has no shop setting to read, so it gets the default.
 */
export async function getShopAllocationMode(
  shopId: string | null | undefined,
): Promise<AllocationMode> {
  if (!shopId) return DEFAULT_ALLOCATION_MODE

  const setting = await orderDb.getOrderSetting("shop", shopId, "allocation_mode")
  if (!setting || !setting.enabled) return DEFAULT_ALLOCATION_MODE

  const mode = setting.message_content as AllocationMode
  return MODES.includes(mode) ? mode : DEFAULT_ALLOCATION_MODE
}
