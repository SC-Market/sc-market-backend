import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';

/**
 * Database Migration Tests for Task 1.7
 * 
 * Tests that all V2 database migrations were applied correctly:
 * - All tables created successfully
 * - Foreign key constraints enforced
 * - Check constraints prevent invalid data
 * - Indexes created and used by query planner
 * - Trigger updates quantity_available correctly
 * 
 * Requirements: 3.10, 7.8
 */

describe('Database Migrations - Task 1.7', () => {
  let db: Knex;

  beforeAll(async () => {
    // Connect to database
    db = knex(knexConfig.development);
    
    // Verify we're not in production
    const dbName = await db.raw('SELECT current_database()');
    if (dbName.rows[0].current_database.includes('prod')) {
      throw new Error('SAFETY: Cannot run tests against production database');
    }
  }, 30000); // 30 second timeout for database connection

  afterAll(async () => {
    await db.destroy();
  }, 30000); // 30 second timeout for cleanup

  describe('1. All Tables Created Successfully', () => {
    const expectedTables = [
      'variant_types',
      'listings',
      'listing_items',
      'item_variants',
      'listing_item_lots',
      'variant_pricing',
      'order_market_items_v2',
      'cart_items_v2',
      'buy_orders_v2'
    ];

    expectedTables.forEach(tableName => {
      it(`should have created ${tableName} table`, async () => {
        const result = await db.raw(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ?
          ) as table_exists
        `, [tableName]);
        
        expect(result.rows[0].table_exists).toBe(true);
      });
    });

    it('should have created listing_search view', async () => {
      const result = await db.raw(`
        SELECT EXISTS (
          SELECT FROM information_schema.views 
          WHERE table_schema = 'public' 
          AND table_name = 'listing_search'
        ) as view_exists
      `);
      
      expect(result.rows[0].view_exists).toBe(true);
    });

    it('should have all required columns in listings table', async () => {
      const result = await db.raw(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'listings'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows.map((r: any) => r.column_name);
      
      expect(columns).toContain('listing_id');
      expect(columns).toContain('seller_id');
      expect(columns).toContain('seller_type');
      expect(columns).toContain('title');
      expect(columns).toContain('description');
      expect(columns).toContain('status');
      expect(columns).toContain('visibility');
      expect(columns).toContain('sale_type');
      expect(columns).toContain('listing_type');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
      expect(columns).toContain('expires_at');
    });

    it('should have all required columns in listing_items table', async () => {
      const result = await db.raw(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'listing_items'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows.map((r: any) => r.column_name);
      
      expect(columns).toContain('item_id');
      expect(columns).toContain('listing_id');
      expect(columns).toContain('game_item_id');
      expect(columns).toContain('pricing_mode');
      expect(columns).toContain('base_price');
      expect(columns).toContain('display_order');
      expect(columns).toContain('quantity_available');
      expect(columns).toContain('variant_count');
    });

    it('should have all required columns in item_variants table', async () => {
      const result = await db.raw(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'item_variants'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows.map((r: any) => r.column_name);
      
      expect(columns).toContain('variant_id');
      expect(columns).toContain('game_item_id');
      expect(columns).toContain('attributes');
      expect(columns).toContain('attributes_hash');
      expect(columns).toContain('display_name');
      expect(columns).toContain('short_name');
      expect(columns).toContain('base_price_modifier');
      expect(columns).toContain('fixed_price_override');
      expect(columns).toContain('created_at');
    });

    it('should have all required columns in listing_item_lots table', async () => {
      const result = await db.raw(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'listing_item_lots'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows.map((r: any) => r.column_name);
      
      expect(columns).toContain('lot_id');
      expect(columns).toContain('item_id');
      expect(columns).toContain('variant_id');
      expect(columns).toContain('quantity_total');
      expect(columns).toContain('location_id');
      expect(columns).toContain('owner_id');
      expect(columns).toContain('listed');
      expect(columns).toContain('notes');
      expect(columns).toContain('crafted_by');
      expect(columns).toContain('crafted_at');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });
  });

  describe('2. Foreign Key Constraints Enforced', () => {
    let testListingId: string;
    let testItemId: string;
    let testVariantId: string;
    let testGameItemId: string;

    beforeAll(async () => {
      // Get a test game item
      const gameItems = await db('game_items').select('id').limit(1);
      if (gameItems.length === 0) {
        throw new Error('No game items found. Please seed game_items table first.');
      }
      testGameItemId = gameItems[0].id;

      // Create test listing
      const [listing] = await db('listings').insert({
        seller_id: '00000000-0000-0000-0000-000000000001',
        seller_type: 'user',
        title: 'TEST_FK_LISTING',
        status: 'active'
      }).returning('*');
      testListingId = listing.listing_id;

      // Create test listing_item
      const [item] = await db('listing_items').insert({
        listing_id: testListingId,
        game_item_id: testGameItemId,
        pricing_mode: 'unified',
        base_price: 1000
      }).returning('*');
      testItemId = item.item_id;

      // Create test variant
      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({ quality_tier: 3 }),
        display_name: 'TEST FK Variant'
      }).returning('*');
      testVariantId = variant.variant_id;
    });

    afterAll(async () => {
      // Clean up test data
      await db('listing_item_lots').where('notes', 'LIKE', '%TEST_FK%').del();
      await db('listing_items').where('item_id', testItemId).del();
      await db('listings').where('listing_id', testListingId).del();
      await db('item_variants').where('variant_id', testVariantId).del();
    });

    it('should enforce FK constraint: listing_items.listing_id -> listings.listing_id', async () => {
      const fakeListingId = '00000000-0000-0000-0000-000000000099';
      
      await expect(
        db('listing_items').insert({
          listing_id: fakeListingId,
          game_item_id: testGameItemId,
          pricing_mode: 'unified',
          base_price: 1000
        })
      ).rejects.toThrow();
    });

    it('should enforce FK constraint: listing_item_lots.item_id -> listing_items.item_id', async () => {
      const fakeItemId = '00000000-0000-0000-0000-000000000099';
      
      await expect(
        db('listing_item_lots').insert({
          item_id: fakeItemId,
          variant_id: testVariantId,
          quantity_total: 10,
          listed: true,
          notes: 'TEST_FK_FAIL'
        })
      ).rejects.toThrow();
    });

    it('should enforce FK constraint: listing_item_lots.variant_id -> item_variants.variant_id', async () => {
      const fakeVariantId = '00000000-0000-0000-0000-000000000099';
      
      await expect(
        db('listing_item_lots').insert({
          item_id: testItemId,
          variant_id: fakeVariantId,
          quantity_total: 10,
          listed: true,
          notes: 'TEST_FK_FAIL'
        })
      ).rejects.toThrow();
    });

    it('should enforce FK constraint: variant_pricing.item_id -> listing_items.item_id', async () => {
      const fakeItemId = '00000000-0000-0000-0000-000000000099';
      
      await expect(
        db('variant_pricing').insert({
          item_id: fakeItemId,
          variant_id: testVariantId,
          price: 1000
        })
      ).rejects.toThrow();
    });

    it('should enforce FK constraint: variant_pricing.variant_id -> item_variants.variant_id', async () => {
      const fakeVariantId = '00000000-0000-0000-0000-000000000099';
      
      await expect(
        db('variant_pricing').insert({
          item_id: testItemId,
          variant_id: fakeVariantId,
          price: 1000
        })
      ).rejects.toThrow();
    });

    it('should CASCADE DELETE: deleting listing should delete listing_items', async () => {
      // Create a temporary listing
      const [tempListing] = await db('listings').insert({
        seller_id: '00000000-0000-0000-0000-000000000001',
        seller_type: 'user',
        title: 'TEST_FK_CASCADE',
        status: 'active'
      }).returning('*');

      const [tempItem] = await db('listing_items').insert({
        listing_id: tempListing.listing_id,
        game_item_id: testGameItemId,
        pricing_mode: 'unified',
        base_price: 1000
      }).returning('*');

      // Delete the listing
      await db('listings').where('listing_id', tempListing.listing_id).del();

      // Verify listing_item was also deleted
      const items = await db('listing_items').where('item_id', tempItem.item_id);
      expect(items.length).toBe(0);
    });

    it('should CASCADE DELETE: deleting listing_item should delete listing_item_lots', async () => {
      // Create temporary data
      const [tempListing] = await db('listings').insert({
        seller_id: '00000000-0000-0000-0000-000000000001',
        seller_type: 'user',
        title: 'TEST_FK_CASCADE_2',
        status: 'active'
      }).returning('*');

      const [tempItem] = await db('listing_items').insert({
        listing_id: tempListing.listing_id,
        game_item_id: testGameItemId,
        pricing_mode: 'unified',
        base_price: 1000
      }).returning('*');

      const [tempLot] = await db('listing_item_lots').insert({
        item_id: tempItem.item_id,
        variant_id: testVariantId,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_FK_CASCADE_LOT'
      }).returning('*');

      // Delete the listing_item
      await db('listing_items').where('item_id', tempItem.item_id).del();

      // Verify lot was also deleted
      const lots = await db('listing_item_lots').where('lot_id', tempLot.lot_id);
      expect(lots.length).toBe(0);

      // Clean up listing
      await db('listings').where('listing_id', tempListing.listing_id).del();
    });
  });

  describe('3. Check Constraints Prevent Invalid Data', () => {
    let testListingId: string;
    let testItemId: string;
    let testVariantId: string;
    let testGameItemId: string;

    beforeAll(async () => {
      const gameItems = await db('game_items').select('id').limit(1);
      if (gameItems.length === 0) {
        throw new Error('No game items found. Please seed game_items table first.');
      }
      testGameItemId = gameItems[0].id;

      const [listing] = await db('listings').insert({
        seller_id: '00000000-0000-0000-0000-000000000001',
        seller_type: 'user',
        title: 'TEST_CHECK_LISTING',
        status: 'active'
      }).returning('*');
      testListingId = listing.listing_id;

      const [item] = await db('listing_items').insert({
        listing_id: testListingId,
        game_item_id: testGameItemId,
        pricing_mode: 'unified',
        base_price: 1000
      }).returning('*');
      testItemId = item.item_id;

      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({ quality_tier: 3 }),
        display_name: 'TEST CHECK Variant'
      }).returning('*');
      testVariantId = variant.variant_id;
    });

    afterAll(async () => {
      await db('listing_items').where('item_id', testItemId).del();
      await db('listings').where('listing_id', testListingId).del();
      await db('item_variants').where('variant_id', testVariantId).del();
    });

    it('should prevent invalid seller_type in listings', async () => {
      await expect(
        db.raw(`
          INSERT INTO listings (seller_id, seller_type, title, status)
          VALUES ('00000000-0000-0000-0000-000000000001', 'invalid_type', 'Test', 'active')
        `)
      ).rejects.toThrow();
    });

    it('should prevent invalid status in listings', async () => {
      await expect(
        db.raw(`
          INSERT INTO listings (seller_id, seller_type, title, status)
          VALUES ('00000000-0000-0000-0000-000000000001', 'user', 'Test', 'invalid_status')
        `)
      ).rejects.toThrow();
    });

    it('should prevent invalid pricing_mode in listing_items', async () => {
      await expect(
        db.raw(`
          INSERT INTO listing_items (listing_id, game_item_id, pricing_mode, base_price)
          VALUES (?, ?, 'invalid_mode', 1000)
        `, [testListingId, testGameItemId])
      ).rejects.toThrow();
    });

    it('should prevent negative quantity_available in listing_items', async () => {
      await expect(
        db.raw(`
          INSERT INTO listing_items (listing_id, game_item_id, pricing_mode, quantity_available)
          VALUES (?, ?, 'unified', -10)
        `, [testListingId, testGameItemId])
      ).rejects.toThrow();
    });

    it('should prevent negative quantity_total in listing_item_lots', async () => {
      await expect(
        db('listing_item_lots').insert({
          item_id: testItemId,
          variant_id: testVariantId,
          quantity_total: -5,
          listed: true,
          notes: 'TEST_CHECK_NEGATIVE'
        })
      ).rejects.toThrow();
    });

    it('should prevent zero or negative price in variant_pricing', async () => {
      await expect(
        db('variant_pricing').insert({
          item_id: testItemId,
          variant_id: testVariantId,
          price: 0
        })
      ).rejects.toThrow();

      await expect(
        db('variant_pricing').insert({
          item_id: testItemId,
          variant_id: testVariantId,
          price: -100
        })
      ).rejects.toThrow();
    });

    it('should prevent invalid quality_tier_min in buy_orders_v2', async () => {
      await expect(
        db.raw(`
          INSERT INTO buy_orders_v2 (buyer_id, game_item_id, quality_tier_min, quality_tier_max, quantity_desired)
          VALUES ('00000000-0000-0000-0000-000000000001', ?, 0, 5, 10)
        `, [testGameItemId])
      ).rejects.toThrow();

      await expect(
        db.raw(`
          INSERT INTO buy_orders_v2 (buyer_id, game_item_id, quality_tier_min, quality_tier_max, quantity_desired)
          VALUES ('00000000-0000-0000-0000-000000000001', ?, 6, 5, 10)
        `, [testGameItemId])
      ).rejects.toThrow();
    });

    it('should prevent quality_tier_min > quality_tier_max in buy_orders_v2', async () => {
      await expect(
        db.raw(`
          INSERT INTO buy_orders_v2 (buyer_id, game_item_id, quality_tier_min, quality_tier_max, quantity_desired)
          VALUES ('00000000-0000-0000-0000-000000000001', ?, 5, 3, 10)
        `, [testGameItemId])
      ).rejects.toThrow();
    });

    it('should prevent price_min > price_max in buy_orders_v2', async () => {
      await expect(
        db.raw(`
          INSERT INTO buy_orders_v2 (buyer_id, game_item_id, price_min, price_max, quantity_desired)
          VALUES ('00000000-0000-0000-0000-000000000001', ?, 1000, 500, 10)
        `, [testGameItemId])
      ).rejects.toThrow();
    });

    it('should prevent zero or negative quantity_desired in buy_orders_v2', async () => {
      await expect(
        db('buy_orders_v2').insert({
          buyer_id: '00000000-0000-0000-0000-000000000001',
          game_item_id: testGameItemId,
          quantity_desired: 0
        })
      ).rejects.toThrow();
    });
  });

  describe('4. Indexes Created and Used by Query Planner', () => {
    it('should have idx_listings_seller index', async () => {
      const result = await db.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'listings'
          AND indexname = 'idx_listings_seller'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toContain('seller_id');
      expect(result.rows[0].indexdef).toContain('seller_type');
    });

    it('should have idx_listings_status_created index', async () => {
      const result = await db.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'listings'
          AND indexname = 'idx_listings_status_created'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toContain('status');
      expect(result.rows[0].indexdef).toContain('created_at');
    });

    it('should have idx_listings_search_vector GIN index', async () => {
      const result = await db.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'listings'
          AND indexname = 'idx_listings_search_vector'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef.toLowerCase()).toContain('gin');
      expect(result.rows[0].indexdef).toContain('to_tsvector');
    });

    it('should have idx_listing_items_listing index', async () => {
      const result = await db.raw(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'listing_items'
          AND indexname = 'idx_listing_items_listing'
      `);
      
      expect(result.rows.length).toBe(1);
    });

    it('should have idx_listing_items_game_item index', async () => {
      const result = await db.raw(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'listing_items'
          AND indexname = 'idx_listing_items_game_item'
      `);
      
      expect(result.rows.length).toBe(1);
    });

    it('should have idx_item_variants_attributes GIN index', async () => {
      const result = await db.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'item_variants'
          AND indexname = 'idx_item_variants_attributes'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef.toLowerCase()).toContain('gin');
      expect(result.rows[0].indexdef).toContain('attributes');
    });

    it('should have idx_listing_item_lots_item_listed composite index', async () => {
      const result = await db.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'listing_item_lots'
          AND indexname = 'idx_listing_item_lots_item_listed'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexdef).toContain('item_id');
      expect(result.rows[0].indexdef).toContain('listed');
    });

    it('should have unique constraint on item_variants (game_item_id, attributes_hash)', async () => {
      const result = await db.raw(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'item_variants'
          AND constraint_type = 'UNIQUE'
          AND constraint_name = 'uq_item_variants_game_item_hash'
      `);
      
      expect(result.rows.length).toBe(1);
    });

    it('should have unique constraint on variant_pricing (item_id, variant_id)', async () => {
      const result = await db.raw(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'variant_pricing'
          AND constraint_type = 'UNIQUE'
          AND constraint_name = 'uq_variant_pricing_item_variant'
      `);
      
      expect(result.rows.length).toBe(1);
    });

    it('should use idx_listings_status_created for active listings query', async () => {
      const result = await db.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT listing_id, title, created_at
        FROM listings
        WHERE status = 'active'
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      
      // The query planner should use the index
      // Note: This might be "Index Scan" or "Bitmap Index Scan" depending on data
      expect(plan.toLowerCase()).toMatch(/index|idx_listings_status_created/i);
    });

    it('should use idx_listing_items_game_item for game item filter', async () => {
      const gameItems = await db('game_items').select('id').limit(1);
      if (gameItems.length === 0) {
        console.log('Skipping test: No game items found');
        return;
      }

      const result = await db.raw(`
        EXPLAIN (FORMAT JSON)
        SELECT item_id, listing_id
        FROM listing_items
        WHERE game_item_id = ?
      `, [gameItems[0].id]);
      
      const plan = JSON.stringify(result.rows[0]['QUERY PLAN']);
      
      // Should use the game_item_id index
      expect(plan.toLowerCase()).toMatch(/index|idx_listing_items_game_item/i);
    });
  });

  describe('5. Trigger Updates quantity_available Correctly', () => {
    let testListingId: string;
    let testItemId: string;
    let testVariantId: string;
    let testGameItemId: string;

    beforeAll(async () => {
      const gameItems = await db('game_items').select('id').limit(1);
      if (gameItems.length === 0) {
        throw new Error('No game items found. Please seed game_items table first.');
      }
      testGameItemId = gameItems[0].id;
    });

    beforeEach(async () => {
      // Clean up any existing test data
      await db('listing_item_lots').where('notes', 'LIKE', '%TEST_TRIGGER_MIGRATION%').del();
      await db('listing_items').whereIn('listing_id',
        db('listings').select('listing_id').where('title', 'LIKE', '%TEST_TRIGGER_MIGRATION%')
      ).del();
      await db('listings').where('title', 'LIKE', '%TEST_TRIGGER_MIGRATION%').del();
      await db('item_variants').where('display_name', 'LIKE', '%TEST_TRIGGER_MIGRATION%').del();

      // Create fresh test data
      const [listing] = await db('listings').insert({
        seller_id: '00000000-0000-0000-0000-000000000001',
        seller_type: 'user',
        title: 'TEST_TRIGGER_MIGRATION_LISTING',
        status: 'active'
      }).returning('*');
      testListingId = listing.listing_id;

      const [item] = await db('listing_items').insert({
        listing_id: testListingId,
        game_item_id: testGameItemId,
        pricing_mode: 'unified',
        base_price: 1000,
        quantity_available: 0,
        variant_count: 0
      }).returning('*');
      testItemId = item.item_id;

      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({ quality_tier: 3 }),
        display_name: 'TEST_TRIGGER_MIGRATION Variant'
      }).returning('*');
      testVariantId = variant.variant_id;
    });

    it('should update quantity_available when inserting listed lot', async () => {
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId,
        quantity_total: 15,
        listed: true,
        notes: 'TEST_TRIGGER_MIGRATION_LOT_1'
      });

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(15);
      expect(item.variant_count).toBe(1);
    });

    it('should NOT count unlisted lots in quantity_available', async () => {
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId,
        quantity_total: 20,
        listed: false,
        notes: 'TEST_TRIGGER_MIGRATION_LOT_2'
      });

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(0);
      expect(item.variant_count).toBe(0);
    });

    it('should update quantity_available when updating lot quantity', async () => {
      const [lot] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_MIGRATION_LOT_3'
      }).returning('*');

      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ quantity_total: 30 });

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available');
      
      expect(item.quantity_available).toBe(30);
    });

    it('should update quantity_available when toggling listed status', async () => {
      const [lot] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId,
        quantity_total: 25,
        listed: true,
        notes: 'TEST_TRIGGER_MIGRATION_LOT_4'
      }).returning('*');

      // Toggle to unlisted
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ listed: false });

      let [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(0);
      expect(item.variant_count).toBe(0);

      // Toggle back to listed
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ listed: true });

      [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(25);
      expect(item.variant_count).toBe(1);
    });

    it('should update quantity_available when deleting lot', async () => {
      const [lot1] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_MIGRATION_LOT_5'
      }).returning('*');

      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId,
        quantity_total: 5,
        listed: true,
        notes: 'TEST_TRIGGER_MIGRATION_LOT_6'
      });

      // Verify initial state
      let [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available');
      expect(item.quantity_available).toBe(15);

      // Delete one lot
      await db('listing_item_lots')
        .where('lot_id', lot1.lot_id)
        .del();

      [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available');
      expect(item.quantity_available).toBe(5);
    });

    it('should correctly count distinct variants in variant_count', async () => {
      // Create second variant
      const [variant2] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({ quality_tier: 5 }),
        display_name: 'TEST_TRIGGER_MIGRATION Variant 2'
      }).returning('*');

      // Insert lots with different variants
      await db('listing_item_lots').insert([
        {
          item_id: testItemId,
          variant_id: testVariantId,
          quantity_total: 10,
          listed: true,
          notes: 'TEST_TRIGGER_MIGRATION_LOT_7'
        },
        {
          item_id: testItemId,
          variant_id: variant2.variant_id,
          quantity_total: 5,
          listed: true,
          notes: 'TEST_TRIGGER_MIGRATION_LOT_8'
        }
      ]);

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(15);
      expect(item.variant_count).toBe(2);

      // Clean up
      await db('item_variants').where('variant_id', variant2.variant_id).del();
    });
  });

  describe('Additional Migration Verification', () => {
    it('should have created update_quantity_available() function', async () => {
      const result = await db.raw(`
        SELECT proname, prosrc 
        FROM pg_proc 
        WHERE proname = 'update_quantity_available'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].prosrc).toContain('quantity_available');
      expect(result.rows[0].prosrc).toContain('variant_count');
    });

    it('should have created generate_attributes_hash() function', async () => {
      const result = await db.raw(`
        SELECT proname, prosrc 
        FROM pg_proc 
        WHERE proname = 'generate_attributes_hash'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].prosrc).toContain('attributes_hash');
      expect(result.rows[0].prosrc).toContain('sha256');
    });

    it('should have created trg_listing_item_lots_quantity trigger', async () => {
      const result = await db.raw(`
        SELECT tgname, tgenabled
        FROM pg_trigger
        WHERE tgname = 'trg_listing_item_lots_quantity'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].tgenabled).toBe('O'); // Enabled
    });

    it('should have created trg_item_variants_hash trigger', async () => {
      const result = await db.raw(`
        SELECT tgname, tgenabled
        FROM pg_trigger
        WHERE tgname = 'trg_item_variants_hash'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].tgenabled).toBe('O'); // Enabled
    });

    it('should have seeded variant_types table with 4 types', async () => {
      const result = await db('variant_types').count('* as count');
      expect(parseInt(result[0].count as string)).toBe(4);
    });
  });
});
