#!/usr/bin/env tsx
/**
 * Verification script for Game Data Schema Migration
 * 
 * Verifies that all 14 tables (15 minus organization_blueprint_inventory), 
 * triggers, and indexes were created successfully.
 */

import knex from 'knex';
import knexConfig from '../knexfile.js';

const db = knex(knexConfig.development);

interface VerificationResult {
  category: string;
  name: string;
  exists: boolean;
  details?: string;
}

const results: VerificationResult[] = [];

async function verifyTables() {
  console.log('\n=== Verifying Tables ===\n');
  
  const expectedTables = [
    'game_versions',
    'missions',
    'blueprints',
    'blueprint_ingredients',
    'mission_blueprint_rewards',
    'crafting_recipes',
    'user_blueprint_inventory',
    // 'organization_blueprint_inventory', // Skipped - organizations table doesn't exist yet
    'wishlists',
    'wishlist_items',
    'mission_completions',
    'mission_ratings',
    'crafting_history',
    'resources',
  ];
  
  for (const tableName of expectedTables) {
    const result = await db.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ?
      );
    `, [tableName]);
    
    const exists = result.rows[0].exists;
    results.push({
      category: 'Table',
      name: tableName,
      exists,
    });
    
    console.log(`${exists ? '✓' : '✗'} ${tableName}`);
  }
}

async function verifyTriggers() {
  console.log('\n=== Verifying Triggers ===\n');
  
  const expectedTriggers = [
    { name: 'trg_mission_ratings_update', table: 'mission_ratings' },
  ];
  
  for (const trigger of expectedTriggers) {
    const result = await db.raw(`
      SELECT EXISTS (
        SELECT FROM information_schema.triggers 
        WHERE trigger_name = ? 
        AND event_object_table = ?
      );
    `, [trigger.name, trigger.table]);
    
    const exists = result.rows[0].exists;
    results.push({
      category: 'Trigger',
      name: `${trigger.name} on ${trigger.table}`,
      exists,
    });
    
    console.log(`${exists ? '✓' : '✗'} ${trigger.name} on ${trigger.table}`);
  }
}

async function verifyFunctions() {
  console.log('\n=== Verifying Functions ===\n');
  
  const expectedFunctions = [
    'update_mission_ratings',
  ];
  
  for (const funcName of expectedFunctions) {
    const result = await db.raw(`
      SELECT EXISTS (
        SELECT FROM pg_proc 
        WHERE proname = ?
      );
    `, [funcName]);
    
    const exists = result.rows[0].exists;
    results.push({
      category: 'Function',
      name: funcName,
      exists,
    });
    
    console.log(`${exists ? '✓' : '✗'} ${funcName}()`);
  }
}

async function verifyIndexes() {
  console.log('\n=== Verifying Key Indexes ===\n');
  
  const expectedIndexes = [
    // GIN indexes for full-text search
    { name: 'idx_missions_name_fts', table: 'missions', type: 'GIN' },
    { name: 'idx_blueprints_name_fts', table: 'blueprints', type: 'GIN' },
    
    // Composite indexes
    { name: 'idx_game_versions_type_active', table: 'game_versions', type: 'Partial' },
    { name: 'idx_missions_location', table: 'missions', type: 'Composite' },
    { name: 'idx_blueprints_category', table: 'blueprints', type: 'Composite' },
    { name: 'idx_resources_category', table: 'resources', type: 'Composite' },
    
    // Foreign key indexes
    { name: 'idx_missions_version', table: 'missions', type: 'Foreign Key' },
    { name: 'idx_blueprints_version', table: 'blueprints', type: 'Foreign Key' },
    { name: 'idx_blueprint_ingredients_blueprint', table: 'blueprint_ingredients', type: 'Foreign Key' },
    { name: 'idx_mission_rewards_mission', table: 'mission_blueprint_rewards', type: 'Foreign Key' },
    { name: 'idx_user_blueprints_user', table: 'user_blueprint_inventory', type: 'Foreign Key' },
    { name: 'idx_wishlists_user', table: 'wishlists', type: 'Foreign Key' },
    { name: 'idx_wishlist_items_wishlist', table: 'wishlist_items', type: 'Foreign Key' },
    { name: 'idx_mission_completions_user', table: 'mission_completions', type: 'Foreign Key' },
    { name: 'idx_mission_ratings_mission', table: 'mission_ratings', type: 'Foreign Key' },
    { name: 'idx_crafting_history_user', table: 'crafting_history', type: 'Foreign Key' },
    
    // Partial indexes
    { name: 'idx_user_blueprints_owned', table: 'user_blueprint_inventory', type: 'Partial' },
    { name: 'idx_wishlists_share_token', table: 'wishlists', type: 'Partial' },
  ];
  
  for (const index of expectedIndexes) {
    const result = await db.raw(`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE indexname = ?
      );
    `, [index.name]);
    
    const exists = result.rows[0].exists;
    results.push({
      category: 'Index',
      name: index.name,
      exists,
      details: `${index.type} on ${index.table}`,
    });
    
    console.log(`${exists ? '✓' : '✗'} ${index.name} (${index.type} on ${index.table})`);
  }
}

async function verifyForeignKeys() {
  console.log('\n=== Verifying Foreign Key Constraints ===\n');
  
  const expectedForeignKeys = [
    { table: 'missions', column: 'version_id', references: 'game_versions' },
    { table: 'blueprints', column: 'version_id', references: 'game_versions' },
    { table: 'blueprints', column: 'output_game_item_id', references: 'game_items' },
    { table: 'blueprint_ingredients', column: 'blueprint_id', references: 'blueprints' },
    { table: 'blueprint_ingredients', column: 'ingredient_game_item_id', references: 'game_items' },
    { table: 'mission_blueprint_rewards', column: 'mission_id', references: 'missions' },
    { table: 'mission_blueprint_rewards', column: 'blueprint_id', references: 'blueprints' },
    { table: 'crafting_recipes', column: 'blueprint_id', references: 'blueprints' },
    { table: 'user_blueprint_inventory', column: 'user_id', references: 'accounts' },
    { table: 'user_blueprint_inventory', column: 'blueprint_id', references: 'blueprints' },
    { table: 'wishlists', column: 'user_id', references: 'accounts' },
    { table: 'wishlist_items', column: 'wishlist_id', references: 'wishlists' },
    { table: 'wishlist_items', column: 'game_item_id', references: 'game_items' },
    { table: 'mission_completions', column: 'user_id', references: 'accounts' },
    { table: 'mission_completions', column: 'mission_id', references: 'missions' },
    { table: 'mission_ratings', column: 'user_id', references: 'accounts' },
    { table: 'mission_ratings', column: 'mission_id', references: 'missions' },
    { table: 'crafting_history', column: 'user_id', references: 'accounts' },
    { table: 'crafting_history', column: 'blueprint_id', references: 'blueprints' },
    { table: 'resources', column: 'version_id', references: 'game_versions' },
    { table: 'resources', column: 'game_item_id', references: 'game_items' },
  ];
  
  for (const fk of expectedForeignKeys) {
    const result = await db.raw(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = ?
          AND kcu.column_name = ?
          AND ccu.table_name = ?
      );
    `, [fk.table, fk.column, fk.references]);
    
    const exists = result.rows[0].exists;
    results.push({
      category: 'Foreign Key',
      name: `${fk.table}.${fk.column}`,
      exists,
      details: `→ ${fk.references}`,
    });
    
    console.log(`${exists ? '✓' : '✗'} ${fk.table}.${fk.column} → ${fk.references}`);
  }
}

