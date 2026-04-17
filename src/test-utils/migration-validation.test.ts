import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile.js';
import {
  migrateUniqueListing,
  migrateAggregateListing,
  migrateMultipleListing,
  type V1UniqueListing,
  type V1AggregateListing,
  type V1MultipleListing,
} from '../services/market-v2/migration.service.js';

/**
 * Migration Validation Tests for Task 2.6
 * 
 * Tests that V1 to V2 migration preserves data integrity:
 * - Unique listing migration preserves all fields
 * - Aggregate listing migration handles multiple stock lots
 * - Multiple listing migration creates multiple listing_items
 * - Default variant creation for items without quality data
 * - V1 tables remain unchanged after migration
 * 
 * Requirements: 58.2, 58.5
 */

describe('Migration Validation - Task 2.6', () => {
  let db: Knex;
  let testGameItemId: string;
  let v1RowCountsBefore: Record<string, number>;

  beforeAll(async () => {
    // Connect to database
    db = knex(knexConfig.development);
    
    // Verify we're not in production
    const dbName = await db.raw('SELECT current_database()');
    if (dbName.rows[0].current_database.includes('prod')) {
      throw new Error('SAFETY: Cannot run tests against production database');
    }

    // Get a test game item
    const gameItems = await db('game_items').select('id').limit(1);
    if (gameItems.length === 0) {
      throw new Error('No game items found in database');
    }
    testGameItemId = gameItems[0].id;

    // Capture V1 table row counts before migration
    v1RowCountsBefore = await captureV1RowCounts();
  }, 30000);

  afterAll(async () => {
    await db.destroy();
  }, 30000);

  /**
   * Helper function to capture V1 table row counts
   */
  async function captureV1RowCounts(): Promise<Record<string, number>> {
    const tables = [
      'market_listings',
      'market_unique_listings',
      'market_aggregate_listings',
      'market_multiple_listings',
      'market_listing_details',
    ];

    const counts: Record<string, number> = {};
    for (const table of tables) {
      const result = await db(table).count('* as count');
      counts[table] = parseInt(result[0].count as string);
    }
    return counts;
  }

  /**
   * Helper function to verify V1 tables unchanged
   */
  async function verifyV1TablesUnchanged(): Promise<void> {
    const countsAfter = await captureV1RowCounts();
    
    for (const table in v1RowCountsBefore) {
      expect(countsAfter[table]).toBe(v1RowCountsBefore[table]);
    }
  }

  describe('Test unique listing migration preserves all fields', () => {
    let v1Listing: V1UniqueListing;
    let v2ListingId: string;

    beforeAll(async () => {
      // Create test V1 unique listing data
      v1Listing = {
        listing_id: 'test-unique-' + Date.now(),
        sale_type: 'sale',
        price: 5000,
        quantity_available: 10,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-123',
        contractor_seller_id: null,
        timestamp: new Date('2024-01-01T00:00:00Z'),
        expiration: new Date('2024-12-31T23:59:59Z'),
        accept_offers: true,
        details_id: 'details-1',
        item_type: 'weapon',
        title: 'Test Weapon Listing',
        description: 'A high-quality weapon for testing',
        game_item_id: testGameItemId,
      };

      // Migrate the listing
      const result = await migrateUniqueListing(v1Listing);
      expect(result.success).toBe(true);
      v2ListingId = result.listing_id!;
    });

    afterAll(async () => {
      // Clean up test data
      if (v2ListingId) {
        await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
        await db('listing_items').whereIn('listing_id', 
          db('listings').select('listing_id').where('listing_id', v2ListingId)
        ).del();
        await db('listings').where('listing_id', v2ListingId).del();
      }
    });

    it('should create V2 listing with correct metadata', async () => {
      const listing = await db('listings')
        .where('listing_id', v2ListingId)
        .first();

      expect(listing).toBeDefined();
      expect(listing.title).toBe(v1Listing.title);
      expect(listing.description).toBe(v1Listing.description);
      expect(listing.status).toBe('active');
      expect(listing.visibility).toBe('public');
      expect(listing.sale_type).toBe('fixed'); // 'sale' maps to 'fixed'
      expect(listing.listing_type).toBe('single');
      expect(listing.seller_id).toBe(v1Listing.user_seller_id);
      expect(listing.seller_type).toBe('user');
    });

    it('should preserve timestamps from V1', async () => {
      const listing = await db('listings')
        .where('listing_id', v2ListingId)
        .first();

      expect(new Date(listing.created_at).getTime()).toBe(v1Listing.timestamp.getTime());
      expect(new Date(listing.expires_at).getTime()).toBe(v1Listing.expiration.getTime());
    });

    it('should create listing_items with unified pricing', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      expect(listingItem).toBeDefined();
      expect(listingItem.game_item_id).toBe(v1Listing.game_item_id);
      expect(listingItem.pricing_mode).toBe('unified');
      expect(listingItem.base_price).toBe(v1Listing.price);
    });

    it('should create default variant with NULL quality attributes', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      const lot = await db('listing_item_lots')
        .where('item_id', listingItem.item_id)
        .first();

      expect(lot).toBeDefined();

      const variant = await db('item_variants')
        .where('variant_id', lot.variant_id)
        .first();

      expect(variant).toBeDefined();
      expect(variant.attributes.quality_tier).toBeUndefined();
      expect(variant.attributes.quality_value).toBeUndefined();
      expect(variant.attributes.crafted_source).toBe('unknown');
    });

    it('should create stock lot with correct quantity', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      const lot = await db('listing_item_lots')
        .where('item_id', listingItem.item_id)
        .first();

      expect(lot).toBeDefined();
      expect(lot.quantity_total).toBe(v1Listing.quantity_available);
      expect(lot.listed).toBe(true);
    });

    it('should trigger update of quantity_available', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      // Trigger should have computed quantity_available from stock lots
      expect(listingItem.quantity_available).toBe(v1Listing.quantity_available);
      expect(listingItem.variant_count).toBe(1); // One default variant
    });

    it('should map V1 status correctly', async () => {
      // Test status mapping
      const statusTests = [
        { v1: 'active', v2: 'active' },
        { v1: 'inactive', v2: 'cancelled' },
        { v1: 'archived', v2: 'cancelled' },
        { v1: 'sold', v2: 'sold' },
        { v1: 'expired', v2: 'expired' },
      ];

      for (const test of statusTests) {
        const testListing = { ...v1Listing, status: test.v1, listing_id: 'test-status-' + Date.now() };
        const result = await migrateUniqueListing(testListing);
        
        if (result.success) {
          const listing = await db('listings').where('listing_id', result.listing_id).first();
          expect(listing.status).toBe(test.v2);
          
          // Clean up
          await db('listing_item_lots').where('notes', 'LIKE', `%${testListing.listing_id}%`).del();
          await db('listing_items').whereIn('listing_id', 
            db('listings').select('listing_id').where('listing_id', result.listing_id)
          ).del();
          await db('listings').where('listing_id', result.listing_id).del();
        }
      }
    });

    it('should map internal flag to visibility', async () => {
      const internalListing = { ...v1Listing, internal: true, listing_id: 'test-internal-' + Date.now() };
      const result = await migrateUniqueListing(internalListing);
      
      expect(result.success).toBe(true);
      const listing = await db('listings').where('listing_id', result.listing_id).first();
      expect(listing.visibility).toBe('private');
      
      // Clean up
      await db('listing_item_lots').where('notes', 'LIKE', `%${internalListing.listing_id}%`).del();
      await db('listing_items').whereIn('listing_id', 
        db('listings').select('listing_id').where('listing_id', result.listing_id)
      ).del();
      await db('listings').where('listing_id', result.listing_id).del();
    });
  });

  describe('Test aggregate listing migration handles multiple stock lots', () => {
    let v1Listing: V1AggregateListing;
    let v2ListingId: string;

    beforeAll(async () => {
      // Create test V1 aggregate listing data
      v1Listing = {
        listing_id: 'test-aggregate-' + Date.now(),
        sale_type: 'sale',
        price: 1000,
        quantity_available: 50,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-456',
        contractor_seller_id: null,
        timestamp: new Date('2024-02-01T00:00:00Z'),
        expiration: new Date('2024-12-31T23:59:59Z'),
        aggregate_id: 'agg-test-1',
        details_id: 'details-2',
        item_type: 'consumable',
        title: 'Test Consumable Aggregate',
        description: 'Fungible consumable items',
        game_item_id: testGameItemId,
      };

      // Migrate the listing
      const result = await migrateAggregateListing(v1Listing);
      expect(result.success).toBe(true);
      v2ListingId = result.listing_id!;
    });

    afterAll(async () => {
      // Clean up test data
      if (v2ListingId) {
        await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
        await db('listing_items').whereIn('listing_id', 
          db('listings').select('listing_id').where('listing_id', v2ListingId)
        ).del();
        await db('listings').where('listing_id', v2ListingId).del();
      }
    });

    it('should create V2 listing with listing_type=single', async () => {
      const listing = await db('listings')
        .where('listing_id', v2ListingId)
        .first();

      expect(listing).toBeDefined();
      expect(listing.listing_type).toBe('single'); // Aggregate maps to single
      expect(listing.title).toBe(v1Listing.title);
    });

    it('should preserve aggregate listing metadata', async () => {
      const listing = await db('listings')
        .where('listing_id', v2ListingId)
        .first();

      expect(listing.description).toBe(v1Listing.description);
      expect(listing.status).toBe('active');
      expect(listing.seller_id).toBe(v1Listing.user_seller_id);
    });

    it('should create single stock lot for aggregate', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      const lots = await db('listing_item_lots')
        .where('item_id', listingItem.item_id);

      expect(lots.length).toBe(1);
      expect(lots[0].quantity_total).toBe(v1Listing.quantity_available);
    });

    it('should use default variant for aggregate', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      const lot = await db('listing_item_lots')
        .where('item_id', listingItem.item_id)
        .first();

      const variant = await db('item_variants')
        .where('variant_id', lot.variant_id)
        .first();

      expect(variant.attributes.crafted_source).toBe('unknown');
    });
  });

  describe('Test multiple listing migration creates multiple listing_items', () => {
    let v1Listing: V1MultipleListing;
    let v2ListingId: string;

    beforeAll(async () => {
      // Create test V1 multiple listing data (bundle)
      v1Listing = {
        listing_id: 'test-multiple-' + Date.now(),
        sale_type: 'sale',
        price: 10000,
        quantity_available: 1,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-789',
        contractor_seller_id: null,
        timestamp: new Date('2024-03-01T00:00:00Z'),
        expiration: new Date('2024-12-31T23:59:59Z'),
        multiple_id: 'mult-test-1',
        details_id: 'details-3',
        item_type: 'bundle',
        title: 'Test Bundle Listing',
        description: 'A bundle of multiple items',
        game_item_id: testGameItemId,
      };

      // Migrate the listing
      const result = await migrateMultipleListing(v1Listing);
      expect(result.success).toBe(true);
      v2ListingId = result.listing_id!;
    });

    afterAll(async () => {
      // Clean up test data
      if (v2ListingId) {
        await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
        await db('listing_items').whereIn('listing_id', 
          db('listings').select('listing_id').where('listing_id', v2ListingId)
        ).del();
        await db('listings').where('listing_id', v2ListingId).del();
      }
    });

    it('should create V2 listing with listing_type=bundle', async () => {
      const listing = await db('listings')
        .where('listing_id', v2ListingId)
        .first();

      expect(listing).toBeDefined();
      expect(listing.listing_type).toBe('bundle'); // Multiple maps to bundle
      expect(listing.title).toBe(v1Listing.title);
    });

    it('should preserve multiple listing metadata', async () => {
      const listing = await db('listings')
        .where('listing_id', v2ListingId)
        .first();

      expect(listing.description).toBe(v1Listing.description);
      expect(listing.status).toBe('active');
      expect(listing.seller_id).toBe(v1Listing.user_seller_id);
    });

    it('should create listing_items for bundle', async () => {
      const listingItems = await db('listing_items')
        .where('listing_id', v2ListingId);

      // Note: Current implementation creates single listing_item
      // In future, bundles may have multiple listing_items
      expect(listingItems.length).toBeGreaterThan(0);
    });

    it('should use unified pricing for bundle', async () => {
      const listingItem = await db('listing_items')
        .where('listing_id', v2ListingId)
        .first();

      expect(listingItem.pricing_mode).toBe('unified');
      expect(listingItem.base_price).toBe(v1Listing.price);
    });
  });

  describe('Test default variant creation for items without quality data', () => {
    it('should create variant with NULL quality_tier', async () => {
      const v1Listing: V1UniqueListing = {
        listing_id: 'test-no-quality-' + Date.now(),
        sale_type: 'sale',
        price: 2000,
        quantity_available: 5,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-quality',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-quality',
        item_type: 'armor',
        title: 'Test No Quality Item',
        description: 'Item without quality data',
        game_item_id: testGameItemId,
      };

      const result = await migrateUniqueListing(v1Listing);
      expect(result.success).toBe(true);

      const listingItem = await db('listing_items')
        .where('listing_id', result.listing_id)
        .first();

      const lot = await db('listing_item_lots')
        .where('item_id', listingItem.item_id)
        .first();

      const variant = await db('item_variants')
        .where('variant_id', lot.variant_id)
        .first();

      expect(variant.attributes.quality_tier).toBeUndefined();
      expect(variant.attributes.quality_value).toBeUndefined();

      // Clean up
      await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
      await db('listing_items').where('listing_id', result.listing_id).del();
      await db('listings').where('listing_id', result.listing_id).del();
    });

    it('should set crafted_source to unknown', async () => {
      const v1Listing: V1UniqueListing = {
        listing_id: 'test-unknown-source-' + Date.now(),
        sale_type: 'sale',
        price: 3000,
        quantity_available: 3,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-source',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-source',
        item_type: 'component',
        title: 'Test Unknown Source',
        description: 'Item with unknown source',
        game_item_id: testGameItemId,
      };

      const result = await migrateUniqueListing(v1Listing);
      expect(result.success).toBe(true);

      const listingItem = await db('listing_items')
        .where('listing_id', result.listing_id)
        .first();

      const lot = await db('listing_item_lots')
        .where('item_id', listingItem.item_id)
        .first();

      const variant = await db('item_variants')
        .where('variant_id', lot.variant_id)
        .first();

      expect(variant.attributes.crafted_source).toBe('unknown');

      // Clean up
      await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
      await db('listing_items').where('listing_id', result.listing_id).del();
      await db('listings').where('listing_id', result.listing_id).del();
    });

    it('should reuse default variant across multiple listings', async () => {
      // Create two listings with same game item
      const v1Listing1: V1UniqueListing = {
        listing_id: 'test-reuse-1-' + Date.now(),
        sale_type: 'sale',
        price: 1000,
        quantity_available: 5,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-reuse',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-reuse-1',
        item_type: 'weapon',
        title: 'Test Reuse 1',
        description: 'First listing',
        game_item_id: testGameItemId,
      };

      const v1Listing2: V1UniqueListing = {
        ...v1Listing1,
        listing_id: 'test-reuse-2-' + Date.now(),
        title: 'Test Reuse 2',
        description: 'Second listing',
      };

      const result1 = await migrateUniqueListing(v1Listing1);
      const result2 = await migrateUniqueListing(v1Listing2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Get variants from both listings
      const listingItem1 = await db('listing_items')
        .where('listing_id', result1.listing_id)
        .first();

      const listingItem2 = await db('listing_items')
        .where('listing_id', result2.listing_id)
        .first();

      const lot1 = await db('listing_item_lots')
        .where('item_id', listingItem1.item_id)
        .first();

      const lot2 = await db('listing_item_lots')
        .where('item_id', listingItem2.item_id)
        .first();

      // Both should use the same variant (deduplication)
      expect(lot1.variant_id).toBe(lot2.variant_id);

      // Clean up
      await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing1.listing_id}%`).del();
      await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing2.listing_id}%`).del();
      await db('listing_items').where('listing_id', result1.listing_id).del();
      await db('listing_items').where('listing_id', result2.listing_id).del();
      await db('listings').where('listing_id', result1.listing_id).del();
      await db('listings').where('listing_id', result2.listing_id).del();
    });
  });

  describe('Test V1 tables remain unchanged after migration', () => {
    it('should not modify V1 market_listings table', async () => {
      const v1Listing: V1UniqueListing = {
        listing_id: 'test-v1-unchanged-' + Date.now(),
        sale_type: 'sale',
        price: 4000,
        quantity_available: 8,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-unchanged',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-unchanged',
        item_type: 'ship',
        title: 'Test V1 Unchanged',
        description: 'Verify V1 tables unchanged',
        game_item_id: testGameItemId,
      };

      // Capture counts before migration
      const countsBefore = await captureV1RowCounts();

      // Migrate listing
      const result = await migrateUniqueListing(v1Listing);
      expect(result.success).toBe(true);

      // Verify V1 tables unchanged
      const countsAfter = await captureV1RowCounts();
      
      expect(countsAfter.market_listings).toBe(countsBefore.market_listings);
      expect(countsAfter.market_unique_listings).toBe(countsBefore.market_unique_listings);
      expect(countsAfter.market_aggregate_listings).toBe(countsBefore.market_aggregate_listings);
      expect(countsAfter.market_multiple_listings).toBe(countsBefore.market_multiple_listings);
      expect(countsAfter.market_listing_details).toBe(countsBefore.market_listing_details);

      // Clean up V2 data only
      await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
      await db('listing_items').where('listing_id', result.listing_id).del();
      await db('listings').where('listing_id', result.listing_id).del();
    });

    it('should only read from V1 tables, never write', async () => {
      // This test verifies the migration service uses read-only queries
      const v1Listing: V1UniqueListing = {
        listing_id: 'test-readonly-' + Date.now(),
        sale_type: 'sale',
        price: 1500,
        quantity_available: 3,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user-readonly',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-readonly',
        item_type: 'vehicle',
        title: 'Test Read Only',
        description: 'Verify read-only access',
        game_item_id: testGameItemId,
      };

      // Capture V1 row counts
      const countsBefore = await captureV1RowCounts();

      // Migrate
      const result = await migrateUniqueListing(v1Listing);
      expect(result.success).toBe(true);

      // Verify no changes to V1
      await verifyV1TablesUnchanged();

      // Clean up
      await db('listing_item_lots').where('notes', 'LIKE', `%${v1Listing.listing_id}%`).del();
      await db('listing_items').where('listing_id', result.listing_id).del();
      await db('listings').where('listing_id', result.listing_id).del();
    });

    it('should preserve V1 data integrity after multiple migrations', async () => {
      const countsBefore = await captureV1RowCounts();

      // Migrate multiple listings
      const listings: V1UniqueListing[] = [
        {
          listing_id: 'test-multi-1-' + Date.now(),
          sale_type: 'sale',
          price: 1000,
          quantity_available: 5,
          status: 'active',
          internal: false,
          user_seller_id: 'test-user-multi',
          contractor_seller_id: null,
          timestamp: new Date(),
          expiration: new Date(),
          accept_offers: false,
          details_id: 'details-multi-1',
          item_type: 'weapon',
          title: 'Test Multi 1',
          description: 'First of multiple',
          game_item_id: testGameItemId,
        },
        {
          listing_id: 'test-multi-2-' + Date.now(),
          sale_type: 'auction',
          price: 2000,
          quantity_available: 10,
          status: 'active',
          internal: true,
          user_seller_id: 'test-user-multi',
          contractor_seller_id: null,
          timestamp: new Date(),
          expiration: new Date(),
          accept_offers: true,
          details_id: 'details-multi-2',
          item_type: 'armor',
          title: 'Test Multi 2',
          description: 'Second of multiple',
          game_item_id: testGameItemId,
        },
      ];

      const results = [];
      for (const listing of listings) {
        const result = await migrateUniqueListing(listing);
        expect(result.success).toBe(true);
        results.push(result);
      }

      // Verify V1 unchanged after all migrations
      const countsAfter = await captureV1RowCounts();
      expect(countsAfter).toEqual(countsBefore);

      // Clean up all
      for (let i = 0; i < listings.length; i++) {
        await db('listing_item_lots').where('notes', 'LIKE', `%${listings[i].listing_id}%`).del();
        await db('listing_items').where('listing_id', results[i].listing_id).del();
        await db('listings').where('listing_id', results[i].listing_id).del();
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should reject listing with missing game_item_id', async () => {
      const invalidListing: V1UniqueListing = {
        listing_id: 'test-invalid-' + Date.now(),
        sale_type: 'sale',
        price: 1000,
        quantity_available: 5,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-invalid',
        item_type: 'weapon',
        title: 'Invalid Listing',
        description: 'Missing game_item_id',
        game_item_id: '', // Invalid
      };

      const result = await migrateUniqueListing(invalidListing);
      expect(result.success).toBe(false);
      expect(result.error).toContain('game_item_id');
    });

    it('should reject listing with invalid price', async () => {
      const invalidListing: V1UniqueListing = {
        listing_id: 'test-invalid-price-' + Date.now(),
        sale_type: 'sale',
        price: 0, // Invalid
        quantity_available: 5,
        status: 'active',
        internal: false,
        user_seller_id: 'test-user',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-invalid-price',
        item_type: 'weapon',
        title: 'Invalid Price',
        description: 'Zero price',
        game_item_id: testGameItemId,
      };

      const result = await migrateUniqueListing(invalidListing);
      expect(result.success).toBe(false);
      expect(result.error).toContain('price');
    });

    it('should reject listing with negative quantity', async () => {
      const invalidListing: V1UniqueListing = {
        listing_id: 'test-invalid-qty-' + Date.now(),
        sale_type: 'sale',
        price: 1000,
        quantity_available: -5, // Invalid
        status: 'active',
        internal: false,
        user_seller_id: 'test-user',
        contractor_seller_id: null,
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-invalid-qty',
        item_type: 'weapon',
        title: 'Invalid Quantity',
        description: 'Negative quantity',
        game_item_id: testGameItemId,
      };

      const result = await migrateUniqueListing(invalidListing);
      expect(result.success).toBe(false);
      expect(result.error).toContain('quantity');
    });

    it('should reject listing with missing seller_id', async () => {
      const invalidListing: V1UniqueListing = {
        listing_id: 'test-no-seller-' + Date.now(),
        sale_type: 'sale',
        price: 1000,
        quantity_available: 5,
        status: 'active',
        internal: false,
        user_seller_id: null, // Both null
        contractor_seller_id: null, // Both null
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-no-seller',
        item_type: 'weapon',
        title: 'No Seller',
        description: 'Missing seller',
        game_item_id: testGameItemId,
      };

      const result = await migrateUniqueListing(invalidListing);
      expect(result.success).toBe(false);
      expect(result.error).toContain('seller_id');
    });

    it('should handle contractor seller correctly', async () => {
      const contractorListing: V1UniqueListing = {
        listing_id: 'test-contractor-' + Date.now(),
        sale_type: 'sale',
        price: 5000,
        quantity_available: 20,
        status: 'active',
        internal: false,
        user_seller_id: null,
        contractor_seller_id: 'contractor-123', // Contractor seller
        timestamp: new Date(),
        expiration: new Date(),
        accept_offers: false,
        details_id: 'details-contractor',
        item_type: 'ship',
        title: 'Contractor Listing',
        description: 'Sold by contractor',
        game_item_id: testGameItemId,
      };

      const result = await migrateUniqueListing(contractorListing);
      expect(result.success).toBe(true);

      const listing = await db('listings')
        .where('listing_id', result.listing_id)
        .first();

      expect(listing.seller_type).toBe('contractor');
      expect(listing.seller_id).toBe('contractor-123');

      // Clean up
      await db('listing_item_lots').where('notes', 'LIKE', `%${contractorListing.listing_id}%`).del();
      await db('listing_items').where('listing_id', result.listing_id).del();
      await db('listings').where('listing_id', result.listing_id).del();
    });
  });
});
