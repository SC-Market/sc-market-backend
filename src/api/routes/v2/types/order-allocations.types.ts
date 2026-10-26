/**
 * Types for the V2 order stock allocation API
 * (/api/v2/orders/{orderId}/allocations).
 *
 * An allocated unit has been taken out of its lot: a lot's quantity_total is
 * what is still free, and an allocation records which lot an order line's
 * units came from.
 */

import type { LocationInfo, OwnerInfo, StockLotVariant } from "./stock-lots.types.js"

/** A lot, as shown next to an allocation or as a candidate for one. */
export interface OrderAllocationLot {
  lot_id: string
  /** Units still free in the lot (not held by any order) */
  quantity_available: number
  /** Whether the lot is listed for sale. Unlisted lots can still be allocated by hand. */
  listed: boolean
  location: LocationInfo | null
  owner: OwnerInfo | null
}

/** Units of one lot held for an order line. */
export interface OrderAllocation {
  allocation_id: string
  order_item_id: string
  /** Null if the lot has been deleted since */
  lot_id: string | null
  quantity: number
  /** User who allocated by hand; null for automatic allocation */
  allocated_by: string | null
  created_at: string
  updated_at: string
  lot: OrderAllocationLot | null
}

/** One V2 line of the order with its allocations. */
export interface OrderAllocationLine {
  order_item_id: string
  listing_id: string
  listing_title: string
  listing_photo: string | null
  variant: StockLotVariant
  /** Units the line requires */
  quantity: number
  /** Units currently held for the line */
  quantity_allocated: number
  allocations: OrderAllocation[]
  /** Lots of the same listing item and variant with free units, oldest first */
  available_lots: OrderAllocationLot[]
}

export interface OrderAllocationsResponse {
  order_id: string
  order_status: string
  /** The selling shop's allocation mode: auto, manual or none */
  allocation_mode: "auto" | "manual" | "none"
  /** False once the order is cancelled or fulfilled */
  editable: boolean
  lines: OrderAllocationLine[]
  total_requested: number
  total_allocated: number
}

export interface ManualOrderAllocationInput {
  /** Lot to allocate from (UUID) */
  lot_id: string
  /**
   * Units of this lot the order should hold after the request (not a delta).
   * 0 releases the lot's allocation.
   * @isInt
   * @minimum 0
   */
  quantity: number
  /** Order line, needed only when the lot matches several lines */
  order_item_id?: string
}

export interface ManualOrderAllocationRequest {
  allocations: ManualOrderAllocationInput[]
}

export interface ReleaseOrderAllocationsRequest {
  /** Allocations to release; omit to release all of the order's allocations */
  allocation_ids?: string[]
}