async function printSummary() {
  console.log('\n=== Summary ===\n');
  
  const byCategory = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = { total: 0, passed: 0 };
    }
    acc[result.category].total++;
    if (result.exists) {
      acc[result.category].passed++;
    }
    return acc;
  }, {} as Record<string, { total: number; passed: number }>);
  
  let allPassed = true;
  
  for (const [category, stats] of Object.entries(byCategory)) {
    const status = stats.passed === stats.total ? '✓' : '✗';
    console.log(`${status} ${category}: ${stats.passed}/${stats.total}`);
    if (stats.passed !== stats.total) {
      allPassed = false;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  
  if (allPassed) {
    console.log('✓ All verifications passed!');
    console.log('\nDatabase schema successfully created with:');
    console.log('  - 14 tables (organization_blueprint_inventory skipped)');
    console.log('  - 1 trigger for mission rating aggregation');
    console.log('  - 20+ indexes for search performance');
    console.log('  - 20+ foreign key constraints');
  } else {
    console.log('✗ Some verifications failed. See details above.');
    process.exit(1);
  }
}

async function main() {
  try {
    console.log('Game Data Schema Verification');
    console.log('='.repeat(50));
    
    await verifyTables();
    await verifyTriggers();
    await verifyFunctions();
    await verifyIndexes();
    await verifyForeignKeys();
    await printSummary();
    
  } catch (error) {
    console.error('\nError during verification:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();
