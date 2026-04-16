import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Note: Most indexes are already created in the core tables migration
  // This migration adds any additional indexes needed for optimization

  // Index on stock_lots for efficient quantity computation
  // (item_id, listed) composite index for WHERE item_id = X AND listed = true queries
  await knex.schema.alterTable("stock_lots", (table) => {
    table.index(["item_id", "listed"], "idx_stock_lots_item_listed")
  })

  // Additional comment for clarity
  await knex.raw(`
    COMMENT ON INDEX idx_stock_lots_item_listed IS 
    'Composite index for efficient quantity computation queries filtering by item_id and listed status';
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop the additional indexes
  await knex.schema.alterTable("stock_lots", (table) => {
    table.dropIndex(["item_id", "listed"], "idx_stock_lots_item_listed")
  })
}
