import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile';

/**
 * Database Trigger Tests for Task 1.5
 * 
 * Tests the update_quantity_available() trigger function that:
 * - Recalculates quantity_available from sum of listed stock lots
 * - Recalculates variant_count from count of distinct variants
 * - Triggers on INSERT, UPDATE, DELETE of listing_item_lots
 * - Executes within <10ms performance target
 * 
 * Requirements: 7.7, 20.9
 */

describe('Database Triggers - update_quantity_available()', () => {
  let db: Knex;
  let testListingId: string;
  let testItemId: string;
  let testVariantId1: string;
  let testVariantId2: string;
  let testGameItemId: string;

  beforeAll(async () => {
    // Connect to test database
    db = knex(knexConfig.development);
    
    // Verify we're not in production
    const dbName = await db.raw('SELECT current_database()');
    if (dbName.rows[0].current_database.includes('prod')) {
      throw new Error('SAFETY: Cannot run tests against production database');
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean up test data
    await db('listing_item_lots').where('notes', 'LIKE', '%TEST_TRIGGER%').del();
    await db('variant_pricing').whereIn('item_id', 
      db('listing_items').select('item_id').whereIn('listing_id',
        db('listings').select('listing_id').where('title', 'LIKE', '%TEST_TRIGGER%')
      )
    ).del();
    await db('listing_items').whereIn('listing_id',
      db('listings').select('listing_id').where('title', 'LIKE', '%TEST_TRIGGER%')
    ).del();
    await db('listings').where('title', 'LIKE', '%TEST_TRIGGER%').del();
    await db('item_variants').where('display_name', 'LIKE', '%TEST_TRIGGER%').del();

    // Create test data
    // 1. Get or create a test game item
    const gameItems = await db('game_items').select('id').limit(1);
    if (gameItems.length === 0) {
      throw new Error('No game items found in database. Please seed game_items table first.');
    }
    testGameItemId = gameItems[0].id;

    // 2. Create test listing
    const [listing] = await db('listings').insert({
      seller_id: '00000000-0000-0000-0000-000000000001',
      seller_type: 'user',
      title: 'TEST_TRIGGER_LISTING',
      description: 'Test listing for trigger verification',
      status: 'active',
      visibility: 'public',
      sale_type: 'fixed',
      listing_type: 'single'
    }).returning('*');
    testListingId = listing.listing_id;

    // 3. Create test listing_item
    const [item] = await db('listing_items').insert({
      listing_id: testListingId,
      game_item_id: testGameItemId,
      pricing_mode: 'unified',
      base_price: 1000,
      display_order: 0,
      quantity_available: 0,
      variant_count: 0
    }).returning('*');
    testItemId = item.item_id;

    // 4. Create test variants
    const [variant1] = await db('item_variants').insert({
      game_item_id: testGameItemId,
      attributes: JSON.stringify({ quality_tier: 3, quality_value: 75.5, crafted_source: 'crafted' }),
      display_name: 'TEST_TRIGGER Tier 3 (75.5%) - Crafted',
      short_name: 'T3 Crafted'
    }).returning('*');
    testVariantId1 = variant1.variant_id;

    const [variant2] = await db('item_variants').insert({
      game_item_id: testGameItemId,
      attributes: JSON.stringify({ quality_tier: 5, quality_value: 95.0, crafted_source: 'crafted' }),
      display_name: 'TEST_TRIGGER Tier 5 (95.0%) - Crafted',
      short_name: 'T5 Crafted'
    }).returning('*');
    testVariantId2 = variant2.variant_id;
  });

  describe('Trigger Existence and Attachment', () => {
    it('should verify update_quantity_available() function exists', async () => {
      const result = await db.raw(`
        SELECT proname, prosrc 
        FROM pg_proc 
        WHERE proname = 'update_quantity_available'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].proname).toBe('update_quantity_available');
      expect(result.rows[0].prosrc).toContain('quantity_available');
      expect(result.rows[0].prosrc).toContain('variant_count');
    });

    it('should verify trigger is attached to listing_item_lots table', async () => {
      const result = await db.raw(`
        SELECT tgname, tgtype, tgenabled
        FROM pg_trigger
        WHERE tgname = 'trg_listing_item_lots_quantity'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].tgname).toBe('trg_listing_item_lots_quantity');
      expect(result.rows[0].tgenabled).toBe('O'); // 'O' means trigger is enabled
    });

    it('should verify trigger fires on INSERT, UPDATE, DELETE', async () => {
      const result = await db.raw(`
        SELECT 
          tgname,
          tgtype,
          pg_get_triggerdef(oid) as trigger_def
        FROM pg_trigger
        WHERE tgname = 'trg_listing_item_lots_quantity'
      `);
      
      expect(result.rows.length).toBe(1);
      const triggerDef = result.rows[0].trigger_def.toLowerCase();
      
      // Verify it's an AFTER trigger
      expect(triggerDef).toContain('after');
      
      // Verify it fires on INSERT, UPDATE, and DELETE
      expect(triggerDef).toContain('insert');
      expect(triggerDef).toContain('update');
      expect(triggerDef).toContain('delete');
    });
  });

  describe('Trigger Functionality - INSERT', () => {
    it('should update quantity_available when inserting a listed stock lot', async () => {
      // Insert a stock lot with quantity 10
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_LOT_1'
      });

      // Check that quantity_available was updated
      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(10);
      expect(item.variant_count).toBe(1);
    });

    it('should update variant_count when inserting lots with different variants', async () => {
      // Insert two lots with different variants
      await db('listing_item_lots').insert([
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 5,
          listed: true,
          notes: 'TEST_TRIGGER_LOT_2'
        },
        {
          item_id: testItemId,
          variant_id: testVariantId2,
          quantity_total: 3,
          listed: true,
          notes: 'TEST_TRIGGER_LOT_3'
        }
      ]);

      // Check that both quantity_available and variant_count were updated
      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(8); // 5 + 3
      expect(item.variant_count).toBe(2); // 2 distinct variants
    });

    it('should NOT count unlisted lots in quantity_available', async () => {
      // Insert one listed and one unlisted lot
      await db('listing_item_lots').insert([
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 10,
          listed: true,
          notes: 'TEST_TRIGGER_LOT_4'
        },
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 20,
          listed: false,
          notes: 'TEST_TRIGGER_LOT_5'
        }
      ]);

      // Check that only listed lot is counted
      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(10); // Only the listed lot
      expect(item.variant_count).toBe(1); // Only the listed lot's variant
    });
  });

  describe('Trigger Functionality - UPDATE', () => {
    it('should update quantity_available when updating lot quantity', async () => {
      // Insert initial lot
      const [lot] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_LOT_6'
      }).returning('*');

      // Update quantity
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ quantity_total: 25 });

      // Check updated quantity_available
      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available');
      
      expect(item.quantity_available).toBe(25);
    });

    it('should update quantity_available when toggling listed status', async () => {
      // Insert lot
      const [lot] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 15,
        listed: true,
        notes: 'TEST_TRIGGER_LOT_7'
      }).returning('*');

      // Verify initial state
      let [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(15);
      expect(item.variant_count).toBe(1);

      // Toggle to unlisted
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ listed: false });

      // Check that quantity_available is now 0
      [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(0);
      expect(item.variant_count).toBe(0);

      // Toggle back to listed
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ listed: true });

      // Check that quantity_available is restored
      [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(15);
      expect(item.variant_count).toBe(1);
    });
  });

  describe('Trigger Functionality - DELETE', () => {
    it('should update quantity_available when deleting a stock lot', async () => {
      // Insert two lots
      const [lot1] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_LOT_8'
      }).returning('*');

      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId2,
        quantity_total: 5,
        listed: true,
        notes: 'TEST_TRIGGER_LOT_9'
      });

      // Verify initial state
      let [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(15);
      expect(item.variant_count).toBe(2);

      // Delete one lot
      await db('listing_item_lots')
        .where('lot_id', lot1.lot_id)
        .del();

      // Check updated values
      [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(5);
      expect(item.variant_count).toBe(1);
    });

    it('should set quantity_available to 0 when deleting all lots', async () => {
      // Insert lot
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_LOT_10'
      });

      // Delete all lots for this item
      await db('listing_item_lots')
        .where('item_id', testItemId)
        .del();

      // Check that quantity_available is 0
      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(0);
      expect(item.variant_count).toBe(0);
    });
  });

  describe('Trigger Performance', () => {
    it('should execute INSERT trigger within reasonable time (<50ms)', async () => {
      // Measure database operation time including trigger execution
      const startTime = performance.now();
      
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_PERF_1'
      });
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // The requirement is <10ms for trigger execution, but we're measuring
      // total operation time including network, query parsing, etc.
      // A reasonable threshold is <50ms for the complete operation
      expect(executionTime).toBeLessThan(50);
      
      // Log actual time for monitoring
      console.log(`INSERT trigger execution time: ${executionTime.toFixed(2)}ms`);
    });

    it('should execute UPDATE trigger within reasonable time (<50ms)', async () => {
      // Insert lot first
      const [lot] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_PERF_2'
      }).returning('*');

      const startTime = performance.now();
      
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .update({ quantity_total: 20 });
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      expect(executionTime).toBeLessThan(50);
      console.log(`UPDATE trigger execution time: ${executionTime.toFixed(2)}ms`);
    });

    it('should execute DELETE trigger within reasonable time (<50ms)', async () => {
      // Insert lot first
      const [lot] = await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_PERF_3'
      }).returning('*');

      const startTime = performance.now();
      
      await db('listing_item_lots')
        .where('lot_id', lot.lot_id)
        .del();
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      expect(executionTime).toBeLessThan(50);
      console.log(`DELETE trigger execution time: ${executionTime.toFixed(2)}ms`);
    });

    it('should measure pure trigger execution time via EXPLAIN ANALYZE', async () => {
      // Insert a lot first
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 10,
        listed: true,
        notes: 'TEST_TRIGGER_PERF_BASELINE'
      });

      // Use EXPLAIN ANALYZE to measure actual database execution time
      const result = await db.raw(`
        EXPLAIN (ANALYZE, TIMING) 
        INSERT INTO listing_item_lots (item_id, variant_id, quantity_total, listed, notes)
        VALUES (?, ?, 5, true, 'TEST_TRIGGER_PERF_MEASURE')
      `, [testItemId, testVariantId1]);

      // Parse execution time from EXPLAIN output
      const explainOutput = result.rows.map((r: any) => r['QUERY PLAN']).join('\n');
      console.log('EXPLAIN ANALYZE output:', explainOutput);
      
      // Extract execution time (format: "Execution Time: X.XXX ms")
      const timeMatch = explainOutput.match(/Execution Time: ([\d.]+) ms/);
      if (timeMatch) {
        const dbExecutionTime = parseFloat(timeMatch[1]);
        console.log(`Pure database execution time (including trigger): ${dbExecutionTime.toFixed(3)}ms`);
        
        // The pure database execution should be well under 10ms
        expect(dbExecutionTime).toBeLessThan(10);
      }
    });

    it('should handle bulk operations efficiently', async () => {
      const startTime = performance.now();
      
      // Insert 10 lots at once
      const lots = Array.from({ length: 10 }, (_, i) => ({
        item_id: testItemId,
        variant_id: i % 2 === 0 ? testVariantId1 : testVariantId2,
        quantity_total: 5,
        listed: true,
        notes: `TEST_TRIGGER_BULK_${i}`
      }));
      
      await db('listing_item_lots').insert(lots);
      
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      
      // Should complete within reasonable time (50ms per operation * 10 = 500ms max)
      expect(executionTime).toBeLessThan(500);
      console.log(`Bulk insert (10 lots) execution time: ${executionTime.toFixed(2)}ms`);

      // Verify correct totals
      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      expect(item.quantity_available).toBe(50); // 10 lots * 5 each
      expect(item.variant_count).toBe(2); // 2 distinct variants
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero quantity correctly', async () => {
      await db('listing_item_lots').insert({
        item_id: testItemId,
        variant_id: testVariantId1,
        quantity_total: 0,
        listed: true,
        notes: 'TEST_TRIGGER_EDGE_1'
      });

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(0);
      expect(item.variant_count).toBe(1); // Variant still counts even with 0 quantity
    });

    it('should handle multiple lots of same variant correctly', async () => {
      // Insert 3 lots of the same variant
      await db('listing_item_lots').insert([
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 5,
          listed: true,
          notes: 'TEST_TRIGGER_EDGE_2A'
        },
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 10,
          listed: true,
          notes: 'TEST_TRIGGER_EDGE_2B'
        },
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 3,
          listed: true,
          notes: 'TEST_TRIGGER_EDGE_2C'
        }
      ]);

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(18); // 5 + 10 + 3
      expect(item.variant_count).toBe(1); // Only 1 distinct variant
    });

    it('should handle mixed listed/unlisted lots of same variant', async () => {
      await db('listing_item_lots').insert([
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 10,
          listed: true,
          notes: 'TEST_TRIGGER_EDGE_3A'
        },
        {
          item_id: testItemId,
          variant_id: testVariantId1,
          quantity_total: 20,
          listed: false,
          notes: 'TEST_TRIGGER_EDGE_3B'
        }
      ]);

      const [item] = await db('listing_items')
        .where('item_id', testItemId)
        .select('quantity_available', 'variant_count');
      
      expect(item.quantity_available).toBe(10); // Only listed lot
      expect(item.variant_count).toBe(1); // Only listed lot's variant counts
    });
  });
});
