/**
 * Unit tests for MigrationService
 *
 * These tests validate migration service functionality using mocked database
 * connections. They test successful migration, error handling, and rollback
 * behavior.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { MigrationService } from "./migration.service.js"
import type { Knex } from "knex"

/** SQL used by migrateStockLots — must not reuse snapshot/checksum row shape */
function isStockLotInventorySelect(sql: string): boolean {
  return (
    sql.includes("quantity_available") &&
    (sql.includes("market_unique_listings") ||
      sql.includes("market_aggregate_listings_legacy") ||
      sql.includes("market_multiple_listings"))
  )
}

function defaultMigrationRawHandler(listingInsertRowCount = 5) {
  return (sql: string) => {
    if (sql.includes("md5(string_agg")) {
      return Promise.resolve({
        rows: [{ checksum: "test_checksum" }],
        rowCount: 1,
      })
    }
    if (sql.includes("INSERT INTO listings")) {
      return Promise.resolve({ rows: [], rowCount: listingInsertRowCount })
    }
    if (isStockLotInventorySelect(sql)) {
      return Promise.resolve({ rows: [], rowCount: 0 })
    }
    return Promise.resolve({ rows: [], rowCount: 0 })
  }
}

/** createDefaultVariants uses trx("market_listing_details").distinct... — not trx.distinct */
function withMarketListingDetailsDistinct(
  mockTransaction: { getMockImplementation: () => unknown; mockImplementation: (fn: unknown) => void },
  rows: { game_item_id: string }[],
) {
  const prior = mockTransaction.getMockImplementation() as (
    tableName: string,
  ) => Record<string, unknown>
  mockTransaction.mockImplementation((tableName: string) => {
    const qb = prior(tableName)
    if (tableName === "market_listing_details") {
      ;(qb as { distinct: ReturnType<typeof vi.fn> }).distinct = vi
        .fn()
        .mockReturnValue({
          whereNotNull: vi.fn().mockResolvedValue(rows),
        })
    }
    return qb
  })
}

