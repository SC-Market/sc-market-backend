import type { Knex } from "knex";

/**
 * Stub migration for previously applied feature flag config migration
 * This file was deleted but the migration was already run in the database
 * This stub allows the migration system to continue functioning
 */

export async function up(knex: Knex): Promise<void> {
  // Already applied - no-op
  // Original migration updated feature flag configuration
}

export async function down(knex: Knex): Promise<void> {
  // Not reversible - no-op
}
