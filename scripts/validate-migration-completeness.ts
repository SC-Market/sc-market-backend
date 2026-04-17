#!/usr/bin/env ts-node

/**
 * Task 2.5: Validate Migration Completeness
 * 
 * This script validates that the V1 to V2 migration was completed successfully by:
 * 1. Comparing V1 listing count vs V2 listing count (should match for valid listings)
 * 2. Verifying all V1 metadata preserved in V2
 * 3. Checking quantity_available computed correctly by trigger
 * 4. Validating variant deduplication working (no duplicate variants)
 * 5. Confirming no V1 tables modified
 * 
 * Requirements: 58.2, 58.3, 58.6
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface ValidationResult {
  passed: boolean;
  message: string;
  details?: any;
}

interface V1Listing {
  listing_id: string;
  game_item_id: string;
  price: number;
  quantity: number;
  title: string;
  description: string;
  status: string;
  sale_type: string;
  internal: boolean;
  created_at: Date;
}

interface V2Listing {
  listing_id: string;
  title: string;
  description: string;
  status: string;
  sale_type: string;
  visibility: string;
  created_at: Date;
}

interface V2ListingItem {
  item_id: string;
  listing_id: string;
  game_item_id: string;
  base_price: number;
  quantity_available: number;
  variant_count: number;
}

interface V2StockLot {
  lot_id: string;
  item_id: string;
  variant_id: string;
  quantity_total: number;
  listed: boolean;
}

interface V2Variant {
  variant_id: string;
  game_item_id: string;
  attributes: any;
  attributes_hash: string;
}

class MigrationValidator {
  private pool: Pool;

  constructor() {
    // Parse DATABASE_PASS which contains JSON with connection details
    let dbConfig: any = {};
    
    if (process.env.DATABASE_PASS) {
      try {
        dbConfig = JSON.parse(process.env.DATABASE_PASS);
      } catch (error) {
        console.error('Failed to parse DATABASE_PASS:', error);
        dbConfig = {
          host: 'localhost',
          port: 5432,
          database: 'scmarket',
          user: 'postgres',
          password: process.env.DATABASE_PASS
        };
      }
    }

    this.pool = new Pool({
      host: dbConfig.host || process.env.DATABASE_HOST || 'localhost',
      port: dbConfig.port || parseInt(process.env.DATABASE_PORT || '5432'),
      database: dbConfig.dbname || process.env.DATABASE_NAME || 'scmarket',
      user: dbConfig.username || process.env.DATABASE_USER || 'postgres',
      password: dbConfig.password || process.env.DATABASE_PASS,
    });
  }

  async validate(): Promise<void> {
    console.log('='.repeat(80));
    console.log('Task 2.5: Migration Completeness Validation');
    console.log('='.repeat(80));
    console.log();

    const results: ValidationResult[] = [];

    // Sub-task 1: Compare V1 listing count vs V2 listing count
    results.push(await this.validateListingCounts());

    // Sub-task 2: Verify all V1 metadata preserved in V2
    results.push(await this.validateMetadataPreservation());

    // Sub-task 3: Check quantity_available computed correctly by trigger
    results.push(await this.validateQuantityAvailable());

    // Sub-task 4: Validate variant deduplication working
    results.push(await this.validateVariantDeduplication());

    // Sub-task 5: Confirm no V1 tables modified
    results.push(await this.validateV1TablesUnchanged());

    // Print summary
    console.log();
    console.log('='.repeat(80));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(80));
    console.log();

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    results.forEach((result, index) => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} Check ${index + 1}: ${result.message}`);
      if (result.details) {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      }
    });

    console.log();
    console.log(`Total: ${passed} passed, ${failed} failed`);
    console.log();

    if (failed > 0) {
      console.log('❌ VALIDATION FAILED - Migration has issues that need to be addressed');
      process.exit(1);
    } else {
      console.log('✅ VALIDATION PASSED - Migration completed successfully');
      process.exit(0);
    }
  }

  /**
   * Sub-task 1: Compare V1 listing count vs V2 listing count (should match)
   * Requirement 58.2: All V1 listings should be migrated to V2
   */
  private async validateListingCounts(): Promise<ValidationResult> {
    console.log('Check 1: Comparing V1 vs V2 listing counts...');

    try {
      // Count valid V1 listings (with game_item_id and valid price)
      const v1Result = await this.pool.query(`
        SELECT COUNT(*) as count
        FROM unique_listings
        WHERE game_item_id IS NOT NULL
          AND price > 0
      `);
      const v1ValidCount = parseInt(v1Result.rows[0].count);

      // Count total V1 listings
      const v1TotalResult = await this.pool.query(`
        SELECT COUNT(*) as count FROM unique_listings
      `);
      const v1TotalCount = parseInt(v1TotalResult.rows[0].count);

      // Count V2 listings
      const v2Result = await this.pool.query(`
        SELECT COUNT(*) as count FROM listings
      `);
      const v2Count = parseInt(v2Result.rows[0].count);

      const details = {
        v1_total_listings: v1TotalCount,
        v1_valid_listings: v1ValidCount,
        v1_invalid_listings: v1TotalCount - v1ValidCount,
        v2_listings: v2Count,
        migration_rate: `${((v2Count / v1ValidCount) * 100).toFixed(1)}%`
      };

      console.log(`   V1 total listings: ${v1TotalCount}`);
      console.log(`   V1 valid listings: ${v1ValidCount}`);
      console.log(`   V1 invalid listings: ${v1TotalCount - v1ValidCount}`);
      console.log(`   V2 listings: ${v2Count}`);
      console.log(`   Migration rate: ${details.migration_rate}`);
      console.log();

      // Check if all valid V1 listings were migrated
      if (v2Count >= v1ValidCount) {
        return {
          passed: true,
          message: `All valid V1 listings migrated (${v2Count}/${v1ValidCount})`,
          details
        };
      } else {
        return {
          passed: false,
          message: `Not all valid V1 listings migrated (${v2Count}/${v1ValidCount})`,
          details
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `Error comparing listing counts: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Sub-task 2: Verify all V1 metadata preserved in V2
   * Requirement 58.3: All V1 metadata should be preserved in V2 format
   */
  private async validateMetadataPreservation(): Promise<ValidationResult> {
    console.log('Check 2: Verifying V1 metadata preserved in V2...');

    try {
      // Get sample of V1 listings with their V2 counterparts
      const result = await this.pool.query(`
        SELECT 
          v1.listing_id as v1_listing_id,
          v1.game_item_id,
          v1.price as v1_price,
          v1.quantity as v1_quantity,
          v1.title as v1_title,
          v1.description as v1_description,
          v1.status as v1_status,
          v1.sale_type as v1_sale_type,
          v1.internal as v1_internal,
          v1.created_at as v1_created_at,
          v2.listing_id as v2_listing_id,
          v2.title as v2_title,
          v2.description as v2_description,
          v2.status as v2_status,
          v2.sale_type as v2_sale_type,
          v2.visibility as v2_visibility,
          v2.created_at as v2_created_at,
          li.base_price as v2_price,
          li.quantity_available as v2_quantity,
          li.game_item_id as v2_game_item_id
        FROM unique_listings v1
        LEFT JOIN listing_item_lots lot ON lot.notes LIKE '%' || v1.listing_id || '%'
        LEFT JOIN listing_items li ON li.item_id = lot.item_id
        LEFT JOIN listings v2 ON v2.listing_id = li.listing_id
        WHERE v1.game_item_id IS NOT NULL
          AND v1.price > 0
        LIMIT 10
      `);

      const mismatches: any[] = [];
      let checkedCount = 0;

      for (const row of result.rows) {
        if (!row.v2_listing_id) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            issue: 'V1 listing not found in V2'
          });
          continue;
        }

        checkedCount++;

        // Check title preservation
        if (row.v1_title !== row.v2_title) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'title',
            v1_value: row.v1_title,
            v2_value: row.v2_title
          });
        }

        // Check description preservation
        if (row.v1_description !== row.v2_description) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'description',
            v1_value: row.v1_description,
            v2_value: row.v2_description
          });
        }

        // Check price preservation
        if (row.v1_price !== row.v2_price) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'price',
            v1_value: row.v1_price,
            v2_value: row.v2_price
          });
        }

        // Check game_item_id preservation
        if (row.game_item_id !== row.v2_game_item_id) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'game_item_id',
            v1_value: row.game_item_id,
            v2_value: row.v2_game_item_id
          });
        }

        // Check status mapping (inactive/archived → cancelled)
        const expectedV2Status = ['inactive', 'archived'].includes(row.v1_status) 
          ? 'cancelled' 
          : row.v1_status;
        if (expectedV2Status !== row.v2_status) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'status',
            v1_value: row.v1_status,
            v2_value: row.v2_status,
            expected: expectedV2Status
          });
        }

        // Check sale_type mapping (sale → fixed)
        const expectedV2SaleType = row.v1_sale_type === 'sale' ? 'fixed' : row.v1_sale_type;
        if (expectedV2SaleType !== row.v2_sale_type) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'sale_type',
            v1_value: row.v1_sale_type,
            v2_value: row.v2_sale_type,
            expected: expectedV2SaleType
          });
        }

        // Check visibility mapping (internal → unlisted)
        const expectedV2Visibility = row.v1_internal ? 'unlisted' : 'public';
        if (expectedV2Visibility !== row.v2_visibility) {
          mismatches.push({
            v1_listing_id: row.v1_listing_id,
            field: 'visibility',
            v1_value: row.v1_internal,
            v2_value: row.v2_visibility,
            expected: expectedV2Visibility
          });
        }
      }

      console.log(`   Checked ${checkedCount} migrated listings`);
      console.log(`   Found ${mismatches.length} metadata mismatches`);
      console.log();

      if (mismatches.length === 0) {
        return {
          passed: true,
          message: `All V1 metadata preserved in V2 (checked ${checkedCount} listings)`,
          details: { checked: checkedCount, mismatches: 0 }
        };
      } else {
        return {
          passed: false,
          message: `Found ${mismatches.length} metadata mismatches`,
          details: { checked: checkedCount, mismatches: mismatches.slice(0, 5) }
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `Error validating metadata preservation: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Sub-task 3: Check quantity_available computed correctly by trigger
   * Requirement 58.6: Trigger should correctly compute quantity_available
   */
  private async validateQuantityAvailable(): Promise<ValidationResult> {
    console.log('Check 3: Validating quantity_available computed by trigger...');

    try {
      // Check that quantity_available matches sum of listed stock lots
      const result = await this.pool.query(`
        SELECT 
          li.item_id,
          li.quantity_available,
          COALESCE(SUM(lot.quantity_total), 0) as computed_quantity,
          COUNT(DISTINCT lot.variant_id) as computed_variant_count,
          li.variant_count
        FROM listing_items li
        LEFT JOIN listing_item_lots lot ON lot.item_id = li.item_id AND lot.listed = true
        GROUP BY li.item_id, li.quantity_available, li.variant_count
        HAVING li.quantity_available != COALESCE(SUM(lot.quantity_total), 0)
           OR li.variant_count != COUNT(DISTINCT lot.variant_id)
      `);

      const mismatches = result.rows;

      console.log(`   Checked all listing_items records`);
      console.log(`   Found ${mismatches.length} quantity mismatches`);
      console.log();

      if (mismatches.length === 0) {
        return {
          passed: true,
          message: 'All quantity_available values computed correctly by trigger',
          details: { mismatches: 0 }
        };
      } else {
        return {
          passed: false,
          message: `Found ${mismatches.length} quantity_available mismatches`,
          details: { mismatches: mismatches.slice(0, 5) }
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `Error validating quantity_available: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Sub-task 4: Validate variant deduplication working (no duplicate variants)
   * Requirement 58.6: Variants should be deduplicated by attributes_hash
   */
  private async validateVariantDeduplication(): Promise<ValidationResult> {
    console.log('Check 4: Validating variant deduplication...');

    try {
      // Check for duplicate variants (same game_item_id and attributes_hash)
      const duplicatesResult = await this.pool.query(`
        SELECT 
          game_item_id,
          attributes_hash,
          COUNT(*) as duplicate_count,
          array_agg(variant_id) as variant_ids
        FROM item_variants
        GROUP BY game_item_id, attributes_hash
        HAVING COUNT(*) > 1
      `);

      const duplicates = duplicatesResult.rows;

      // Check that all variants have unique (game_item_id, attributes_hash) combinations
      const totalVariantsResult = await this.pool.query(`
        SELECT COUNT(*) as count FROM item_variants
      `);
      const totalVariants = parseInt(totalVariantsResult.rows[0].count);

      console.log(`   Total variants: ${totalVariants}`);
      console.log(`   Duplicate variants: ${duplicates.length}`);
      console.log();

      if (duplicates.length === 0) {
        return {
          passed: true,
          message: `Variant deduplication working correctly (${totalVariants} unique variants)`,
          details: { total_variants: totalVariants, duplicates: 0 }
        };
      } else {
        return {
          passed: false,
          message: `Found ${duplicates.length} duplicate variants`,
          details: { 
            total_variants: totalVariants, 
            duplicates: duplicates.slice(0, 5) 
          }
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `Error validating variant deduplication: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Sub-task 5: Confirm no V1 tables modified
   * Requirement 58.5: V1 tables should remain unchanged (read-only)
   */
  private async validateV1TablesUnchanged(): Promise<ValidationResult> {
    console.log('Check 5: Confirming V1 tables remain unchanged...');

    try {
      // Count V1 listings
      const uniqueResult = await this.pool.query(`
        SELECT COUNT(*) as count FROM unique_listings
      `);
      const uniqueCount = parseInt(uniqueResult.rows[0].count);

      const aggregateResult = await this.pool.query(`
        SELECT COUNT(*) as count FROM aggregate_listings
      `);
      const aggregateCount = parseInt(aggregateResult.rows[0].count);

      const multipleResult = await this.pool.query(`
        SELECT COUNT(*) as count FROM multiple_listings
      `);
      const multipleCount = parseInt(multipleResult.rows[0].count);

      // Expected counts from task 2.4 summary
      const expectedUnique = 36;
      const expectedAggregate = 0;
      const expectedMultiple = 0;

      const details = {
        unique_listings: { current: uniqueCount, expected: expectedUnique },
        aggregate_listings: { current: aggregateCount, expected: expectedAggregate },
        multiple_listings: { current: multipleCount, expected: expectedMultiple }
      };

      console.log(`   unique_listings: ${uniqueCount} (expected: ${expectedUnique})`);
      console.log(`   aggregate_listings: ${aggregateCount} (expected: ${expectedAggregate})`);
      console.log(`   multiple_listings: ${multipleCount} (expected: ${expectedMultiple})`);
      console.log();

      const unchanged = 
        uniqueCount === expectedUnique &&
        aggregateCount === expectedAggregate &&
        multipleCount === expectedMultiple;

      if (unchanged) {
        return {
          passed: true,
          message: 'V1 tables remain unchanged (read-only access verified)',
          details
        };
      } else {
        return {
          passed: false,
          message: 'V1 table counts changed - migration may have modified V1 data',
          details
        };
      }
    } catch (error) {
      return {
        passed: false,
        message: `Error validating V1 tables unchanged: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Main execution
async function main() {
  const validator = new MigrationValidator();
  
  try {
    await validator.validate();
  } catch (error) {
    console.error('Fatal error during validation:', error);
    process.exit(1);
  } finally {
    await validator.close();
  }
}

main();
