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
 * Normalize V1 status to a valid V2 status.
 * V2 CHECK: 'active', 'sold', 'expired', 'cancelled'
 */
function normalizeStatus(v1Status: string, expiration: Date): string {
  switch (v1Status) {
    case "active":
      // If expiration is in the past, mark as expired
      return expiration < new Date() ? "expired" : "active"
    case "sold":
      return "sold"
    case "expired":
      return "expired"
    case "inactive":
    case "archived":
    case "cancelled":
      return "cancelled"
    default:
      // Unknown status → cancelled (safe default)
      return "cancelled"
  }
}

/**
 * Normalize V1 sale_type to a valid V2 sale_type.
 * V2 CHECK: 'fixed', 'auction', 'negotiable'
 */
function normalizeSaleType(v1SaleType: string, acceptOffers?: boolean | null): string {
  switch (v1SaleType) {
    case "sale":
      return acceptOffers ? "negotiable" : "fixed"
    case "auction":
      return "auction"
    case "negotiable":
      return "negotiable"
    default:
      return "fixed"
  }
}

/**
 * Migrates a V1 unique listing to V2 format.

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
    // game_item_id is nullable — custom listings have NULL
    const gameItemId = v1Listing.game_item_id || null

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

    const v2Status = normalizeStatus(v1Listing.status, v1Listing.expiration)
    const v2SaleType = normalizeSaleType(v1Listing.sale_type, v1Listing.accept_offers)

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
          game_item_id: gameItemId,
          pricing_mode: "unified",
          base_price: v1Listing.price,
          display_order: 0,
          quantity_available: 0,
          variant_count: 0,
          bulk_discount_tiers: v1Listing.bulk_discount_tiers || null,
        })
        .returning("*")

      // 3. Get or create default variant and migrate stock
      const variantId = await getOrCreateVariant(
        gameItemId,
        DEFAULT_V1_VARIANT_ATTRIBUTES,
        trx,
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
            owner_id: v1Lot.owner_id || seller_id,
            listed: v1Lot.listed,
            notes: v1Lot.notes,
            game_item_id: gameItemId,
            listing_id: listing.listing_id,
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
          game_item_id: gameItemId,
          listing_id: listing.listing_id,
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
        })
      }

      // 5. Migrate photos from V1 market_images → V2 listing_photos_v2
      const v1Photos = await trx("market_images").where({ details_id: v1Listing.details_id }).whereNotNull("resource_id")
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
    const gameItemId = v1Listing.game_item_id || null
    if (v1Listing.quantity_available < 0) {
      return { success: false, v1_listing_id: v1Listing.listing_id, error: "Invalid quantity (must be >= 0)" }
    }
    const seller_id = v1Listing.user_seller_id || v1Listing.contractor_seller_id
    const seller_type = v1Listing.user_seller_id ? "user" : "contractor"
    if (!seller_id) {
      return { success: false, v1_listing_id: v1Listing.listing_id, error: "Missing seller_id" }
    }

    const v2Status = normalizeStatus(v1Listing.status, v1Listing.expiration)
    const v2SaleType = normalizeSaleType(v1Listing.sale_type)

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
          game_item_id: gameItemId,
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
        gameItemId,
        DEFAULT_V1_VARIANT_ATTRIBUTES,
        trx,
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
            owner_id: v1Lot.owner_id || seller_id,
            listed: v1Lot.listed,
            notes: v1Lot.notes,
            game_item_id: gameItemId,
            listing_id: listing.listing_id,
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
          game_item_id: gameItemId,
          listing_id: listing.listing_id,
          created_at: v1Listing.timestamp,
          updated_at: v1Listing.timestamp,
        })
      }

      // 5. Migrate photos from V1 market_images → V2 listing_photos_v2
      const v1Photos = await trx("market_images").where({ details_id: v1Listing.details_id }).whereNotNull("resource_id")
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
    if (v1Listing.quantity_available < 0) {
      return { success: false, v1_listing_id: v1Listing.listing_id, error: "Invalid quantity (must be >= 0)" }
    }
    const seller_id = v1Listing.user_seller_id || v1Listing.contractor_seller_id
    const seller_type = v1Listing.user_seller_id ? "user" : "contractor"
    if (!seller_id) {
      return { success: false, v1_listing_id: v1Listing.listing_id, error: "Missing seller_id" }
    }

    const v2Status = normalizeStatus(v1Listing.status, v1Listing.expiration)
    const v2SaleType = normalizeSaleType(v1Listing.sale_type)

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
      if (bundleEntries.length === 0) {
        throw new Error("Bundle has no sub-items in market_multiple_listings")
      }

      for (let i = 0; i < bundleEntries.length; i++) {
        const entry = bundleEntries[i]
        const entryGameItemId = entry.game_item_id || null

        const [listingItem] = await trx("listing_items")
          .insert({
            listing_id: listing.listing_id,
            game_item_id: entryGameItemId,
            pricing_mode: "unified",
            base_price: i === 0 ? v1Listing.price : 0,
            display_order: i,
            quantity_available: 0,
            variant_count: 0,
            bulk_discount_tiers: i === 0 ? (v1Listing.bulk_discount_tiers || null) : null,
          })
          .returning("*")

          const variantId = await getOrCreateVariant(
            entryGameItemId,
            DEFAULT_V1_VARIANT_ATTRIBUTES,
            trx,
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
                  owner_id: v1Lot.owner_id || seller_id,
                  listed: v1Lot.listed,
                  notes: v1Lot.notes,
                  game_item_id: entryGameItemId,
                  listing_id: listing.listing_id,
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
                game_item_id: entryGameItemId,
                listing_id: listing.listing_id,
                created_at: v1Listing.timestamp,
                updated_at: v1Listing.timestamp,
              })
            }
          }

        // Migrate photos for this sub-item
        const v1Photos = await trx("market_images").where({ details_id: entry.details_id }).whereNotNull("resource_id")
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

  /**
   * Migrates V1 market_price_history → V2 price_history_v2.
   * V1 has daily snapshots per game_item_id.
   * V2 is event-based per variant — we use the default variant and event_type='legacy_snapshot'.
   */
  async migratePriceHistory(): Promise<MigrationSummary> {
    const db = getKnex()
    const summary: MigrationSummary = { total_attempted: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

    try {
      const v1Rows = await db("market_price_history").select("*")
      summary.total_attempted = v1Rows.length

      for (const row of v1Rows) {
        if (!row.game_item_id) { summary.skipped++; continue }

        // Check if already migrated (by game_item_id + date)
        const existing = await db("price_history_v2")
          .where({ game_item_id: row.game_item_id, event_type: "legacy_snapshot" })
          .whereRaw("recorded_at::date = ?::date", [row.date])
          .first()
        if (existing) { summary.skipped++; continue }

        try {
          // Get or create default variant for this game item
          const variantId = await getOrCreateVariant(row.game_item_id, DEFAULT_V1_VARIANT_ATTRIBUTES)

          await db("price_history_v2").insert({
            game_item_id: row.game_item_id,
            variant_id: variantId,
            price: row.price,
            quality_tier: null,
            listing_id: null,
            event_type: "legacy_snapshot",
            recorded_at: row.date,
          })
          summary.successful++
        } catch (error) {
          summary.failed++
          summary.errors.push({ v1_listing_id: `price_${row.game_item_id}_${row.date}`, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    } catch (error) {
      throw new Error(`Failed to migrate price history: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    return summary
  }

  /**
   * Migrates V1 auction data (market_auction_details + market_bids) → V2 tables.
   * Requires auction_details_v2 and bids_v2 tables to exist.
   */
  async migrateAuctionData(): Promise<MigrationSummary> {
    const db = getKnex()
    const summary: MigrationSummary = { total_attempted: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

    const hasAuctionTable = await db.schema.hasTable("auction_details_v2")
    const hasBidsTable = await db.schema.hasTable("bids_v2")
    if (!hasAuctionTable || !hasBidsTable) {
      return summary // Tables don't exist yet, skip
    }

    try {
      const v1Auctions = await db("market_auction_details").select("*")
      summary.total_attempted = v1Auctions.length

      for (const auction of v1Auctions) {
        // Need the V2 listing_id from the mapping table
        const mapping = await db("v1_v2_listing_map").where({ v1_listing_id: auction.listing_id }).first()
        if (!mapping) { summary.skipped++; continue }

        // Check if already migrated
        const existing = await db("auction_details_v2").where({ listing_id: mapping.v2_listing_id }).first()
        if (existing) { summary.skipped++; continue }

        try {
          // Find the winning bid
          const bids = await db("market_bids").where({ listing_id: auction.listing_id }).orderBy("bid", "desc")
          const winningBid = bids[0]

          await db("auction_details_v2").insert({
            listing_id: mapping.v2_listing_id,
            end_time: auction.end_time,
            min_bid_increment: auction.minimum_bid_increment,
            buyout_price: auction.buyout_price || null,
            reserve_price: null,
            status: auction.status === "concluded" ? "concluded" : auction.status === "active" ? "active" : "cancelled",
            winner_id: auction.status === "concluded" && winningBid ? (winningBid.user_bidder_id || null) : null,
            winning_bid: auction.status === "concluded" && winningBid ? winningBid.bid : null,
            concluded_at: auction.status === "concluded" ? auction.end_time : null,
          })

          // Migrate bids
          for (const bid of bids) {
            await db("bids_v2").insert({
              listing_id: mapping.v2_listing_id,
              bidder_id: bid.user_bidder_id,
              bidder_type: bid.contractor_bidder_id ? "contractor" : "user",
              contractor_id: bid.contractor_bidder_id || null,
              amount: bid.bid,
              is_active: bid === winningBid && auction.status === "active",
              created_at: bid.timestamp,
            })
          }

          summary.successful++
        } catch (error) {
          summary.failed++
          summary.errors.push({ v1_listing_id: auction.listing_id, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    } catch (error) {
      throw new Error(`Failed to migrate auction data: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    return summary
  }

  /**
   * Migrates V1 market_orders → V2 order_market_items_v2.
   * Only migrates orders whose listing has been migrated to V2 (exists in v1_v2_listing_map).
   * Skips orders that already have V2 rows.
   */
  async migrateOrderLineItems(): Promise<MigrationSummary> {
    const db = getKnex()
    const summary: MigrationSummary = { total_attempted: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

    try {
      // Get all V1 order line items that have a mapped V2 listing
      const v1Rows = await db("market_orders as mo")
        .join("v1_v2_listing_map as m", "mo.listing_id", "m.v1_listing_id")
        .join("listing_items as li", "m.v2_listing_id", "li.listing_id")
        .join("market_listings as ml", "mo.listing_id", "ml.listing_id")
        .select(
          "mo.order_id", "mo.listing_id as v1_listing_id", "mo.quantity",
          "m.v2_listing_id as listing_id", "li.item_id", "li.game_item_id",
          "ml.price",
        )

      summary.total_attempted = v1Rows.length

      for (const row of v1Rows) {
        // Skip if V2 row already exists for this order+listing
        const existing = await db("order_market_items_v2")
          .where({ order_id: row.order_id, listing_id: row.listing_id })
          .first()
        if (existing) { summary.skipped++; continue }

        try {
          const variantId = await getOrCreateVariant(row.game_item_id, DEFAULT_V1_VARIANT_ATTRIBUTES)

          await db("order_market_items_v2").insert({
            order_id: row.order_id,
            listing_id: row.listing_id,
            item_id: row.item_id,
            variant_id: variantId,
            quantity: row.quantity,
            price_per_unit: row.price,
          })
          summary.successful++
        } catch (error) {
          summary.failed++
          summary.errors.push({ v1_listing_id: `order_${row.order_id}_${row.v1_listing_id}`, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    } catch (error) {
      throw new Error(`Failed to migrate order line items: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    return summary
  }

  /**
   * Migrates V1 market_buy_orders → V2 buy_orders_v2.
   * Skips buy orders that already exist in V2 (by buyer_id + game_item_id + created_timestamp).
   */
  async migrateBuyOrders(): Promise<MigrationSummary> {
    const db = getKnex()
    const summary: MigrationSummary = { total_attempted: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

    try {
      const v1Rows = await db("market_buy_orders").select("*")
      summary.total_attempted = v1Rows.length

      for (const row of v1Rows) {
        if (!row.game_item_id) { summary.skipped++; continue }

        // Idempotency: check if already migrated
        const existing = await db("buy_orders_v2")
          .where({ buyer_id: row.buyer_id, game_item_id: row.game_item_id })
          .whereRaw("created_at = ?", [row.created_timestamp])
          .first()
        if (existing) { summary.skipped++; continue }

        try {
          await db("buy_orders_v2").insert({
            buyer_id: row.buyer_id,
            game_item_id: row.game_item_id,
            quantity_desired: row.quantity,
            price_max: row.price,
            status: row.fulfilled_timestamp ? "fulfilled" : (row.expiry < new Date() ? "expired" : "active"),
            created_at: row.created_timestamp,
            updated_at: row.created_timestamp,
            expires_at: row.expiry,
          })
          summary.successful++
        } catch (error) {
          summary.failed++
          summary.errors.push({ v1_listing_id: `buy_order_${row.buy_order_id}`, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    } catch (error) {
      throw new Error(`Failed to migrate buy orders: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    return summary
  }

  /**
   * Migrates V1 offer_market_items → V2 offer_market_items_v2.
   */
  async migrateOfferLineItems(): Promise<MigrationSummary> {
    const db = getKnex()
    const summary: MigrationSummary = { total_attempted: 0, successful: 0, failed: 0, skipped: 0, errors: [] }

    try {
      const v1Rows = await db("offer_market_items as omi")
        .join("v1_v2_listing_map as m", "omi.listing_id", "m.v1_listing_id")
        .join("listing_items as li", "m.v2_listing_id", "li.listing_id")
        .join("market_listings as ml", "omi.listing_id", "ml.listing_id")
        .select(
          "omi.offer_id", "omi.listing_id as v1_listing_id", "omi.quantity",
          "m.v2_listing_id as listing_id", "li.game_item_id",
          "ml.price",
        )

      summary.total_attempted = v1Rows.length

      for (const row of v1Rows) {
        const existing = await db("offer_market_items_v2")
          .where({ offer_id: row.offer_id, listing_id: row.listing_id })
          .first()
        if (existing) { summary.skipped++; continue }

        try {
          const variantId = await getOrCreateVariant(row.game_item_id, DEFAULT_V1_VARIANT_ATTRIBUTES)

          await db("offer_market_items_v2").insert({
            offer_id: row.offer_id,
            listing_id: row.listing_id,
            variant_id: variantId,
            quantity: row.quantity,
            price_per_unit: row.price,
          })
          summary.successful++
        } catch (error) {
          summary.failed++
          summary.errors.push({ v1_listing_id: `offer_${row.offer_id}_${row.v1_listing_id}`, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    } catch (error) {
      throw new Error(`Failed to migrate offer line items: ${error instanceof Error ? error.message : "Unknown error"}`)
    }

    return summary
  }
}

export const v1ToV2MigrationService = new V1ToV2MigrationService()
