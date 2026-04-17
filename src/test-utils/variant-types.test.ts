import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile.js';

/**
 * Variant Types Seed Data Tests for Task 1.6
 * 
 * Tests that the variant_types table was seeded correctly with:
 * - quality_tier (integer 1-5)
 * - quality_value (decimal 0-100)
 * - crafted_source (enum: crafted, store, looted, unknown)
 * - blueprint_tier (integer 1-5)
 * 
 * Verifies validation rules and display_order are correct.
 * 
 * Requirements: 4.4, 4.5, 5.1-5.4
 */

describe('Variant Types Seed Data - Task 1.6', () => {
  let db: Knex;

  beforeAll(async () => {
    // Connect to database
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

  describe('Table Existence and Structure', () => {
    it('should verify variant_types table exists', async () => {
      const result = await db.raw(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'variant_types'
        ) as table_exists
      `);
      
      expect(result.rows[0].table_exists).toBe(true);
    });

    it('should have all required columns', async () => {
      const result = await db.raw(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'variant_types'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows.map((r: any) => r.column_name);
      
      expect(columns).toContain('variant_type_id');
      expect(columns).toContain('name');
      expect(columns).toContain('display_name');
      expect(columns).toContain('description');
      expect(columns).toContain('affects_pricing');
      expect(columns).toContain('searchable');
      expect(columns).toContain('filterable');
      expect(columns).toContain('value_type');
      expect(columns).toContain('min_value');
      expect(columns).toContain('max_value');
      expect(columns).toContain('allowed_values');
      expect(columns).toContain('display_order');
      expect(columns).toContain('icon');
      expect(columns).toContain('created_at');
    });

    it('should have unique constraint on name column', async () => {
      const result = await db.raw(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'variant_types'
          AND constraint_type = 'UNIQUE'
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have check constraint on value_type', async () => {
      const result = await db.raw(`
        SELECT constraint_name, check_clause
        FROM information_schema.check_constraints
        WHERE constraint_name LIKE '%variant_types_value_type%'
      `);
      
      expect(result.rows.length).toBeGreaterThan(0);
      const checkClause = result.rows[0].check_clause.toLowerCase();
      expect(checkClause).toContain('integer');
      expect(checkClause).toContain('decimal');
      expect(checkClause).toContain('string');
      expect(checkClause).toContain('enum');
    });
  });

  describe('Seed Data Completeness', () => {
    it('should have exactly 4 variant types seeded', async () => {
      const result = await db('variant_types').count('* as count');
      expect(parseInt(result[0].count as string)).toBe(4);
    });

    it('should have all required variant type names', async () => {
      const result = await db('variant_types')
        .select('name')
        .orderBy('display_order');
      
      const names = result.map(r => r.name);
      
      expect(names).toContain('quality_tier');
      expect(names).toContain('quality_value');
      expect(names).toContain('crafted_source');
      expect(names).toContain('blueprint_tier');
    });
  });

  describe('quality_tier Variant Type', () => {
    let qualityTier: any;

    beforeAll(async () => {
      const result = await db('variant_types')
        .where('name', 'quality_tier')
        .first();
      qualityTier = result;
    });

    it('should exist in database', () => {
      expect(qualityTier).toBeDefined();
    });

    it('should have correct display_name', () => {
      expect(qualityTier.display_name).toBe('Quality Tier');
    });

    it('should have correct description', () => {
      expect(qualityTier.description).toContain('quality level');
      expect(qualityTier.description).toContain('1');
      expect(qualityTier.description).toContain('5');
    });

    it('should have value_type as integer', () => {
      expect(qualityTier.value_type).toBe('integer');
    });

    it('should have min_value of 1', () => {
      expect(parseFloat(qualityTier.min_value)).toBe(1);
    });

    it('should have max_value of 5', () => {
      expect(parseFloat(qualityTier.max_value)).toBe(5);
    });

    it('should have display_order of 0', () => {
      expect(qualityTier.display_order).toBe(0);
    });

    it('should have affects_pricing as true by default', () => {
      expect(qualityTier.affects_pricing).toBe(true);
    });

    it('should have searchable as true by default', () => {
      expect(qualityTier.searchable).toBe(true);
    });

    it('should have filterable as true by default', () => {
      expect(qualityTier.filterable).toBe(true);
    });

    it('should not have allowed_values (not an enum)', () => {
      expect(qualityTier.allowed_values).toBeNull();
    });
  });

  describe('quality_value Variant Type', () => {
    let qualityValue: any;

    beforeAll(async () => {
      const result = await db('variant_types')
        .where('name', 'quality_value')
        .first();
      qualityValue = result;
    });

    it('should exist in database', () => {
      expect(qualityValue).toBeDefined();
    });

    it('should have correct display_name', () => {
      expect(qualityValue.display_name).toBe('Quality Value');
    });

    it('should have correct description', () => {
      expect(qualityValue.description).toContain('quality percentage');
      expect(qualityValue.description).toContain('0');
      expect(qualityValue.description).toContain('100');
    });

    it('should have value_type as decimal', () => {
      expect(qualityValue.value_type).toBe('decimal');
    });

    it('should have min_value of 0', () => {
      expect(parseFloat(qualityValue.min_value)).toBe(0);
    });

    it('should have max_value of 100', () => {
      expect(parseFloat(qualityValue.max_value)).toBe(100);
    });

    it('should have display_order of 1', () => {
      expect(qualityValue.display_order).toBe(1);
    });

    it('should have affects_pricing as true by default', () => {
      expect(qualityValue.affects_pricing).toBe(true);
    });

    it('should have searchable as true by default', () => {
      expect(qualityValue.searchable).toBe(true);
    });

    it('should have filterable as true by default', () => {
      expect(qualityValue.filterable).toBe(true);
    });

    it('should not have allowed_values (not an enum)', () => {
      expect(qualityValue.allowed_values).toBeNull();
    });
  });

  describe('crafted_source Variant Type', () => {
    let craftedSource: any;

    beforeAll(async () => {
      const result = await db('variant_types')
        .where('name', 'crafted_source')
        .first();
      craftedSource = result;
    });

    it('should exist in database', () => {
      expect(craftedSource).toBeDefined();
    });

    it('should have correct display_name', () => {
      expect(craftedSource.display_name).toBe('Source');
    });

    it('should have correct description', () => {
      expect(craftedSource.description).toContain('obtained');
    });

    it('should have value_type as enum', () => {
      expect(craftedSource.value_type).toBe('enum');
    });

    it('should not have min_value (enum type)', () => {
      expect(craftedSource.min_value).toBeNull();
    });

    it('should not have max_value (enum type)', () => {
      expect(craftedSource.max_value).toBeNull();
    });

    it('should have allowed_values with correct enum values', () => {
      expect(craftedSource.allowed_values).toBeDefined();
      
      const allowedValues = JSON.parse(craftedSource.allowed_values);
      expect(Array.isArray(allowedValues)).toBe(true);
      expect(allowedValues).toHaveLength(4);
      expect(allowedValues).toContain('crafted');
      expect(allowedValues).toContain('store');
      expect(allowedValues).toContain('looted');
      expect(allowedValues).toContain('unknown');
    });

    it('should have display_order of 2', () => {
      expect(craftedSource.display_order).toBe(2);
    });

    it('should have affects_pricing as true by default', () => {
      expect(craftedSource.affects_pricing).toBe(true);
    });

    it('should have searchable as true by default', () => {
      expect(craftedSource.searchable).toBe(true);
    });

    it('should have filterable as true by default', () => {
      expect(craftedSource.filterable).toBe(true);
    });
  });

  describe('blueprint_tier Variant Type', () => {
    let blueprintTier: any;

    beforeAll(async () => {
      const result = await db('variant_types')
        .where('name', 'blueprint_tier')
        .first();
      blueprintTier = result;
    });

    it('should exist in database', () => {
      expect(blueprintTier).toBeDefined();
    });

    it('should have correct display_name', () => {
      expect(blueprintTier.display_name).toBe('Blueprint Tier');
    });

    it('should have correct description', () => {
      expect(blueprintTier.description).toContain('Blueprint');
      expect(blueprintTier.description).toContain('craftable');
    });

    it('should have value_type as integer', () => {
      expect(blueprintTier.value_type).toBe('integer');
    });

    it('should have min_value of 1', () => {
      expect(parseFloat(blueprintTier.min_value)).toBe(1);
    });

    it('should have max_value of 5', () => {
      expect(parseFloat(blueprintTier.max_value)).toBe(5);
    });

    it('should have display_order of 3', () => {
      expect(blueprintTier.display_order).toBe(3);
    });

    it('should have affects_pricing as true by default', () => {
      expect(blueprintTier.affects_pricing).toBe(true);
    });

    it('should have searchable as true by default', () => {
      expect(blueprintTier.searchable).toBe(true);
    });

    it('should have filterable as true by default', () => {
      expect(blueprintTier.filterable).toBe(true);
    });

    it('should not have allowed_values (not an enum)', () => {
      expect(blueprintTier.allowed_values).toBeNull();
    });
  });

  describe('Display Order Validation', () => {
    it('should have sequential display_order starting from 0', async () => {
      const result = await db('variant_types')
        .select('name', 'display_order')
        .orderBy('display_order');
      
      expect(result[0].display_order).toBe(0);
      expect(result[1].display_order).toBe(1);
      expect(result[2].display_order).toBe(2);
      expect(result[3].display_order).toBe(3);
    });

    it('should order variant types correctly', async () => {
      const result = await db('variant_types')
        .select('name')
        .orderBy('display_order');
      
      expect(result[0].name).toBe('quality_tier');
      expect(result[1].name).toBe('quality_value');
      expect(result[2].name).toBe('crafted_source');
      expect(result[3].name).toBe('blueprint_tier');
    });
  });

  describe('Index Verification', () => {
    it('should have idx_variant_types_searchable index', async () => {
      const result = await db.raw(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'variant_types'
          AND indexname = 'idx_variant_types_searchable'
      `);
      
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].indexname).toBe('idx_variant_types_searchable');
    });

    it('should have index on searchable column with WHERE clause', async () => {
      const result = await db.raw(`
        SELECT indexdef
        FROM pg_indexes
        WHERE tablename = 'variant_types'
          AND indexname = 'idx_variant_types_searchable'
      `);
      
      const indexDef = result.rows[0].indexdef.toLowerCase();
      expect(indexDef).toContain('searchable');
      expect(indexDef).toContain('where');
    });
  });

  describe('Variant Creation with Validation', () => {
    let testGameItemId: string;
    let testVariantId: string;

    beforeAll(async () => {
      // Get a test game item
      const gameItems = await db('game_items').select('id').limit(1);
      if (gameItems.length === 0) {
        throw new Error('No game items found. Please seed game_items table first.');
      }
      testGameItemId = gameItems[0].id;
    });

    afterAll(async () => {
      // Clean up test variant
      if (testVariantId) {
        await db('item_variants').where('variant_id', testVariantId).del();
      }
    });

    it('should create variant with quality_tier within valid range (1-5)', async () => {
      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({
          quality_tier: 3,
          quality_value: 75.5,
          crafted_source: 'crafted'
        }),
        display_name: 'TEST Tier 3 (75.5%) - Crafted',
        short_name: 'T3 Crafted'
      }).returning('*');

      testVariantId = variant.variant_id;
      
      expect(variant).toBeDefined();
      const attrs = JSON.parse(variant.attributes);
      expect(attrs.quality_tier).toBe(3);
      expect(attrs.quality_tier).toBeGreaterThanOrEqual(1);
      expect(attrs.quality_tier).toBeLessThanOrEqual(5);
    });

    it('should create variant with quality_value within valid range (0-100)', async () => {
      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({
          quality_tier: 5,
          quality_value: 95.0,
          crafted_source: 'store'
        }),
        display_name: 'TEST Tier 5 (95.0%) - Store',
        short_name: 'T5 Store'
      }).returning('*');

      const attrs = JSON.parse(variant.attributes);
      expect(attrs.quality_value).toBe(95.0);
      expect(attrs.quality_value).toBeGreaterThanOrEqual(0);
      expect(attrs.quality_value).toBeLessThanOrEqual(100);

      // Clean up
      await db('item_variants').where('variant_id', variant.variant_id).del();
    });

    it('should create variant with valid crafted_source enum value', async () => {
      const validSources = ['crafted', 'store', 'looted', 'unknown'];
      
      for (const source of validSources) {
        const [variant] = await db('item_variants').insert({
          game_item_id: testGameItemId,
          attributes: JSON.stringify({
            quality_tier: 2,
            quality_value: 50.0,
            crafted_source: source
          }),
          display_name: `TEST Tier 2 - ${source}`,
          short_name: `T2 ${source}`
        }).returning('*');

        const attrs = JSON.parse(variant.attributes);
        expect(attrs.crafted_source).toBe(source);
        expect(validSources).toContain(attrs.crafted_source);

        // Clean up
        await db('item_variants').where('variant_id', variant.variant_id).del();
      }
    });

    it('should create variant with blueprint_tier within valid range (1-5)', async () => {
      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({
          quality_tier: 4,
          quality_value: 85.0,
          crafted_source: 'crafted',
          blueprint_tier: 3
        }),
        display_name: 'TEST Tier 4 (85.0%) - Crafted - BP T3',
        short_name: 'T4 C BP3'
      }).returning('*');

      const attrs = JSON.parse(variant.attributes);
      expect(attrs.blueprint_tier).toBe(3);
      expect(attrs.blueprint_tier).toBeGreaterThanOrEqual(1);
      expect(attrs.blueprint_tier).toBeLessThanOrEqual(5);

      // Clean up
      await db('item_variants').where('variant_id', variant.variant_id).del();
    });

    it('should create variant with all variant types combined', async () => {
      const [variant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({
          quality_tier: 5,
          quality_value: 98.5,
          crafted_source: 'crafted',
          blueprint_tier: 5
        }),
        display_name: 'TEST Tier 5 (98.5%) - Crafted - BP T5',
        short_name: 'T5 C BP5'
      }).returning('*');

      const attrs = JSON.parse(variant.attributes);
      expect(attrs.quality_tier).toBe(5);
      expect(attrs.quality_value).toBe(98.5);
      expect(attrs.crafted_source).toBe('crafted');
      expect(attrs.blueprint_tier).toBe(5);

      // Clean up
      await db('item_variants').where('variant_id', variant.variant_id).del();
    });
  });

  describe('Variant Type Usage in Queries', () => {
    it('should be able to query variant_types for UI rendering', async () => {
      const result = await db('variant_types')
        .select('name', 'display_name', 'value_type', 'min_value', 'max_value', 'allowed_values')
        .where('filterable', true)
        .orderBy('display_order');
      
      expect(result.length).toBeGreaterThan(0);
      
      // Verify we can use this data to build UI filters
      result.forEach(vt => {
        expect(vt.name).toBeDefined();
        expect(vt.display_name).toBeDefined();
        expect(vt.value_type).toBeDefined();
        
        if (vt.value_type === 'integer' || vt.value_type === 'decimal') {
          expect(vt.min_value).toBeDefined();
          expect(vt.max_value).toBeDefined();
        }
        
        if (vt.value_type === 'enum') {
          expect(vt.allowed_values).toBeDefined();
        }
      });
    });

    it('should be able to query searchable variant types', async () => {
      const result = await db('variant_types')
        .select('name', 'display_name')
        .where('searchable', true)
        .orderBy('display_order');
      
      expect(result.length).toBe(4); // All 4 should be searchable by default
    });

    it('should be able to query variant types that affect pricing', async () => {
      const result = await db('variant_types')
        .select('name', 'display_name')
        .where('affects_pricing', true)
        .orderBy('display_order');
      
      expect(result.length).toBe(4); // All 4 should affect pricing by default
    });
  });
});
