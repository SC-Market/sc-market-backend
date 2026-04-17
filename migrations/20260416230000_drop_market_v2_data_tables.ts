import type { Knex } from "knex";

/**
 * Stub migration for previously applied drop tables migration
 * This file was deleted but the migration was already run in the database
 * This stub allows the migration system to continue functioning
 */

export async function up(knex: Knex): Promise<void> {
  // Already applied - no-op
  // Original migration dropped old V2 data tables
}

export async function down(knex: Knex): Promise<void> {
  // Not reversible - no-op
}
