/**
 * V1 to V2 Migration Service
 *
 * Migrates V1 listings to V2 format:
 * - Reads V1 unique_listings, aggregate_listings, multiple_listings
 * - Creates V2 listings with default variants (no quality data)
 * - Uses unified pricing mode (single price for all variants)
 * - Creates single stock lot per V1 listing
 * - Preserves all V1 metadata (title, description, price, quantity, status, timestamps)
 * - Uses database transactions for atomicity
 *
 * Requirements: 58.1, 58.2, 58.4, 69.1
 */

import { getKnex } from "../../clients/database/knex-db.js"
import { getOrCreateVariant, VariantAttributes } from "./variant.service.js"

export interface V1UniqueListing {
  listing_id: string
  sale_type: string
  price: number
  quantity_available: number
  status: string
  internal: boolean
  user_seller_id: string | null
  contractor_seller_id: string | null
  timestamp: Date
  expiration: Date
  accept_offers: boolean
  details_id: string
  item_type: string
  title: string
  description: string
  game_item_id: string
  bulk_discount_tiers: Array<{ min_quantity: number; discount_percent: number }> | null
}

export interface V1AggregateListing {
  listing_id: string
  sale_type: string
  price: number
  quantity_available: number
  status: string
  internal: boolean
  user_seller_id: string | null
  contractor_seller_id: string | null
  timestamp: Date
  expiration: Date
  aggregate_id: string
  details_id: string
  item_type: string
  title: string
  description: string
  game_item_id: string
  bulk_discount_tiers: Array<{ min_quantity: number; discount_percent: number }> | null
}

export interface V1MultipleListing {
  listing_id: string
  sale_type: string
  price: number
  quantity_available: number
  status: string
  internal: boolean
  user_seller_id: string | null
  contractor_seller_id: string | null
  timestamp: Date
  expiration: Date
  multiple_id: string
  details_id: string
  item_type: string
  title: string
  description: string
  game_item_id: string
  bulk_discount_tiers: Array<{ min_quantity: number; discount_percent: number }> | null
}

export interface MigrationResult {
  success: boolean
  listing_id?: string
  v1_listing_id: string
  error?: string
}

export interface MigrationSummary {
  total_attempted: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{
    v1_listing_id: string
    error: string
  }>
}

/**
 * Default variant attributes for V1 listings without quality data.
 * All quality fields are NULL/unknown since V1 has no quality tier support.
 *
 * Requirement 58.2: Create default variant with empty attributes for V1 items
 * Requirement 69.1: Treat NULL quality fields as unknown quality
 */
const DEFAULT_V1_VARIANT_ATTRIBUTES: VariantAttributes = {
  quality_tier: undefined,
  quality_value: undefined,
  crafted_source: "unknown",
  blueprint_tier: undefined,
}

/**
 * Migrates a V1 unique listing to V2 format.
 *
 * Creates:
 * - V2 listing record (listing_type='single')
 * - V2 listing_items record (pricing_mode='unified')
 * - Default variant with NULL quality attributes
 * - Single stock lot with V1 quantity
 *
 * Requirements:
 * - 58.2: Migrate unique_listings to V2 listings table with listing_type='single'
 * - 58.4: Create default variant with NULL quality attributes for V1 items
 * - 69.1: Use unified pricing mode for all migrated listings
 *
 * @param v1Listing - V1 unique listing data
 * @returns Migration result with success status and new listing_id
 */
