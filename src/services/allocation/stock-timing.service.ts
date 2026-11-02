/**
 * Stock subtraction timing on V2 orders: WHEN a sale takes units out of the
 * seller's lots (listing_item_lots.quantity_total, which every availability
 * read and "out of stock" display sums), or whether it ever does.
 *
 * The shop's `stock_subtraction_timing` order setting (Shop Settings › Stock
 * Management), with the values the setting has always had:
 *
 * - 'on_accepted' (default; no row): units leave the lots when the order is
 *   created: when the seller accepts the buyer's offer (cart checkout), or at
 *   once for Buy now and for a seller fulfilling a buy order (there is no
 *   separate acceptance). This is what V2 orders did before the setting was
 *   read, so a shop that never set it sees no change.
 * - 'on_received': units are held as soon as the seller RECEIVES the offer
 *   (cart checkout), before accepting it (offer_stock_holds_v2, see
 *   v2-offer-holds.service.ts). The hold follows counter-offers, becomes the
 *   order's allocation on acceptance and goes back to the lots if the offer is
 *   rejected, withdrawn or closed. Orders without an offer (Buy now, buy-order
 *   fulfilment) are received and accepted at the same moment: same as
 *   'on_accepted'.
 * - 'dont_subtract': V2 orders never take units out of the lots
 *   automatically, so the listed quantity never goes down (sellers with
 *   effectively unlimited supply). Buyers still can't order more than the
 *   listed quantity in one order. The seller can still allocate an order's
 *   units by hand (Stock Allocation tab); those are put back on cancel as
 *   usual.
 *
 * The allocation mode (allocation-mode.service.ts) says HOW units are taken:
 * only 'auto' takes them automatically (FIFO); 'manual' waits for the seller
 * and 'none' never allocates. So the timing only matters with 'auto', and
 * 'dont_subtract' turns automatic allocation off whatever the mode.
 *
 * Read from the selling SHOP only, like the allocation mode. Migration
 * 20261102180100_shop_stock_subtraction_timing copied each org/user setting
 * onto the shops that owner owns. Explicit default, not a fallback: no
 * setting, a disabled one or an unrecognised value is 'on_accepted' (what the
 * Shop Settings page shows; saving it there deletes the row).
 */

import * as orderDb from "../../api/routes/v1/orders/database.js"
import {
  getShopAllocationMode,
  type AllocationMode,
} from "./allocation-mode.service.js"

export type StockSubtractionTiming =
  | "on_accepted"
  | "on_received"
  | "dont_subtract"

export const DEFAULT_STOCK_SUBTRACTION_TIMING: StockSubtractionTiming =
  "on_accepted"

export const STOCK_SUBTRACTION_TIMINGS: readonly StockSubtractionTiming[] = [
  "on_accepted",
  "on_received",
  "dont_subtract",
]

export function isStockSubtractionTiming(
  value: unknown,
): value is StockSubtractionTiming {
  return (
    typeof value === "string" &&
    (STOCK_SUBTRACTION_TIMINGS as readonly string[]).includes(value)
  )
}

/** Stock subtraction timing of the selling shop. No shop: the default. */
export async function getShopStockSubtractionTiming(
  shopId: string | null | undefined,
): Promise<StockSubtractionTiming> {
  if (!shopId) return DEFAULT_STOCK_SUBTRACTION_TIMING
  const setting = await orderDb.getOrderSetting(
    "shop",
    shopId,
    "stock_subtraction_timing",
  )
  if (!setting || !setting.enabled) return DEFAULT_STOCK_SUBTRACTION_TIMING
  return isStockSubtractionTiming(setting.message_content)
    ? setting.message_content
    : DEFAULT_STOCK_SUBTRACTION_TIMING
}

/** What V2 sales of a shop do to its lots automatically. */
export interface V2StockPolicy {
  timing: StockSubtractionTiming
  allocation_mode: AllocationMode
  /** Hold the offer's units when the offer arrives (cart checkout). */
  hold_on_offer: boolean
  /** Allocate the order's units when the order is created. */
  allocate_on_order: boolean
}

export function v2StockPolicy(
  timing: StockSubtractionTiming,
  allocationMode: AllocationMode,
): V2StockPolicy {
  const automatic = allocationMode === "auto" && timing !== "dont_subtract"
  return {
    timing,
    allocation_mode: allocationMode,
    hold_on_offer: automatic && timing === "on_received",
    allocate_on_order: automatic,
  }
}

/** The selling shop's V2 stock policy (its timing and allocation mode). */
export async function getShopV2StockPolicy(
  shopId: string | null | undefined,
): Promise<V2StockPolicy> {
  const [timing, mode] = await Promise.all([
    getShopStockSubtractionTiming(shopId),
    getShopAllocationMode(shopId),
  ])
  return v2StockPolicy(timing, mode)
}
