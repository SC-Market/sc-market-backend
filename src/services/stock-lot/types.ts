/**
 * Stock Lot Types and Interfaces
 * 
 * Defines the data structures for granular stock tracking system.
 */

/**
 * Database representation of a stock lot
 */
export interface DBStockLot {
  lot_id: string
  listing_id: string
  quantity_total: number
  location_id: string | null  // null = "Unspecified"
  owner_id: string | null      // null = "Unassigned"
  listed: boolean              // true = counts toward listing, false = reserve
  notes: string | null         // max 1000 chars
  created_at: Date
  updated_at: Date
}

/**
 * Database representation of a location
 */
export interface DBLocation {
  location_id: string
  name: string                 // max 255 chars
  is_preset: boolean           // true for verse locations, false for custom
  display_order: number | null // for sorting preset locations
  created_by: string | null    // user who created custom location
  created_at: Date
}

/**
 * Input for creating a new stock lot
 */
export interface CreateLotInput {
  listing_id: string
  quantity: number
  location_id?: string | null
  owner_id?: string | null
  listed?: boolean
  notes?: string | null
}

/**
 * Input for updating an existing stock lot
 */
export interface UpdateLotInput {
  quantity?: number
  location_id?: string | null
  owner_id?: string | null
  listed?: boolean
  notes?: string | null
}

/**
 * Filters for querying stock lots
 */
export interface LotFilters {
  listing_id?: string
  location_id?: string | null
  owner_id?: string | null
  listed?: boolean
}

/**
 * Stock aggregation result
 */
export interface StockAggregation {
  total: number
  available: number
  reserved: number
}

/**
 * Input for transferring stock between locations
 */
export interface TransferLotInput {
  source_lot_id: string
  destination_location_id: string
  quantity: number
}

/**
 * Result of a stock transfer operation
 */
export interface TransferLotResult {
  source_lot: DBStockLot
  destination_lot: DBStockLot
}