export async function migrateUniqueListing(
  v1Listing: V1UniqueListing,
): Promise<MigrationResult> {
  const db = getKnex()

  try {
    // Validate required fields
    if (!v1Listing.game_item_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing game_item_id",
      }
    }

    // Skip listings with invalid data (zero price or zero quantity)
    if (v1Listing.price <= 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid price (must be > 0)",
      }
    }

    if (v1Listing.quantity_available < 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid quantity (must be >= 0)",
      }
    }

    // Determine seller_id and seller_type
    const seller_id = v1Listing.user_seller_id || v1Listing.contractor_seller_id
    const seller_type = v1Listing.user_seller_id ? "user" : "contractor"

    if (!seller_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing seller_id (both user and contractor are null)",
      }
    }

    // Map V1 status to V2 status
    // V1: 'active', 'inactive', 'archived', 'sold', 'expired', 'cancelled'
    // V2: 'active', 'sold', 'expired', 'cancelled'
    let v2Status = v1Listing.status
    if (v1Listing.status === "inactive" || v1Listing.status === "archived") {
      v2Status = "cancelled" // Map inactive/archived to cancelled
    }

    // Map V1 sale_type to V2 sale_type
    // V1: 'sale', 'auction', 'negotiable'
    // V2: 'fixed', 'auction', 'negotiable'
    let v2SaleType = v1Listing.sale_type
    if (v1Listing.sale_type === "sale") {
      v2SaleType = v1Listing.accept_offers ? "negotiable" : "fixed"
    }

    // Idempotency: skip if already migrated
    const existing = await db("v1_v2_listing_map").where({ v1_listing_id: v1Listing.listing_id }).first()
    if (existing) {
      return { success: true, listing_id: existing.v2_listing_id, v1_listing_id: v1Listing.listing_id }
    }

    // Use database transaction for atomicity
    const result = await db.transaction(async (trx) => {
      // 1. Create V2 listing record
      const [listing] = await trx("listings")
        .insert({
          seller_id,
          seller_type,
          title: v1Listing.title,
          description: v1Listing.description,
          status: v2Status,
          visibility: v1Listing.internal ? "private" : "public",
          sale_type: v2SaleType,
          listing_type: "single",
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
          expires_at: v1Listing.expiration,
        })
        .returning("*")

      // 2. Create V2 listing_items record with unified pricing
      const [listingItem] = await trx("listing_items")
        .insert({
          listing_id: listing.listing_id,
          game_item_id: v1Listing.game_item_id,
          pricing_mode: "unified",
          base_price: v1Listing.price,
          display_order: 0,
          quantity_available: 0,
          variant_count: 0,
          bulk_discount_tiers: v1Listing.bulk_discount_tiers || null,
        })
        .returning("*")

      // 3. Get or create default variant (no quality data)
      const variantId = await getOrCreateVariant(
        v1Listing.game_item_id,
        DEFAULT_V1_VARIANT_ATTRIBUTES,
      )

      // 4. Migrate V1 stock_lots if they exist, otherwise create from quantity_available
      const v1Lots = await trx("stock_lots").where({ listing_id: v1Listing.listing_id })

      if (v1Lots.length > 0) {
        for (const v1Lot of v1Lots) {
          const [v2Lot] = await trx("listing_item_lots").insert({
            item_id: listingItem.item_id,
            variant_id: variantId,
            quantity_total: v1Lot.quantity_total,
            location_id: v1Lot.location_id,
            owner_id: v1Lot.owner_id,
            listed: v1Lot.listed,
            notes: v1Lot.notes,
            created_at: v1Lot.created_at,
            updated_at: v1Lot.updated_at,
          }).returning("*")

          await trx("v1_v2_stock_lot_map").insert({
            v1_lot_id: v1Lot.lot_id,
            v2_lot_id: v2Lot.lot_id,
            v1_listing_id: v1Listing.listing_id,
          })
        }
      } else if (v1Listing.quantity_available > 0) {
        await trx("listing_item_lots").insert({
          item_id: listingItem.item_id,
          variant_id: variantId,
          quantity_total: v1Listing.quantity_available,
          location_id: null,
          owner_id: seller_id,
          listed: true,
          notes: `Migrated from V1 listing ${v1Listing.listing_id}`,
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
        })
      }

      // 5. Migrate photos from V1 market_images → V2 listing_photos_v2
      const v1Photos = await trx("market_images").where({ details_id: v1Listing.details_id })
      for (let i = 0; i < v1Photos.length; i++) {
        await trx("listing_photos_v2").insert({
          listing_id: listing.listing_id,
          resource_id: v1Photos[i].resource_id,
          display_order: i,
        })
      }

      // 6. Record listing mapping
      await trx("v1_v2_listing_map").insert({
        v1_listing_id: v1Listing.listing_id,
        v2_listing_id: listing.listing_id,
        v1_listing_type: "unique",
      })

      return {
        success: true,
        listing_id: listing.listing_id,
        v1_listing_id: v1Listing.listing_id,
      }
    })

    return result
  } catch (error) {
    return {
      success: false,
      v1_listing_id: v1Listing.listing_id,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Migrates a V1 aggregate listing to V2 format.
 *
 * Aggregate listings in V1 are fungible items grouped by game item type.
 * In V2, these become regular 'single' listings with default variants.
 *
 * Requirements:
 * - 58.2: Migrate aggregate_listings to V2 (if any exist)
 * - 58.4: Create default variant with NULL quality attributes
 * - 69.1: Use unified pricing mode
 *
 * @param v1Listing - V1 aggregate listing data
 * @returns Migration result with success status and new listing_id
 */
export async function migrateAggregateListing(
  v1Listing: V1AggregateListing,
): Promise<MigrationResult> {
  const db = getKnex()

  try {
    // Validate required fields
    if (!v1Listing.game_item_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing game_item_id",
      }
    }

    // Skip listings with invalid data
    if (v1Listing.price <= 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid price (must be > 0)",
      }
    }

    if (v1Listing.quantity_available < 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid quantity (must be >= 0)",
      }
    }

    // Determine seller_id and seller_type
    const seller_id = v1Listing.user_seller_id || v1Listing.contractor_seller_id
    const seller_type = v1Listing.user_seller_id ? "user" : "contractor"

    if (!seller_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing seller_id",
      }
    }

    // Map V1 status to V2 status
    let v2Status = v1Listing.status
    if (v1Listing.status === "inactive" || v1Listing.status === "archived") {
      v2Status = "cancelled"
    }

    // Map V1 sale_type to V2 sale_type
    let v2SaleType = v1Listing.sale_type
    if (v1Listing.sale_type === "sale") {
      v2SaleType = "fixed"
    }

    // Idempotency: skip if already migrated
    const existing = await db("v1_v2_listing_map").where({ v1_listing_id: v1Listing.listing_id }).first()
    if (existing) {
      return { success: true, listing_id: existing.v2_listing_id, v1_listing_id: v1Listing.listing_id }
    }

    // Use database transaction for atomicity
    const result = await db.transaction(async (trx) => {
      // 1. Create V2 listing record
      const [listing] = await trx("listings")
        .insert({
          seller_id,
          seller_type,
          title: v1Listing.title,
          description: v1Listing.description,
          status: v2Status,
          visibility: v1Listing.internal ? "private" : "public",
          sale_type: v2SaleType,
          listing_type: "single", // Aggregate listings map to 'single' in V2
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
          expires_at: v1Listing.expiration,
        })
        .returning("*")

      // 2. Create V2 listing_items record with unified pricing
      const [listingItem] = await trx("listing_items")
        .insert({
          listing_id: listing.listing_id,
          game_item_id: v1Listing.game_item_id,
          pricing_mode: "unified",
          base_price: v1Listing.price,
          display_order: 0,
          quantity_available: 0,
          variant_count: 0,
          bulk_discount_tiers: v1Listing.bulk_discount_tiers || null,
        })
        .returning("*")

      // 3. Get or create default variant
      const variantId = await getOrCreateVariant(
        v1Listing.game_item_id,
        DEFAULT_V1_VARIANT_ATTRIBUTES,
      )

      // 4. Migrate V1 stock_lots if they exist, otherwise create from quantity_available
      const v1Lots = await trx("stock_lots").where({ listing_id: v1Listing.listing_id })

      if (v1Lots.length > 0) {
        for (const v1Lot of v1Lots) {
          const [v2Lot] = await trx("listing_item_lots").insert({
            item_id: listingItem.item_id,
            variant_id: variantId,
            quantity_total: v1Lot.quantity_total,
            location_id: v1Lot.location_id,
            owner_id: v1Lot.owner_id,
            listed: v1Lot.listed,
            notes: v1Lot.notes,
            created_at: v1Lot.created_at,
            updated_at: v1Lot.updated_at,
          }).returning("*")

          await trx("v1_v2_stock_lot_map").insert({
            v1_lot_id: v1Lot.lot_id,
            v2_lot_id: v2Lot.lot_id,
            v1_listing_id: v1Listing.listing_id,
          })
        }
      } else if (v1Listing.quantity_available > 0) {
        await trx("listing_item_lots").insert({
          item_id: listingItem.item_id,
          variant_id: variantId,
          quantity_total: v1Listing.quantity_available,
          location_id: null,
          owner_id: seller_id,
          listed: true,
          notes: `Migrated from V1 aggregate listing ${v1Listing.listing_id}`,
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
        })
      }

      // 5. Migrate photos from V1 market_images → V2 listing_photos_v2
      const v1Photos = await trx("market_images").where({ details_id: v1Listing.details_id })
      for (let i = 0; i < v1Photos.length; i++) {
        await trx("listing_photos_v2").insert({
          listing_id: listing.listing_id,
          resource_id: v1Photos[i].resource_id,
          display_order: i,
        })
      }

      // 6. Record listing mapping
      await trx("v1_v2_listing_map").insert({
        v1_listing_id: v1Listing.listing_id,
        v2_listing_id: listing.listing_id,
        v1_listing_type: "aggregate",
      })

      return {
        success: true,
        listing_id: listing.listing_id,
        v1_listing_id: v1Listing.listing_id,
      }
    })

    return result
  } catch (error) {
    return {
      success: false,
      v1_listing_id: v1Listing.listing_id,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Migrates a V1 multiple listing (bundle) to V2 format.
 *
 * Multiple listings in V1 are bundles containing multiple game items.
 * In V2, these become 'bundle' listings with default variants.
 *
 * Requirements:
 * - 58.2: Migrate multiple_listings to V2 (if any exist)
 * - 58.4: Create default variant with NULL quality attributes
 * - 69.1: Use unified pricing mode
 *
 * @param v1Listing - V1 multiple listing data
 * @returns Migration result with success status and new listing_id
 */
export async function migrateMultipleListing(
  v1Listing: V1MultipleListing,
): Promise<MigrationResult> {
  const db = getKnex()

  try {
    // Validate required fields
    if (!v1Listing.game_item_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing game_item_id",
      }
    }

    // Skip listings with invalid data
    if (v1Listing.price <= 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid price (must be > 0)",
      }
    }

    if (v1Listing.quantity_available < 0) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Invalid quantity (must be >= 0)",
      }
    }

    // Determine seller_id and seller_type
    const seller_id = v1Listing.user_seller_id || v1Listing.contractor_seller_id
    const seller_type = v1Listing.user_seller_id ? "user" : "contractor"

    if (!seller_id) {
      return {
        success: false,
        v1_listing_id: v1Listing.listing_id,
        error: "Missing seller_id",
      }
    }

    // Map V1 status to V2 status
    let v2Status = v1Listing.status
    if (v1Listing.status === "inactive" || v1Listing.status === "archived") {
      v2Status = "cancelled"
    }

    // Map V1 sale_type to V2 sale_type
    let v2SaleType = v1Listing.sale_type
    if (v1Listing.sale_type === "sale") {
      v2SaleType = "fixed"
    }

    // Idempotency: skip if already migrated
    const existing = await db("v1_v2_listing_map").where({ v1_listing_id: v1Listing.listing_id }).first()
    if (existing) {
      return { success: true, listing_id: existing.v2_listing_id, v1_listing_id: v1Listing.listing_id }
    }

    // Use database transaction for atomicity
    const result = await db.transaction(async (trx) => {
      // 1. Create V2 listing record
      const [listing] = await trx("listings")
        .insert({
          seller_id,
          seller_type,
          title: v1Listing.title,
          description: v1Listing.description,
          status: v2Status,
          visibility: v1Listing.internal ? "private" : "public",
          sale_type: v2SaleType,
          listing_type: "bundle",
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
          expires_at: v1Listing.expiration,
        })
        .returning("*")

      // 2. Get all sub-items in this bundle
      const bundleEntries = await trx("market_multiple_listings")
        .join("market_listing_details", "market_multiple_listings.details_id", "market_listing_details.details_id")
        .where({ multiple_id: v1Listing.multiple_id })
        .select(
          "market_multiple_listings.details_id",
          "market_listing_details.game_item_id",
        )

      // 3. Create listing_item + variant + lot for each bundle entry
      for (let i = 0; i < bundleEntries.length; i++) {
        const entry = bundleEntries[i]
        if (!entry.game_item_id) continue

        const [listingItem] = await trx("listing_items")
          .insert({
            listing_id: listing.listing_id,
            game_item_id: entry.game_item_id,
            pricing_mode: "unified",
            base_price: i === 0 ? v1Listing.price : 0,
            display_order: i,
            quantity_available: 0,
            variant_count: 0,
            bulk_discount_tiers: i === 0 ? (v1Listing.bulk_discount_tiers || null) : null,
          })
          .returning("*")

        const variantId = await getOrCreateVariant(
          entry.game_item_id,
          DEFAULT_V1_VARIANT_ATTRIBUTES,
        )

        if (i === 0) {
          const v1Lots = await trx("stock_lots").where({ listing_id: v1Listing.listing_id })
          if (v1Lots.length > 0) {
            for (const v1Lot of v1Lots) {
              const [v2Lot] = await trx("listing_item_lots").insert({
                item_id: listingItem.item_id,
                variant_id: variantId,
                quantity_total: v1Lot.quantity_total,
                location_id: v1Lot.location_id,
                owner_id: v1Lot.owner_id,
                listed: v1Lot.listed,
                notes: v1Lot.notes,
                created_at: v1Lot.created_at,
                updated_at: v1Lot.updated_at,
              }).returning("*")
              await trx("v1_v2_stock_lot_map").insert({
                v1_lot_id: v1Lot.lot_id,
                v2_lot_id: v2Lot.lot_id,
                v1_listing_id: v1Listing.listing_id,
              })
            }
          } else if (v1Listing.quantity_available > 0) {
            await trx("listing_item_lots").insert({
              item_id: listingItem.item_id,
              variant_id: variantId,
              quantity_total: v1Listing.quantity_available,
              location_id: null,
              owner_id: seller_id,
              listed: true,
              notes: `Migrated from V1 bundle listing ${v1Listing.listing_id}`,
              created_at: v1Listing.timestamp,
              updated_at: v1Listing.timestamp,
            })
          }
        }

        // Migrate photos for this sub-item
        const v1Photos = await trx("market_images").where({ details_id: entry.details_id })
        for (let j = 0; j < v1Photos.length; j++) {
          await trx("listing_photos_v2").insert({
            listing_id: listing.listing_id,
            resource_id: v1Photos[j].resource_id,
            display_order: i * 100 + j,
          })
        }
      }

      // 4. Record listing mapping
      await trx("v1_v2_listing_map").insert({
        v1_listing_id: v1Listing.listing_id,
        v2_listing_id: listing.listing_id,
        v1_listing_type: "multiple",
      })

      return {
        success: true,
        listing_id: listing.listing_id,
        v1_listing_id: v1Listing.listing_id,
      }
    })

    return result
  } catch (error) {
    return {
      success: false,
      v1_listing_id: v1Listing.listing_id,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export class V1ToV2MigrationService {
  /**
   * Migrates a V1 unique listing to V2 format.
   */
  async migrateUniqueListing(
    v1Listing: V1UniqueListing,
  ): Promise<MigrationResult> {
    return migrateUniqueListing(v1Listing)
  }

  /**
   * Migrates a V1 aggregate listing to V2 format.
   */
  async migrateAggregateListing(
    v1Listing: V1AggregateListing,
  ): Promise<MigrationResult> {
    return migrateAggregateListing(v1Listing)
  }

  /**
   * Migrates a V1 multiple listing to V2 format.
   */
  async migrateMultipleListing(
    v1Listing: V1MultipleListing,
  ): Promise<MigrationResult> {
    return migrateMultipleListing(v1Listing)
  }

  /**
   * Migrates all V1 unique listings to V2.
   * Reads from V1 tables without modifying them.
   *
   * @returns Migration summary with success/failure counts
   */
  async migrateAllUniqueListings(): Promise<MigrationSummary> {
    const db = getKnex()

    const summary: MigrationSummary = {
      total_attempted: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }

    try {
      // Read all V1 unique listings (read-only, no modifications to V1)
      const v1Listings = await db("market_listings as ml")
        .join(
          "market_unique_listings as mul",
          "ml.listing_id",
          "mul.listing_id",
        )
        .leftJoin(
          "market_listing_details as mld",
          "mul.details_id",
          "mld.details_id",
        )
        .select(
          "ml.listing_id",
          "ml.sale_type",
          "ml.price",
          "ml.quantity_available",
          "ml.status",
          "ml.internal",
          "ml.user_seller_id",
          "ml.contractor_seller_id",
          "ml.timestamp",
          "ml.expiration",
          "ml.bulk_discount_tiers",
          "mul.accept_offers",
          "mul.details_id",
          "mld.item_type",
          "mld.title",
          "mld.description",
          "mld.game_item_id",
        )

      summary.total_attempted = v1Listings.length

      // Migrate each listing
      for (const v1Listing of v1Listings) {
        const result = await this.migrateUniqueListing(v1Listing)

        if (result.success) {
          summary.successful++
        } else {
          summary.failed++
          summary.errors.push({
            v1_listing_id: result.v1_listing_id,
            error: result.error || "Unknown error",
          })
        }
      }

      return summary
    } catch (error) {
      throw new Error(
        `Failed to migrate unique listings: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Migrates all V1 aggregate listings to V2.
   * Reads from V1 tables without modifying them.
   *
   * @returns Migration summary with success/failure counts
   */
  async migrateAllAggregateListings(): Promise<MigrationSummary> {
    const db = getKnex()

    const summary: MigrationSummary = {
      total_attempted: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }

    try {
      // Read all V1 aggregate listings
      const v1Listings = await db("market_listings as ml")
        .join(
          "market_aggregate_listings as mal",
          "ml.listing_id",
          "mal.aggregate_listing_id",
        )
        .join("market_aggregates as ma", "mal.aggregate_id", "ma.aggregate_id")
        .leftJoin(
          "market_listing_details as mld",
          "ma.details_id",
          "mld.details_id",
        )
        .select(
          "ml.listing_id",
          "ml.sale_type",
          "ml.price",
          "ml.quantity_available",
          "ml.status",
          "ml.internal",
          "ml.user_seller_id",
          "ml.contractor_seller_id",
          "ml.timestamp",
          "ml.expiration",
          "ml.bulk_discount_tiers",
          "mal.aggregate_id",
          "ma.details_id",
          "mld.item_type",
          "mld.title",
          "mld.description",
          "mld.game_item_id",
        )

      summary.total_attempted = v1Listings.length

      // Migrate each listing
      for (const v1Listing of v1Listings) {
        const result = await this.migrateAggregateListing(v1Listing)

        if (result.success) {
          summary.successful++
        } else {
          summary.failed++
          summary.errors.push({
            v1_listing_id: result.v1_listing_id,
            error: result.error || "Unknown error",
          })
        }
      }

      return summary
    } catch (error) {
      throw new Error(
        `Failed to migrate aggregate listings: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Migrates all V1 multiple listings to V2.
   * Reads from V1 tables without modifying them.
   *
   * @returns Migration summary with success/failure counts
   */
  async migrateAllMultipleListings(): Promise<MigrationSummary> {
    const db = getKnex()

    const summary: MigrationSummary = {
      total_attempted: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    }

    try {
      // Read all V1 multiple listings
      const v1Listings = await db("market_listings as ml")
        .join(
          "market_multiple_listings as mml",
          "ml.listing_id",
          "mml.multiple_listing_id",
        )
        .leftJoin(
          "market_listing_details as mld",
          "mml.details_id",
          "mld.details_id",
        )
        .select(
          "ml.listing_id",
          "ml.sale_type",
          "ml.price",
          "ml.quantity_available",
          "ml.status",
          "ml.internal",
          "ml.user_seller_id",
          "ml.contractor_seller_id",
          "ml.timestamp",
          "ml.expiration",
          "ml.bulk_discount_tiers",
          "mml.multiple_id",
          "mml.details_id",
          "mld.item_type",
          "mld.title",
          "mld.description",
          "mld.game_item_id",
        )

      summary.total_attempted = v1Listings.length

      // Migrate each listing
      for (const v1Listing of v1Listings) {
        const result = await this.migrateMultipleListing(v1Listing)

        if (result.success) {
          summary.successful++
        } else {
          summary.failed++
          summary.errors.push({
            v1_listing_id: result.v1_listing_id,
            error: result.error || "Unknown error",
          })
        }
      }

      return summary
    } catch (error) {
      throw new Error(
        `Failed to migrate multiple listings: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }
  }

  /**
   * Migrates all V1 listings (unique, aggregate, multiple) to V2.
   *
   * @returns Combined migration summary for all listing types
   */
  async migrateAllListings(): Promise<MigrationSummary> {
    const uniqueSummary = await this.migrateAllUniqueListings()
    const aggregateSummary = await this.migrateAllAggregateListings()
    const multipleSummary = await this.migrateAllMultipleListings()

    return {
      total_attempted:
        uniqueSummary.total_attempted +
        aggregateSummary.total_attempted +
        multipleSummary.total_attempted,
      successful:
        uniqueSummary.successful +
        aggregateSummary.successful +
        multipleSummary.successful,
      failed:
        uniqueSummary.failed +
        aggregateSummary.failed +
        multipleSummary.failed,
      skipped:
        uniqueSummary.skipped +
        aggregateSummary.skipped +
        multipleSummary.skipped,
      errors: [
        ...uniqueSummary.errors,
        ...aggregateSummary.errors,
        ...multipleSummary.errors,
      ],
    }
  }
}

export const v1ToV2MigrationService = new V1ToV2MigrationService()
