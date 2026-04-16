/**
 * Migration Service
 *
 * Populates V2 tables from V1 data without modifying V1 tables.
 * Implements atomic migration with verification and rollback support.
 *
 * Requirements: 1.4, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { VariantService } from "./variant.service.js"
import logger from "../../logger/logger.js"

/**
 * Migration status report
 */
export interface MigrationReport {
  listings_migrated: number
  variants_created: number
  stock_lots_migrated: number
  errors: string[]
  duration_ms: number
}

/**
 * V1 listing snapshot for verification
 */
interface V1Snapshot {
  unique_listings_count: number
  aggregate_listings_count: number
  multiple_listings_count: number
  unique_listings_checksum: string
  aggregate_listings_checksum: string
  multiple_listings_checksum: string
}

export class MigrationService {
  private knex: Knex
  private variantService: VariantService

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
    this.variantService = new VariantService(this.knex)
  }

  /**
   * Run complete migration from V1 to V2
   *
   * Transaction flow:
   * 1. Snapshot V1 tables for verification
   * 2. Migrate unique_listings to listings (listing_type='single')
   * 3. Migrate aggregate_listings to listings (listing_type='bulk')
   * 4. Migrate multiple_listings to listings (listing_type='bundle')
   * 5. Create default variants for all game items
   * 6. Migrate inventory to stock_lots
   * 7. Verify V1 tables unchanged
   * 8. Verify all V1 listings have V2 equivalents
   *
   * Requirements: 11.6
   */
  async runMigration(): Promise<MigrationReport> {
    const startTime = Date.now()
    const report: MigrationReport = {
      listings_migrated: 0,
      variants_created: 0,
      stock_lots_migrated: 0,
      errors: [],
      duration_ms: 0,
    }

    try {
      logger.info("Starting V1 to V2 migration")

      // Execute in transaction for atomicity
      await this.knex.transaction(async (trx) => {
        // Step 1: Snapshot V1 tables before migration
        const v1Snapshot = await this.snapshotV1Tables(trx)
        logger.info("V1 snapshot captured", v1Snapshot)

        // Step 2: Migrate unique listings
        const uniqueCount = await this.migrateUniqueListings(trx)
        report.listings_migrated += uniqueCount
        logger.info(`Migrated ${uniqueCount} unique listings`)

        // Step 3: Migrate aggregate listings
        const aggregateCount = await this.migrateAggregateListings(trx)
        report.listings_migrated += aggregateCount
        logger.info(`Migrated ${aggregateCount} aggregate listings`)

        // Step 4: Migrate multiple listings
        const multipleCount = await this.migrateMultipleListings(trx)
        report.listings_migrated += multipleCount
        logger.info(`Migrated ${multipleCount} multiple listings`)

        // Step 5: Create default variants
        const variantsCount = await this.createDefaultVariants(trx)
        report.variants_created = variantsCount
        logger.info(`Created ${variantsCount} default variants`)

        // Step 6: Migrate stock lots
        const stockLotsCount = await this.migrateStockLots(trx)
        report.stock_lots_migrated = stockLotsCount
        logger.info(`Migrated ${stockLotsCount} stock lots`)

        // Step 7: Verify V1 tables unchanged
        await this.verifyV1Unchanged(trx, v1Snapshot)
        logger.info("V1 tables verification passed")

        // Step 8: Verify migration completeness
        await this.verifyMigrationCompleteness(trx)
        logger.info("Migration completeness verification passed")
      })

      report.duration_ms = Date.now() - startTime
      logger.info("Migration completed successfully", report)

      return report
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      report.errors.push(errorMessage)
      report.duration_ms = Date.now() - startTime

      logger.error("Migration failed", {
        error: errorMessage,
        report,
      })

      throw error
    }
  }

  /**
   * Snapshot V1 tables for verification
   *
   * Captures counts and checksums to verify V1 data remains unchanged.
   *
   * Requirements: 1.4, 11.5
   */
  private async snapshotV1Tables(trx: Knex.Transaction): Promise<V1Snapshot> {
    // Count unique listings
    const [{ count: uniqueCount }] = await trx("market_unique_listings")
      .count("* as count")

    // Count aggregate listings
    const [{ count: aggregateCount }] = await trx(
      "market_aggregate_listings_legacy",
    ).count("* as count")

    // Count multiple listings
    const [{ count: multipleCount }] = await trx(
      "market_multiple_listings",
    ).count("* as count")

    // Compute checksums (simple approach: concatenate IDs and hash)
    const uniqueChecksum = await this.computeTableChecksum(
      trx,
      "market_unique_listings",
      "listing_id",
    )
    const aggregateChecksum = await this.computeTableChecksum(
      trx,
      "market_aggregate_listings_legacy",
      "listing_id",
    )
    const multipleChecksum = await this.computeTableChecksum(
      trx,
      "market_multiple_listings",
      "multiple_listing_id",
    )

    return {
      unique_listings_count: parseInt(String(uniqueCount), 10),
      aggregate_listings_count: parseInt(String(aggregateCount), 10),
      multiple_listings_count: parseInt(String(multipleCount), 10),
      unique_listings_checksum: uniqueChecksum,
      aggregate_listings_checksum: aggregateChecksum,
      multiple_listings_checksum: multipleChecksum,
    }
  }

  /**
   * Compute checksum for a table
   */
  private async computeTableChecksum(
    trx: Knex.Transaction,
    tableName: string,
    idColumn: string,
  ): Promise<string> {
    const result = await trx.raw(
      `
      SELECT md5(string_agg(${idColumn}::text, ',' ORDER BY ${idColumn})) as checksum
      FROM ${tableName}
      `,
    )

    return result.rows[0]?.checksum || "empty"
  }

  /**
   * Migrate unique listings to V2 format
   *
   * Maps:
   * - market_unique_listings -> listings (listing_type='single')
   * - market_listing_details -> listings (title, description)
   * - market_listings -> listings (price, status, timestamps)
   *
   * Requirements: 11.1, 11.3
   */
  private async migrateUniqueListings(
    trx: Knex.Transaction,
  ): Promise<number> {
    const result = await trx.raw(`
      INSERT INTO listings (
        listing_id,
        seller_id,
        seller_type,
        title,
        description,
        status,
        visibility,
        sale_type,
        listing_type,
        created_at,
        updated_at,
        expires_at
      )
      SELECT
        ul.listing_id,
        COALESCE(ml.user_seller_id, ml.contractor_seller_id) as seller_id,
        CASE
          WHEN ml.user_seller_id IS NOT NULL THEN 'user'
          ELSE 'contractor'
        END as seller_type,
        mld.title,
        mld.description,
        ml.status,
        CASE WHEN ml.internal THEN 'internal' ELSE 'public' END as visibility,
        ml.sale_type,
        'single' as listing_type,
        ml.timestamp as created_at,
        ml.timestamp as updated_at,
        ml.expiration as expires_at
      FROM market_unique_listings ul
      INNER JOIN market_listings ml ON ul.listing_id = ml.listing_id
      INNER JOIN market_listing_details mld ON ul.details_id = mld.details_id
      WHERE mld.game_item_id IS NOT NULL
      ON CONFLICT (listing_id) DO NOTHING
    `)

    return result.rowCount || 0
  }

  /**
   * Migrate aggregate listings to V2 format
   *
   * Maps:
   * - market_aggregate_listings_legacy -> listings (listing_type='bulk')
   * - market_aggregates -> listing_items
   * - market_listing_details -> listings (title, description)
   *
   * Requirements: 11.1, 11.3
   */
  private async migrateAggregateListings(
    trx: Knex.Transaction,
  ): Promise<number> {
    const result = await trx.raw(`
      INSERT INTO listings (
        listing_id,
        seller_id,
        seller_type,
        title,
        description,
        status,
        visibility,
        sale_type,
        listing_type,
        created_at,
        updated_at
      )
      SELECT
        al.listing_id,
        COALESCE(al.user_seller_id, al.contractor_seller_id) as seller_id,
        CASE
          WHEN al.user_seller_id IS NOT NULL THEN 'user'
          ELSE 'contractor'
        END as seller_type,
        mld.title,
        mld.description,
        al.status,
        CASE WHEN al.internal THEN 'internal' ELSE 'public' END as visibility,
        'fixed' as sale_type,
        'bulk' as listing_type,
        al.timestamp as created_at,
        al.timestamp as updated_at
      FROM market_aggregate_listings_legacy al
      INNER JOIN market_aggregates ma ON al.aggregate_id = ma.wiki_id
      INNER JOIN market_listing_details mld ON ma.details_id = mld.details_id
      WHERE mld.game_item_id IS NOT NULL
      ON CONFLICT (listing_id) DO NOTHING
    `)

    return result.rowCount || 0
  }

  /**
   * Migrate multiple listings to V2 format
   *
   * Maps:
   * - market_multiple_listings -> listings (listing_type='bundle')
   * - market_multiples -> listing metadata
   * - market_listing_details -> listings (title, description)
   *
   * Requirements: 11.1, 11.3
   */
  private async migrateMultipleListings(
    trx: Knex.Transaction,
  ): Promise<number> {
    const result = await trx.raw(`
      INSERT INTO listings (
        listing_id,
        seller_id,
        seller_type,
        title,
        description,
        status,
        visibility,
        sale_type,
        listing_type,
        created_at,
        updated_at
      )
      SELECT
        ml.multiple_listing_id as listing_id,
        COALESCE(mm.user_seller_id, mm.contractor_seller_id) as seller_id,
        CASE
          WHEN mm.user_seller_id IS NOT NULL THEN 'user'
          ELSE 'contractor'
        END as seller_type,
        mld.title,
        mld.description,
        'active' as status,
        'public' as visibility,
        'fixed' as sale_type,
        'bundle' as listing_type,
        mm.timestamp as created_at,
        mm.timestamp as updated_at
      FROM market_multiple_listings ml
      INNER JOIN market_multiples mm ON ml.multiple_id = mm.multiple_id
      INNER JOIN market_listing_details mld ON ml.details_id = mld.details_id
      WHERE mld.game_item_id IS NOT NULL
      ON CONFLICT (listing_id) DO NOTHING
    `)

    return result.rowCount || 0
  }

  /**
   * Create default variants for all game items
   *
   * Creates a default variant for each unique game_item_id found in V1 listings.
   * Default attributes:
   * - quality_tier: 1
   * - quality_value: 25
   * - crafted_source: 'store'
   *
   * Requirements: 11.2
   */
  private async createDefaultVariants(
    trx: Knex.Transaction,
  ): Promise<number> {
    // Get all unique game_item_ids from migrated listings
    const gameItems = await trx("market_listing_details")
      .distinct("game_item_id")
      .whereNotNull("game_item_id")

    let variantsCreated = 0

    for (const { game_item_id } of gameItems) {
      try {
        // Use variant service to get or create default variant
        const variant = await this.variantService.getOrCreateVariant({
          game_item_id,
          attributes: {
            quality_tier: 1,
            quality_value: 25,
            crafted_source: "store",
          },
        })

        variantsCreated++

        logger.debug("Default variant created", {
          gameItemId: game_item_id,
          variantId: variant.variant_id,
        })
      } catch (error) {
        logger.warn("Failed to create default variant", {
          gameItemId: game_item_id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return variantsCreated
  }

  /**
   * Migrate V1 inventory to stock_lots
   *
   * Creates listing_items and stock_lots for each migrated listing.
   * Links stock_lots to default variants.
   *
   * Requirements: 11.4
   */
  private async migrateStockLots(trx: Knex.Transaction): Promise<number> {
    let stockLotsMigrated = 0

    // Migrate unique listings inventory
    const uniqueListings = await trx.raw(`
      SELECT
        l.listing_id,
        mld.game_item_id,
        ml.price,
        ml.quantity_available
      FROM listings l
      INNER JOIN market_unique_listings ul ON l.listing_id = ul.listing_id
      INNER JOIN market_listings ml ON ul.listing_id = ml.listing_id
      INNER JOIN market_listing_details mld ON ul.details_id = mld.details_id
      WHERE l.listing_type = 'single'
        AND mld.game_item_id IS NOT NULL
    `)

    for (const row of uniqueListings.rows) {
      await this.createListingItemAndStockLot(
        trx,
        row.listing_id,
        row.game_item_id,
        row.price,
        row.quantity_available,
      )
      stockLotsMigrated++
    }

    // Migrate aggregate listings inventory
    const aggregateListings = await trx.raw(`
      SELECT
        l.listing_id,
        mld.game_item_id,
        al.price,
        al.quantity_available
      FROM listings l
      INNER JOIN market_aggregate_listings_legacy al ON l.listing_id = al.listing_id
      INNER JOIN market_aggregates ma ON al.aggregate_id = ma.wiki_id
      INNER JOIN market_listing_details mld ON ma.details_id = mld.details_id
      WHERE l.listing_type = 'bulk'
        AND mld.game_item_id IS NOT NULL
    `)

    for (const row of aggregateListings.rows) {
      await this.createListingItemAndStockLot(
        trx,
        row.listing_id,
        row.game_item_id,
        row.price,
        row.quantity_available,
      )
      stockLotsMigrated++
    }

    // Migrate multiple listings inventory
    const multipleListings = await trx.raw(`
      SELECT
        l.listing_id,
        mld.game_item_id,
        1 as price,
        1 as quantity_available
      FROM listings l
      INNER JOIN market_multiple_listings ml ON l.listing_id = ml.multiple_listing_id
      INNER JOIN market_listing_details mld ON ml.details_id = mld.details_id
      WHERE l.listing_type = 'bundle'
        AND mld.game_item_id IS NOT NULL
    `)

    for (const row of multipleListings.rows) {
      await this.createListingItemAndStockLot(
        trx,
        row.listing_id,
        row.game_item_id,
        row.price,
        row.quantity_available,
      )
      stockLotsMigrated++
    }

    return stockLotsMigrated
  }

  /**
   * Create listing_item and stock_lot for a listing
   */
  private async createListingItemAndStockLot(
    trx: Knex.Transaction,
    listingId: string,
    gameItemId: string,
    price: number,
    quantity: number,
  ): Promise<void> {
    // Check if listing_item already exists
    const existingItem = await trx("listing_items")
      .where({ listing_id: listingId, game_item_id: gameItemId })
      .first()

    if (existingItem) {
      logger.debug("Listing item already exists, skipping", {
        listingId,
        gameItemId,
      })
      return
    }

    // Create listing_item
    const [listingItem] = await trx("listing_items")
      .insert({
        listing_id: listingId,
        game_item_id: trx.raw("?::uuid", [gameItemId]),
        pricing_mode: "unified",
        base_price: price,
        display_order: 0,
      })
      .returning("*")

    // Get default variant for this game item
    const variant = await this.variantService.getOrCreateVariant({
      game_item_id: gameItemId,
      attributes: {
        quality_tier: 1,
        quality_value: 25,
        crafted_source: "store",
      },
    })

    // Create stock_lot
    await trx("stock_lots").insert({
      item_id: listingItem.item_id,
      variant_id: variant.variant_id,
      quantity_total: quantity,
      listed: true,
    })

    logger.debug("Stock lot created", {
      listingId,
      itemId: listingItem.item_id,
      variantId: variant.variant_id,
      quantity,
    })
  }

  /**
   * Verify V1 tables remain unchanged after migration
   *
   * Compares current V1 state with snapshot taken before migration.
   * Throws error if any changes detected.
   *
   * Requirements: 1.4, 11.5
   */
  private async verifyV1Unchanged(
    trx: Knex.Transaction,
    snapshot: V1Snapshot,
  ): Promise<void> {
    const currentSnapshot = await this.snapshotV1Tables(trx)

    const errors: string[] = []

    // Verify counts unchanged
    if (
      currentSnapshot.unique_listings_count !== snapshot.unique_listings_count
    ) {
      errors.push(
        `Unique listings count changed: ${snapshot.unique_listings_count} -> ${currentSnapshot.unique_listings_count}`,
      )
    }

    if (
      currentSnapshot.aggregate_listings_count !==
      snapshot.aggregate_listings_count
    ) {
      errors.push(
        `Aggregate listings count changed: ${snapshot.aggregate_listings_count} -> ${currentSnapshot.aggregate_listings_count}`,
      )
    }

    if (
      currentSnapshot.multiple_listings_count !==
      snapshot.multiple_listings_count
    ) {
      errors.push(
        `Multiple listings count changed: ${snapshot.multiple_listings_count} -> ${currentSnapshot.multiple_listings_count}`,
      )
    }

    // Verify checksums unchanged
    if (
      currentSnapshot.unique_listings_checksum !==
      snapshot.unique_listings_checksum
    ) {
      errors.push("Unique listings data modified")
    }

    if (
      currentSnapshot.aggregate_listings_checksum !==
      snapshot.aggregate_listings_checksum
    ) {
      errors.push("Aggregate listings data modified")
    }

    if (
      currentSnapshot.multiple_listings_checksum !==
      snapshot.multiple_listings_checksum
    ) {
      errors.push("Multiple listings data modified")
    }

    if (errors.length > 0) {
      throw new Error(
        `V1 data verification failed: ${errors.join("; ")}`,
      )
    }
  }

  /**
   * Verify all V1 listings have V2 equivalents
   *
   * Checks that every V1 listing has been migrated to V2.
   * Throws error if any listings are missing.
   *
   * Requirements: 11.5
   */
  private async verifyMigrationCompleteness(
    trx: Knex.Transaction,
  ): Promise<void> {
    // Count V1 listings
    const [{ count: v1UniqueCount }] = await trx("market_unique_listings")
      .join("market_listing_details", "market_unique_listings.details_id", "market_listing_details.details_id")
      .whereNotNull("market_listing_details.game_item_id")
      .count("* as count")

    const [{ count: v1AggregateCount }] = await trx(
      "market_aggregate_listings_legacy",
    )
      .join("market_aggregates", "market_aggregate_listings_legacy.aggregate_id", "market_aggregates.wiki_id")
      .join("market_listing_details", "market_aggregates.details_id", "market_listing_details.details_id")
      .whereNotNull("market_listing_details.game_item_id")
      .count("* as count")

    const [{ count: v1MultipleCount }] = await trx("market_multiple_listings")
      .join("market_listing_details", "market_multiple_listings.details_id", "market_listing_details.details_id")
      .whereNotNull("market_listing_details.game_item_id")
      .count("* as count")

    const v1TotalCount =
      parseInt(String(v1UniqueCount), 10) +
      parseInt(String(v1AggregateCount), 10) +
      parseInt(String(v1MultipleCount), 10)

    // Count V2 listings
    const [{ count: v2Count }] = await trx("listings").count("* as count")

    const v2TotalCount = parseInt(String(v2Count), 10)

    if (v2TotalCount < v1TotalCount) {
      throw new Error(
        `Migration incomplete: ${v1TotalCount} V1 listings but only ${v2TotalCount} V2 listings`,
      )
    }

    logger.info("Migration completeness verified", {
      v1TotalCount,
      v2TotalCount,
    })
  }
}
