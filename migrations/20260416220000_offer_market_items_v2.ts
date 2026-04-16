import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create offer_market_items_v2 table to track variant info for V2 offers
  await knex.schema.createTable("offer_market_items_v2", (table) => {
    table.uuid("offer_item_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    
    // Foreign keys
    table
      .uuid("offer_id")
      .notNullable()
      .references("id")
      .inTable("order_offers")
      .onDelete("CASCADE")
    table
      .uuid("listing_id")
      .notNullable()
      .references("listing_id")
      .inTable("listings")
    table
      .uuid("variant_id")
      .notNullable()
      .references("variant_id")
      .inTable("item_variants")

    // Quantity for this specific variant
    table.integer("quantity").notNullable().checkPositive()

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())

    // Indexes for performance
    table.index("offer_id", "idx_offer_items_v2_offer")
    table.index("listing_id", "idx_offer_items_v2_listing")
    table.index("variant_id", "idx_offer_items_v2_variant")

    // Table comment
    table.comment("V2 offer line items with variant-specific information for tracking during offer negotiation")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("offer_market_items_v2")
}
