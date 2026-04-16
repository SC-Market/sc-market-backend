/**
 * Property tests for Market V2 quantity computation trigger
 * 
 * These tests validate the correctness properties of the quantity_available
 * computation that would be maintained by the database trigger.
 * 
 * Since we use mocked databases in tests, we simulate the trigger behavior
 * by manually computing quantity_available based on listing_item_lots.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  clearMockData,
  setupMockTableData,
  getMockTableData,
  type MockTableTypes,
} from "../../test-utils/mockDatabase.js"

type ListingItem = MockTableTypes["listing_items"]
type StockLot = MockTableTypes["listing_item_lots"]

/**
 * Simulate the database trigger behavior by computing quantity_available
 * from listing_item_lots for a given item_id
 */
function simulateTriggerUpdate(itemId: string): void {
  const listingItems = getMockTableData("listing_items")
  const stockLots = getMockTableData("listing_item_lots")

  const item = listingItems.find((li) => li.item_id === itemId)
  if (!item) return

  // Compute quantity_available from listed stock lots
  const listedLots = stockLots.filter((lot) => lot.item_id === itemId && lot.listed)
  const quantityAvailable = listedLots.reduce(
    (sum, lot) => sum + lot.quantity_total,
    0,
  )

  // Compute variant_count from distinct variants in listed stock lots
  const uniqueVariants = new Set(listedLots.map((lot) => lot.variant_id))
  const variantCount = uniqueVariants.size

  // Update the listing_item
  item.quantity_available = quantityAvailable
  item.variant_count = variantCount

  setupMockTableData("listing_items", listingItems)
}

/**
 * Helper to create a test listing item
 */
function createTestListingItem(overrides: Partial<ListingItem> = {}): ListingItem {
  const item: ListingItem = {
    item_id: `item_${Date.now()}_${Math.random()}`,
    listing_id: `listing_${Date.now()}`,
    game_item_id: `game_item_${Date.now()}`,
    pricing_mode: "unified",
    base_price: 10000,
    quantity_available: 0,
    variant_count: 0,
    display_order: 0,
    ...overrides,
  }

  const items = getMockTableData("listing_items")
  items.push(item)
  setupMockTableData("listing_items", items)

  return item
}

/**
 * Helper to create a test stock lot
 */
function createTestStockLot(overrides: Partial<StockLot> = {}): StockLot {
  const lot: StockLot = {
    lot_id: `lot_${Date.now()}_${Math.random()}`,
    item_id: "",
    variant_id: `variant_${Date.now()}`,
    quantity_total: 1,
    listed: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }

  const lots = getMockTableData("listing_item_lots")
  lots.push(lot)
  setupMockTableData("listing_item_lots", lots)

  // Simulate trigger
  simulateTriggerUpdate(lot.item_id)

  return lot
}

/**
 * Helper to update a stock lot
 */
function updateStockLot(lotId: string, updates: Partial<StockLot>): void {
  const lots = getMockTableData("listing_item_lots")
  const lot = lots.find((l) => l.lot_id === lotId)
  if (!lot) return

  Object.assign(lot, updates, { updated_at: new Date() })
  setupMockTableData("listing_item_lots", lots)

  // Simulate trigger
  simulateTriggerUpdate(lot.item_id)
}

/**
 * Helper to delete a stock lot
 */
function deleteStockLot(lotId: string): void {
  const lots = getMockTableData("listing_item_lots")
  const lot = lots.find((l) => l.lot_id === lotId)
  if (!lot) return

  const itemId = lot.item_id
  const filteredLots = lots.filter((l) => l.lot_id !== lotId)
  setupMockTableData("listing_item_lots", filteredLots)

  // Simulate trigger
  simulateTriggerUpdate(itemId)
}