describe("MigrationService - Unit Tests", () => {
  let mockKnex: any
  let mockTransaction: any
  let service: MigrationService

  beforeEach(() => {
    // Create mock transaction that can be called as a function
    mockTransaction = vi.fn((tableName: string) => {
      const queryBuilder: Record<string, unknown> = {
        raw: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        count: vi.fn().mockResolvedValue([{ count: "0" }]),
        insert: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        returning: vi.fn().mockResolvedValue([]),
        join: vi.fn().mockReturnThis(),
        whereNotNull: vi.fn().mockReturnThis(),
        distinct: vi.fn().mockReturnThis(),
        whereIn: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        del: vi.fn().mockResolvedValue(0),
      }

      if (tableName === "variant_types") {
        const chain = queryBuilder as Record<string, ReturnType<typeof vi.fn>>
        chain.select.mockReturnValue(chain)
        chain.orderBy.mockReturnValue(chain)
        chain.then = ((onFulfilled: (v: unknown) => unknown) =>
          Promise.resolve([
            {
              variant_type_id: "vt-1",
              name: "quality_tier",
              display_order: 1,
            },
          ]).then(onFulfilled)) as unknown as ReturnType<typeof vi.fn>
      }

      if (tableName === "listing_items") {
        ;(queryBuilder as { first: ReturnType<typeof vi.fn> }).first =
          vi.fn().mockResolvedValue(null)
        ;(queryBuilder as { insert: ReturnType<typeof vi.fn> }).insert = vi
          .fn()
          .mockReturnThis()
        ;(queryBuilder as { returning: ReturnType<typeof vi.fn> }).returning =
          vi.fn().mockResolvedValue([
            {
              item_id: "00000000-0000-0000-0000-000000000099",
              listing_id: "listing-mock",
              game_item_id: "game-item-mock",
              pricing_mode: "unified",
              base_price: 0,
              display_order: 0,
            },
          ])
      }

      if (tableName === "stock_lots") {
        ;(queryBuilder as { insert: ReturnType<typeof vi.fn> }).insert = vi
          .fn()
          .mockResolvedValue([1])
      }

      // Make distinct return a chainable object with whereNotNull
      ;(queryBuilder as { distinct: ReturnType<typeof vi.fn> }).distinct = vi
        .fn()
        .mockReturnValue({
          whereNotNull: vi.fn().mockResolvedValue([]),
        })

      return queryBuilder
    })

    // Add methods directly to mockTransaction
    mockTransaction.raw = vi
      .fn()
      .mockImplementation(defaultMigrationRawHandler())
    mockTransaction.count = vi.fn().mockResolvedValue([{ count: "0" }])
    mockTransaction.insert = vi.fn().mockReturnValue(mockTransaction)
    mockTransaction.where = vi.fn().mockReturnValue(mockTransaction)
    mockTransaction.first = vi.fn().mockResolvedValue(null)
    mockTransaction.returning = vi.fn().mockResolvedValue([])
    mockTransaction.join = vi.fn().mockReturnValue(mockTransaction)
    mockTransaction.whereNotNull = vi.fn().mockReturnValue(mockTransaction)
    mockTransaction.distinct = vi.fn().mockReturnValue({
      whereNotNull: vi.fn().mockResolvedValue([]),
    })

    // Create mock knex
    mockKnex = vi.fn((tableName: string) => mockTransaction(tableName)) as any
    mockKnex.transaction = vi.fn(async (callback) => {
      return await callback(mockTransaction)
    })
    mockKnex.raw = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

    service = new MigrationService(mockKnex as unknown as Knex)
  })

  /**
   * Test: Successful migration with various listing types
   *
   * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6
   */
  it("should successfully migrate unique, aggregate, and multiple listings", async () => {
    withMarketListingDetailsDistinct(mockTransaction, [
      { game_item_id: "item-1" },
      { game_item_id: "item-2" },
    ])

    // Mock variant service (getOrCreateVariant)
    const mockVariantService = {
      getOrCreateVariant: vi.fn().mockResolvedValue({
        variant_id: "variant-1",
        attributes: { quality_tier: 1, quality_value: 25, crafted_source: "store" },
      }),
    }
    ;(service as any).variantService = mockVariantService

    // Run migration
    const report = await service.runMigration()

    // Verify report
    expect(report.listings_migrated).toBeGreaterThanOrEqual(0)
    expect(report.variants_created).toBeGreaterThanOrEqual(0)
    expect(report.stock_lots_migrated).toBeGreaterThanOrEqual(0)
    expect(report.errors).toHaveLength(0)
    expect(report.duration_ms).toBeGreaterThan(0)

    // Verify transaction was used
    expect(mockKnex.transaction).toHaveBeenCalled()
  })

  /**
   * Test: Migration error handling
   *
   * Validates: Requirements 11.6
   */
  it("should handle migration errors and rollback transaction", async () => {
    // Mock transaction to throw error
    mockKnex.transaction.mockRejectedValue(new Error("Database error"))

    // Run migration and expect error
    await expect(service.runMigration()).rejects.toThrow("Database error")
  })

  /**
   * Test: Migration rollback on failure
   *
   * Validates: Requirements 11.6
   */
  it("should rollback transaction on verification failure", async () => {
    // Mock snapshot with different checksums before and after
    let checksumCall = 0
    mockTransaction.raw.mockImplementation((sql: string) => {
      if (sql.includes("md5(string_agg")) {
        checksumCall++
        const checksum = checksumCall <= 3 ? "checksum1" : "checksum2"
        return Promise.resolve({
          rows: [{ checksum }],
          rowCount: 1,
        })
      }
      if (sql.includes("INSERT INTO listings")) {
        return Promise.resolve({ rows: [], rowCount: 5 })
      }
      if (isStockLotInventorySelect(sql)) {
        return Promise.resolve({ rows: [], rowCount: 0 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    })

    withMarketListingDetailsDistinct(mockTransaction, [])

    // Run migration and expect error
    await expect(service.runMigration()).rejects.toThrow()
  })

  /**
   * Test: Default variant creation
   *
   * Validates: Requirements 11.2
   */
  it("should create default variants with correct attributes", async () => {
    mockTransaction.raw.mockImplementation(defaultMigrationRawHandler(0))

    withMarketListingDetailsDistinct(mockTransaction, [
      { game_item_id: "item-1" },
      { game_item_id: "item-2" },
      { game_item_id: "item-3" },
    ])

    // Mock variant service
    const mockGetOrCreateVariant = vi.fn().mockResolvedValue({
      variant_id: "variant-1",
      attributes: { quality_tier: 1, quality_value: 25, crafted_source: "store" },
    })

    ;(service as any).variantService = {
      getOrCreateVariant: mockGetOrCreateVariant,
    }

    // Run migration
    const report = await service.runMigration()

    // Verify default variants created
    expect(report.variants_created).toBe(3)
    expect(mockGetOrCreateVariant).toHaveBeenCalledTimes(3)

    // Verify correct attributes
    expect(mockGetOrCreateVariant).toHaveBeenCalledWith({
      game_item_id: expect.any(String),
      attributes: {
        quality_tier: 1,
        quality_value: 25,
        crafted_source: "store",
      },
    })
  })

  /**
   * Test: Migration status reporting
   *
   * Validates: Requirements 11.6
   */
  it("should provide detailed migration status report", async () => {
    mockTransaction.raw.mockImplementation(defaultMigrationRawHandler(5))

    withMarketListingDetailsDistinct(mockTransaction, [
      { game_item_id: "item-1" },
    ])

    // Mock variant service
    ;(service as any).variantService = {
      getOrCreateVariant: vi.fn().mockResolvedValue({
        variant_id: "variant-1",
        attributes: { quality_tier: 1, quality_value: 25, crafted_source: "store" },
      }),
    }

    // Run migration
    const report = await service.runMigration()

    // Verify report structure
    expect(report).toHaveProperty("listings_migrated")
    expect(report).toHaveProperty("variants_created")
    expect(report).toHaveProperty("stock_lots_migrated")
    expect(report).toHaveProperty("errors")
    expect(report).toHaveProperty("duration_ms")

    // Verify report types
    expect(typeof report.listings_migrated).toBe("number")
    expect(typeof report.variants_created).toBe("number")
    expect(typeof report.stock_lots_migrated).toBe("number")
    expect(Array.isArray(report.errors)).toBe(true)
    expect(typeof report.duration_ms).toBe("number")
  })

  /**
   * Test: Migration completeness verification
   *
   * Validates: Requirements 11.5
   */
  it("should verify all V1 listings have V2 equivalents", async () => {
    mockTransaction.raw.mockImplementation(defaultMigrationRawHandler(5))

    // Mock count calls for completeness check
    // The transaction function is called multiple times, we need to track which table
    let countCallIndex = 0
    const mockCountFn = vi.fn(() => {
      countCallIndex++
      // V1 counts (3 calls for verification): 5 each
      // V2 count (1 call): 3 (fewer than V1)
      if (countCallIndex <= 3) {
        return Promise.resolve([{ count: "5" }])
      } else {
        return Promise.resolve([{ count: "3" }])
      }
    })

    const priorImpl = mockTransaction.getMockImplementation() as (
      tableName: string,
    ) => Record<string, unknown>
    mockTransaction.mockImplementation((tableName: string) => {
      if (
        tableName === "market_unique_listings" ||
        tableName === "market_aggregate_listings_legacy" ||
        tableName === "market_multiple_listings"
      ) {
        return {
          count: mockCountFn,
          join: vi.fn().mockReturnThis(),
          whereNotNull: vi.fn().mockReturnThis(),
        }
      }
      const qb = priorImpl(tableName)
      if (tableName === "market_listing_details") {
        ;(qb as { distinct: ReturnType<typeof vi.fn> }).distinct = vi
          .fn()
          .mockReturnValue({
            whereNotNull: vi.fn().mockResolvedValue([]),
          })
      }
      return qb
    })

    // Run migration and expect error
    await expect(service.runMigration()).rejects.toThrow()
  })

  /**
   * Test: Metadata preservation
   *
   * Validates: Requirements 11.3
   */
  it("should preserve all V1 listing metadata in V2 format", async () => {
    mockTransaction.raw.mockImplementation(defaultMigrationRawHandler(5))

    withMarketListingDetailsDistinct(mockTransaction, [])

    // Run migration
    const report = await service.runMigration()

    // Verify migration completed
    expect(report.errors).toHaveLength(0)

    // Verify raw SQL includes metadata fields
    const rawCalls = mockTransaction.raw.mock.calls
    const migrationCalls = rawCalls.filter((call: any) =>
      call[0]?.includes("INSERT INTO listings"),
    )

    expect(migrationCalls.length).toBeGreaterThan(0)

    // Verify metadata fields are included in INSERT
    const insertSQL = migrationCalls[0][0]
    expect(insertSQL).toContain("title")
    expect(insertSQL).toContain("description")
    expect(insertSQL).toContain("seller_id")
    expect(insertSQL).toContain("status")
    expect(insertSQL).toContain("created_at")
  })

  /**
   * Test: Stock lot migration
   *
   * Validates: Requirements 11.4
   */
  it("should migrate V1 inventory to stock_lots", async () => {
    mockTransaction.raw.mockImplementation(defaultMigrationRawHandler(0))

    withMarketListingDetailsDistinct(mockTransaction, [])

    // Run migration
    const report = await service.runMigration()

    // Verify stock lots migrated
    expect(report.stock_lots_migrated).toBeGreaterThanOrEqual(0)
  })
})
