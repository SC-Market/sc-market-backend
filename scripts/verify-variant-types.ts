#!/usr/bin/env tsx

/**
 * Variant Types Verification Script for Task 1.6
 * 
 * This script verifies that the variant_types table was seeded correctly
 * with all 4 required variant types and their validation rules.
 * 
 * Requirements: 4.4, 4.5, 5.1-5.4
 */

import knex, { Knex } from 'knex';
import knexConfig from '../knexfile.js';

interface VariantType {
  variant_type_id: string;
  name: string;
  display_name: string;
  description: string;
  affects_pricing: boolean;
  searchable: boolean;
  filterable: boolean;
  value_type: string;
  min_value: number | null;
  max_value: number | null;
  allowed_values: string | null;
  display_order: number;
  icon: string | null;
  created_at: Date;
}

async function verifyVariantTypes() {
  console.log('=========================================');
  console.log('Variant Types Verification - Task 1.6');
  console.log('=========================================\n');

  const db: Knex = knex(knexConfig.development);

  try {
    // Check database connection
    console.log('Connecting to database...');
    const dbName = await db.raw('SELECT current_database()');
    console.log(`✓ Connected to database: ${dbName.rows[0].current_database}\n`);

    // Verify table exists
    console.log('Checking if variant_types table exists...');
    const tableExists = await db.schema.hasTable('variant_types');
    if (!tableExists) {
      console.error('✗ variant_types table NOT FOUND');
      process.exit(1);
    }
    console.log('✓ variant_types table exists\n');

    // Get all variant types
    console.log('Fetching variant types...');
    const variantTypes = await db('variant_types')
      .select('*')
      .orderBy('display_order');

    console.log(`✓ Found ${variantTypes.length} variant types\n`);

    if (variantTypes.length !== 4) {
      console.error(`✗ Expected 4 variant types, found ${variantTypes.length}`);
      process.exit(1);
    }

    // Verify each variant type
    console.log('=========================================');
    console.log('Verifying Individual Variant Types');
    console.log('=========================================\n');

    // 1. quality_tier
    console.log('1. quality_tier');
    console.log('-------------------');
    const qualityTier = variantTypes.find(vt => vt.name === 'quality_tier');
    if (!qualityTier) {
      console.error('✗ quality_tier not found');
      process.exit(1);
    }
    console.log(`   Display Name: ${qualityTier.display_name}`);
    console.log(`   Value Type: ${qualityTier.value_type}`);
    console.log(`   Min Value: ${qualityTier.min_value}`);
    console.log(`   Max Value: ${qualityTier.max_value}`);
    console.log(`   Display Order: ${qualityTier.display_order}`);
    
    if (qualityTier.value_type !== 'integer' || 
        parseFloat(qualityTier.min_value as any) !== 1 || 
        parseFloat(qualityTier.max_value as any) !== 5 || 
        qualityTier.display_order !== 0) {
      console.error('✗ quality_tier has incorrect configuration');
      process.exit(1);
    }
    console.log('   ✓ Configuration correct\n');

    // 2. quality_value
    console.log('2. quality_value');
    console.log('-------------------');
    const qualityValue = variantTypes.find(vt => vt.name === 'quality_value');
    if (!qualityValue) {
      console.error('✗ quality_value not found');
      process.exit(1);
    }
    console.log(`   Display Name: ${qualityValue.display_name}`);
    console.log(`   Value Type: ${qualityValue.value_type}`);
    console.log(`   Min Value: ${qualityValue.min_value}`);
    console.log(`   Max Value: ${qualityValue.max_value}`);
    console.log(`   Display Order: ${qualityValue.display_order}`);
    
    if (qualityValue.value_type !== 'decimal' || 
        parseFloat(qualityValue.min_value as any) !== 0 || 
        parseFloat(qualityValue.max_value as any) !== 100 || 
        qualityValue.display_order !== 1) {
      console.error('✗ quality_value has incorrect configuration');
      process.exit(1);
    }
    console.log('   ✓ Configuration correct\n');

    // 3. crafted_source
    console.log('3. crafted_source');
    console.log('-------------------');
    const craftedSource = variantTypes.find(vt => vt.name === 'crafted_source');
    if (!craftedSource) {
      console.error('✗ crafted_source not found');
      process.exit(1);
    }
    console.log(`   Display Name: ${craftedSource.display_name}`);
    console.log(`   Value Type: ${craftedSource.value_type}`);
    console.log(`   Allowed Values: ${craftedSource.allowed_values}`);
    console.log(`   Display Order: ${craftedSource.display_order}`);
    
    let allowedValues: string[] = [];
    try {
      // Handle both JSON string and already-parsed array
      if (typeof craftedSource.allowed_values === 'string') {
        allowedValues = JSON.parse(craftedSource.allowed_values);
      } else if (Array.isArray(craftedSource.allowed_values)) {
        allowedValues = craftedSource.allowed_values;
      } else if (craftedSource.allowed_values) {
        // If it's an object (JSONB), convert to array
        allowedValues = Object.values(craftedSource.allowed_values);
      }
    } catch (e) {
      console.error('✗ Failed to parse allowed_values:', e);
      process.exit(1);
    }
    
    if (craftedSource.value_type !== 'enum' || 
        !Array.isArray(allowedValues) ||
        allowedValues.length !== 4 ||
        !allowedValues.includes('crafted') ||
        !allowedValues.includes('store') ||
        !allowedValues.includes('looted') ||
        !allowedValues.includes('unknown') ||
        craftedSource.display_order !== 2) {
      console.error('✗ crafted_source has incorrect configuration');
      console.error('   Allowed values:', allowedValues);
      process.exit(1);
    }
    console.log('   ✓ Configuration correct\n');

    // 4. blueprint_tier
    console.log('4. blueprint_tier');
    console.log('-------------------');
    const blueprintTier = variantTypes.find(vt => vt.name === 'blueprint_tier');
    if (!blueprintTier) {
      console.error('✗ blueprint_tier not found');
      process.exit(1);
    }
    console.log(`   Display Name: ${blueprintTier.display_name}`);
    console.log(`   Value Type: ${blueprintTier.value_type}`);
    console.log(`   Min Value: ${blueprintTier.min_value}`);
    console.log(`   Max Value: ${blueprintTier.max_value}`);
    console.log(`   Display Order: ${blueprintTier.display_order}`);
    
    if (blueprintTier.value_type !== 'integer' || 
        parseFloat(blueprintTier.min_value as any) !== 1 || 
        parseFloat(blueprintTier.max_value as any) !== 5 || 
        blueprintTier.display_order !== 3) {
      console.error('✗ blueprint_tier has incorrect configuration');
      process.exit(1);
    }
    console.log('   ✓ Configuration correct\n');

    // Verify display order is sequential
    console.log('=========================================');
    console.log('Display Order Verification');
    console.log('=========================================');
    const expectedOrder = ['quality_tier', 'quality_value', 'crafted_source', 'blueprint_tier'];
    for (let i = 0; i < variantTypes.length; i++) {
      if (variantTypes[i].name !== expectedOrder[i] || variantTypes[i].display_order !== i) {
        console.error(`✗ Display order incorrect at position ${i}`);
        process.exit(1);
      }
      console.log(`${i}. ${variantTypes[i].name} ✓`);
    }
    console.log('✓ Display order is sequential and correct\n');

    // Verify index exists
    console.log('=========================================');
    console.log('Index Verification');
    console.log('=========================================');
    const indexes = await db.raw(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'variant_types'
        AND indexname = 'idx_variant_types_searchable'
    `);
    
    if (indexes.rows.length === 0) {
      console.error('✗ idx_variant_types_searchable index not found');
      process.exit(1);
    }
    console.log('✓ idx_variant_types_searchable index exists');
    console.log(`   Definition: ${indexes.rows[0].indexdef}\n`);

    // Test variant creation
    console.log('=========================================');
    console.log('Testing Variant Creation');
    console.log('=========================================');
    
    // Get a test game item
    const gameItems = await db('game_items').select('id').limit(1);
    if (gameItems.length === 0) {
      console.warn('⚠ No game items found, skipping variant creation test');
    } else {
      const testGameItemId = gameItems[0].id;
      
      // Create a test variant
      const [testVariant] = await db('item_variants').insert({
        game_item_id: testGameItemId,
        attributes: JSON.stringify({
          quality_tier: 5,
          quality_value: 98.5,
          crafted_source: 'crafted',
          blueprint_tier: 4
        }),
        display_name: 'VERIFICATION_TEST Tier 5 (98.5%) - Crafted - BP T4',
        short_name: 'T5 C BP4'
      }).returning('*');
      
      console.log('✓ Successfully created test variant with all 4 variant types');
      console.log(`   Variant ID: ${testVariant.variant_id}`);
      console.log(`   Attributes: ${testVariant.attributes}`);
      
      // Clean up test variant
      await db('item_variants').where('variant_id', testVariant.variant_id).del();
      console.log('✓ Test variant cleaned up\n');
    }

    // Summary
    console.log('=========================================');
    console.log('Verification Summary');
    console.log('=========================================');
    console.log('✓ variant_types table exists');
    console.log('✓ All 4 variant types present');
    console.log('✓ quality_tier configured correctly (integer, 1-5, order 0)');
    console.log('✓ quality_value configured correctly (decimal, 0-100, order 1)');
    console.log('✓ crafted_source configured correctly (enum, 4 values, order 2)');
    console.log('✓ blueprint_tier configured correctly (integer, 1-5, order 3)');
    console.log('✓ Display order is sequential');
    console.log('✓ idx_variant_types_searchable index exists');
    console.log('\n✅ All verifications passed! Task 1.6 complete.\n');

  } catch (error) {
    console.error('\n❌ Verification failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run verification
verifyVariantTypes();