describe("Market V2 - Property 14: Quantity Available Invariant", () => {
  beforeEach(() => {
    clearMockData()
    setupMockTableData("listing_items", [])
    setupMockTableData("listing_item_lots", [])
  })

  /**
   * Property 14: Quantity Available Invariant
   * Validates: Requirements 8.6, 23.1
   * 
   * For any listing item at any point in time, quantity_available SHALL equal
   * the sum of quantity_total for all listing_item_lots where listed=true.
   */

  it("should compute quantity_available as sum of listed stock lots on INSERT", () => {
    const item = createTestListingItem()

    // Insert stock lots with varying quantities
    createTestStockLot({ item_id: item.item_id, quantity_total: 5, listed: true })
    createTestStockLot({ item_id: item.item_id, quantity_total: 10, listed: true })
    createTestStockLot({ item_id: item.item_id, quantity_total: 3, listed: true })

    // Verify quantity_available equals sum of listed lots
    const items = getMockTableData("listing_items")
    const updatedItem = items.find((i) => i.item_id === item.item_id)

    expect(updatedItem?.quantity_available).toBe(18) // 5 + 10 + 3
  })

  it("should exclude unlisted stock lots from quantity_available", () => {
    const item = createTestListingItem()

    // Insert both listed and unlisted stock lots
    createTestStockLot({ item_id: item.item_id, quantity_total: 5, listed: true })
    createTestStockLot({ item_id: item.item_id, quantity_total: 10, listed: false })
    createTestStockLot({ item_id: item.item_id, quantity_total: 3, listed: true })

    // Verify only listed lots are counted
    const items = getMockTableData("listing_items")
    const updatedItem = items.find((i) => i.item_id === item.item_id)

    expect(updatedItem?.quantity_available).toBe(8) // 5 + 3 (10 is unlisted)
  })

  it("should update quantity_available when stock lot quantity changes (UPDATE)", () => {
    const item = createTestListingItem()

    const lot1 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 5,
      listed: true,
    })
    const lot2 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 10,
      listed: true,
    })

    // Initial quantity
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(15)

    // Update lot1 quantity
    updateStockLot(lot1.lot_id, { quantity_total: 20 })

    // Verify quantity_available updated
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(30) // 20 + 10
  })

  it("should update quantity_available when stock lot is deleted (DELETE)", () => {
    const item = createTestListingItem()

    const lot1 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 5,
      listed: true,
    })
    const lot2 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 10,
      listed: true,
    })

    // Initial quantity
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(15)

    // Delete lot1
    deleteStockLot(lot1.lot_id)

    // Verify quantity_available updated
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(10) // Only lot2 remains
  })

  it("should handle zero quantity when all lots are unlisted", () => {
    const item = createTestListingItem()

    createTestStockLot({ item_id: item.item_id, quantity_total: 5, listed: false })
    createTestStockLot({ item_id: item.item_id, quantity_total: 10, listed: false })

    // Verify quantity_available is zero
    const items = getMockTableData("listing_items")
    const updatedItem = items.find((i) => i.item_id === item.item_id)

    expect(updatedItem?.quantity_available).toBe(0)
  })

  it("should handle zero quantity when no stock lots exist", () => {
    const item = createTestListingItem()

    // No stock lots created
    const items = getMockTableData("listing_items")
    const updatedItem = items.find((i) => i.item_id === item.item_id)

    expect(updatedItem?.quantity_available).toBe(0)
  })

  it("should compute variant_count correctly", () => {
    const item = createTestListingItem()

    // Create stock lots with different variants
    createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_1",
      quantity_total: 5,
      listed: true,
    })
    createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_2",
      quantity_total: 10,
      listed: true,
    })
    createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_1", // Duplicate variant
      quantity_total: 3,
      listed: true,
    })

    // Verify variant_count is 2 (unique variants)
    const items = getMockTableData("listing_items")
    const updatedItem = items.find((i) => i.item_id === item.item_id)

    expect(updatedItem?.variant_count).toBe(2)
    expect(updatedItem?.quantity_available).toBe(18) // 5 + 10 + 3
  })

  it("should exclude unlisted variants from variant_count", () => {
    const item = createTestListingItem()

    createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_1",
      quantity_total: 5,
      listed: true,
    })
    createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_2",
      quantity_total: 10,
      listed: false, // Unlisted
    })
    createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_3",
      quantity_total: 3,
      listed: true,
    })

    // Verify only listed variants are counted
    const items = getMockTableData("listing_items")
    const updatedItem = items.find((i) => i.item_id === item.item_id)

    expect(updatedItem?.variant_count).toBe(2) // variant_1 and variant_3
    expect(updatedItem?.quantity_available).toBe(8) // 5 + 3
  })
})

