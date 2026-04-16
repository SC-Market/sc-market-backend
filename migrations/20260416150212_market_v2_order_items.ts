import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create order_market_items_v2 table for V2 order line items with variant support
  await knex.schema.createTable("order_market_items_v2", (table) => {
    table.uuid("order_item_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    
    // Foreign keys
    table
      .uuid("order_id")
      .notNullable()
      .references("order_id")
      .inTable("orders")
      .onDelete("CASCADE")
    table
      .uuid("listing_id")
      .notNullable()
      .references("listing_id")
      .inTable("listings")
    table
      .uuid("item_id")
      .notNullable()
      .references("item_id")
      .inTable("listing_items")
    table
      .uuid("variant_id")
      .notNullable()
      .references("variant_id")
      .inTable("item_variants")

    // Order details
    table.integer("quantity").notNullable().checkPositive()
    table.bigInteger("price_per_unit").notNullable().comment("Price snapshot at purchase time (immutable)")

    // Fulfillment tracking
    table
      .enum("fulfillment_status", ["pending", "fulfilled", "cancelled"], {
        useNative: true,
        enumName: "fulfillment_status_enum",
      })
      .notNullable()
      .defaultTo("pending")

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())

    // Indexes for performance
    table.index("order_id", "idx_order_items_v2_order")
    table.index("listing_id", "idx_order_items_v2_listing")
    table.index("variant_id", "idx_order_items_v2_variant")

    // Table comment
    table.comment("V2 order line items with variant-specific information")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("order_market_items_v2")
  await knex.raw("DROP TYPE IF EXISTS fulfillment_status_enum CASCADE")
}
