/**
 * Manual test script for getMyListings endpoint
 * 
 * This script tests the getMyListings implementation by:
 * 1. Creating test listings for a user
 * 2. Calling getMyListings with various filters
 * 3. Verifying the response structure and data
 * 
 * Run with: npx tsx src/api/routes/v2/listings/test-getMyListings.ts
 */

import { ListingsV2Controller } from "./ListingsV2Controller.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { Request as ExpressRequest } from "express"

const TEST_USER_ID = "manual-test-user-" + Date.now()
const TEST_GAME_ITEM_ID = "test-game-item-" + Date.now()

// Mock Express request
const createMockRequest = (): Partial<ExpressRequest> => ({
  user: {
    user_id: TEST_USER_ID,
    username: "testuser",
    role: "user",
  } as any,
})

async function runTests() {
  const db = getKnex()
  const createdListingIds: string[] = []

  try {
    console.log("🧪 Starting getMyListings manual tests...\n")

    // Test 1: Create test listings
    console.log("📝 Test 1: Creating test listings...")
    const controller = new ListingsV2Controller(createMockRequest() as ExpressRequest)

    // Create listing 1 - Active, unified pricing
    const listing1 = await controller.createListing(
      {
        title: "Test Listing 1 - Active",
        description: "First test listing",
        game_item_id: TEST_GAME_ITEM_ID,
        pricing_mode: "unified",
        base_price: 1000,
        lots: [
          {
            quantity: 10,
            variant_attributes: { quality_tier: 5 },
          },
        ],
      },
      createMockRequest() as ExpressRequest,
    )
    createdListingIds.push(listing1.listing_id)
    console.log(`✅ Created listing 1: ${listing1.listing_id}`)

    // Create listing 2 - Active, per-variant pricing
    const listing2 = await controller.createListing(
      {
        title: "Test Listing 2 - Per-Variant",
        description: "Second test listing with per-variant pricing",
        game_item_id: TEST_GAME_ITEM_ID,
        pricing_mode: "per_variant",
        lots: [
          {
            quantity: 5,
            variant_attributes: { quality_tier: 5 },
            price: 2000,
          },
          {
            quantity: 10,
            variant_attributes: { quality_tier: 3 },
            price: 1000,
          },
        ],
      },
      createMockRequest() as ExpressRequest,
    )
    createdListingIds.push(listing2.listing_id)
    console.log(`✅ Created listing 2: ${listing2.listing_id}`)

    // Create listing 3 - Sold status
    const listing3 = await controller.createListing(
      {
        title: "Test Listing 3 - Sold",
        description: "Third test listing (will be marked sold)",
        game_item_id: TEST_GAME_ITEM_ID,
        pricing_mode: "unified",
        base_price: 500,
        lots: [
          {
            quantity: 20,
            variant_attributes: { quality_tier: 1 },
          },
        ],
      },
      createMockRequest() as ExpressRequest,
    )
    createdListingIds.push(listing3.listing_id)
    await db("listings").where({ listing_id: listing3.listing_id }).update({ status: "sold" })
    console.log(`✅ Created listing 3: ${listing3.listing_id} (marked as sold)\n`)

    // Test 2: Get all listings (no filter)
    console.log("📝 Test 2: Get all listings (no filter)...")
    const allListings = await controller.getMyListings(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createMockRequest() as ExpressRequest,
    )
    console.log(`✅ Total listings: ${allListings.total}`)
    console.log(`✅ Returned: ${allListings.listings.length}`)
    console.log(`✅ Page: ${allListings.page}, Page size: ${allListings.page_size}`)
    
    if (allListings.total !== 3) {
      throw new Error(`Expected 3 listings, got ${allListings.total}`)
    }
    console.log("✅ Test 2 passed!\n")

    // Test 3: Filter by active status
    console.log("📝 Test 3: Filter by active status...")
    const activeListings = await controller.getMyListings(
      "active",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createMockRequest() as ExpressRequest,
    )
    console.log(`✅ Active listings: ${activeListings.total}`)
    
    if (activeListings.total !== 2) {
      throw new Error(`Expected 2 active listings, got ${activeListings.total}`)
    }
    
    const hasOnlyActive = activeListings.listings.every((l) => l.status === "active")
    if (!hasOnlyActive) {
      throw new Error("Found non-active listings in active filter")
    }
    console.log("✅ Test 3 passed!\n")

    // Test 4: Filter by sold status
    console.log("📝 Test 4: Filter by sold status...")
    const soldListings = await controller.getMyListings(
      "sold",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      createMockRequest() as ExpressRequest,
    )
    console.log(`✅ Sold listings: ${soldListings.total}`)
    
    if (soldListings.total !== 1) {
      throw new Error(`Expected 1 sold listing, got ${soldListings.total}`)
    }
    console.log("✅ Test 4 passed!\n")

    // Test 5: Pagination
    console.log("📝 Test 5: Pagination (page_size=1)...")
    const page1 = await controller.getMyListings(
      undefined,
      1,
      1,
      undefined,
      undefined,
      undefined,
      createMockRequest() as ExpressRequest,
    )
    console.log(`✅ Page 1: ${page1.listings.length} listings`)
    
    if (page1.listings.length !== 1) {
      throw new Error(`Expected 1 listing on page 1, got ${page1.listings.length}`)
    }
    
    const page2 = await controller.getMyListings(
      undefined,
      2,
      1,
      undefined,
      undefined,
      undefined,
      createMockRequest() as ExpressRequest,
    )
    console.log(`✅ Page 2: ${page2.listings.length} listings`)
    
    if (page2.listings.length !== 1) {
      throw new Error(`Expected 1 listing on page 2, got ${page2.listings.length}`)
    }
    console.log("✅ Test 5 passed!\n")

    // Test 6: Sort by price ascending
    console.log("📝 Test 6: Sort by price ascending...")
    const sortedByPrice = await controller.getMyListings(
      undefined,
      undefined,
      undefined,
      "price",
      "asc",
      undefined,
      createMockRequest() as ExpressRequest,
    )
    console.log(`✅ Listings sorted by price:`)
    sortedByPrice.listings.forEach((l) => {
      console.log(`   - ${l.title}: ${l.price_min} - ${l.price_max}`)
    })
    
    // Verify ascending order
    for (let i = 1; i < sortedByPrice.listings.length; i++) {
      if (sortedByPrice.listings[i - 1].price_min > sortedByPrice.listings[i].price_min) {
        throw new Error("Listings not sorted by price ascending")
      }
    }
    console.log("✅ Test 6 passed!\n")

    // Test 7: Verify variant information
    console.log("📝 Test 7: Verify variant information...")
    const listing = allListings.listings.find((l) => l.title === "Test Listing 2 - Per-Variant")
    if (!listing) {
      throw new Error("Could not find per-variant listing")
    }
    
    console.log(`✅ Listing: ${listing.title}`)
    console.log(`   - Variant count: ${listing.variant_count}`)
    console.log(`   - Quantity available: ${listing.quantity_available}`)
    console.log(`   - Price range: ${listing.price_min} - ${listing.price_max}`)
    console.log(`   - Quality tier range: ${listing.quality_tier_min} - ${listing.quality_tier_max}`)
    
    if (listing.variant_count !== 2) {
      throw new Error(`Expected 2 variants, got ${listing.variant_count}`)
    }
    
    if (listing.quantity_available !== 15) {
      throw new Error(`Expected 15 total quantity, got ${listing.quantity_available}`)
    }
    
    if (listing.price_min !== 1000 || listing.price_max !== 2000) {
      throw new Error(`Expected price range 1000-2000, got ${listing.price_min}-${listing.price_max}`)
    }
    
    if (listing.quality_tier_min !== 3 || listing.quality_tier_max !== 5) {
      throw new Error(`Expected quality tier range 3-5, got ${listing.quality_tier_min}-${listing.quality_tier_max}`)
    }
    console.log("✅ Test 7 passed!\n")

    // Test 8: Verify timestamps
    console.log("📝 Test 8: Verify timestamps...")
    const firstListing = allListings.listings[0]
    console.log(`✅ Created at: ${firstListing.created_at}`)
    console.log(`✅ Updated at: ${firstListing.updated_at}`)
    
    // Verify ISO 8601 format
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    if (!iso8601Regex.test(firstListing.created_at)) {
      throw new Error("created_at is not in ISO 8601 format")
    }
    if (!iso8601Regex.test(firstListing.updated_at)) {
      throw new Error("updated_at is not in ISO 8601 format")
    }
    console.log("✅ Test 8 passed!\n")

    console.log("🎉 All tests passed!")
  } catch (error) {
    console.error("❌ Test failed:", error)
    throw error
  } finally {
    // Clean up
    console.log("\n🧹 Cleaning up test data...")
    const db = getKnex()
    
    if (createdListingIds.length > 0) {
      await db("listing_item_lots")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("variant_pricing")
        .whereIn(
          "item_id",
          db("listing_items").whereIn("listing_id", createdListingIds).select("item_id"),
        )
        .delete()

      await db("listing_items").whereIn("listing_id", createdListingIds).delete()

      await db("listings").whereIn("listing_id", createdListingIds).delete()
    }
    
    console.log("✅ Cleanup complete")
    
    // Close database connection
    await db.destroy()
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