describe("Market V2 - Property 15: Quantity Update on Listing Status Change", () => {
  beforeEach(() => {
    clearMockData()
    setupMockTableData("listing_items", [])
    setupMockTableData("listing_item_lots", [])
  })

  /**
   * Property 15: Quantity Update on Listing Status Change
   * Validates: Requirements 23.2
   * 
   * For any stock lot, when its listed field changes from true to false,
   * the associated listing_item's quantity_available SHALL decrease by
   * the stock lot's quantity_total.
   */

  it("should decrease quantity_available when stock lot is unlisted", () => {
    const item = createTestListingItem()

    const lot1 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 5,
      listed: true,
    })
    const lot2 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 10,
      listed: true,
    })

    // Initial quantity
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(15)

    // Unlist lot1
    updateStockLot(lot1.lot_id, { listed: false })

    // Verify quantity decreased by lot1's quantity
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(10) // 15 - 5
  })

  it("should increase quantity_available when stock lot is listed", () => {
    const item = createTestListingItem()

    const lot1 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 5,
      listed: true,
    })
    const lot2 = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 10,
      listed: false, // Initially unlisted
    })

    // Initial quantity (only lot1)
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(5)

    // List lot2
    updateStockLot(lot2.lot_id, { listed: true })

    // Verify quantity increased by lot2's quantity
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(15) // 5 + 10
  })

  it("should handle toggling listed status multiple times", () => {
    const item = createTestListingItem()

    const lot = createTestStockLot({
      item_id: item.item_id,
      quantity_total: 7,
      listed: true,
    })

    // Initial quantity
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(7)

    // Unlist
    updateStockLot(lot.lot_id, { listed: false })
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(0)

    // List again
    updateStockLot(lot.lot_id, { listed: true })
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(7)

    // Unlist again
    updateStockLot(lot.lot_id, { listed: false })
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.quantity_available).toBe(0)
  })

  it("should update variant_count when unlisting removes last lot of a variant", () => {
    const item = createTestListingItem()

    const lot1 = createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_1",
      quantity_total: 5,
      listed: true,
    })
    const lot2 = createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_2",
      quantity_total: 10,
      listed: true,
    })

    // Initial state: 2 variants
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.variant_count).toBe(2)
    expect(updatedItem?.quantity_available).toBe(15)

    // Unlist lot2 (removes variant_2)
    updateStockLot(lot2.lot_id, { listed: false })

    // Verify variant_count decreased
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.variant_count).toBe(1) // Only variant_1 remains
    expect(updatedItem?.quantity_available).toBe(5)
  })

  it("should not change variant_count when unlisting one of multiple lots of same variant", () => {
    const item = createTestListingItem()

    const lot1 = createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_1",
      quantity_total: 5,
      listed: true,
    })
    const lot2 = createTestStockLot({
      item_id: item.item_id,
      variant_id: "variant_1", // Same variant
      quantity_total: 10,
      listed: true,
    })

    // Initial state: 1 variant (2 lots)
    let items = getMockTableData("listing_items")
    let updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.variant_count).toBe(1)
    expect(updatedItem?.quantity_available).toBe(15)

    // Unlist lot1 (variant_1 still has lot2)
    updateStockLot(lot1.lot_id, { listed: false })

    // Verify variant_count unchanged
    items = getMockTableData("listing_items")
    updatedItem = items.find((i) => i.item_id === item.item_id)
    expect(updatedItem?.variant_count).toBe(1) // variant_1 still exists via lot2
    expect(updatedItem?.quantity_available).toBe(10)
  })
})
