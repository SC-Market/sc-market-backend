import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create cart_items_v2 table for V2 shopping cart with variant support
  await knex.schema.createTable("cart_items_v2", (table) => {
    table.uuid("cart_item_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    
    // Foreign keys
    table
      .uuid("user_id")
      .notNullable()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    table
      .uuid("listing_id")
      .notNullable()
      .references("listing_id")
      .inTable("listings")
      .onDelete("CASCADE")
    table
      .uuid("item_id")
      .notNullable()
      .references("item_id")
      .inTable("listing_items")
      .onDelete("CASCADE")
    table
      .uuid("variant_id")
      .notNullable()
      .references("variant_id")
      .inTable("item_variants")
      .onDelete("CASCADE")

    // Cart details
    table.integer("quantity").notNullable().checkPositive()
    table.bigInteger("price_per_unit").notNullable().comment("Price snapshot at add-to-cart time (may become stale)")

    // Price staleness tracking
    table.timestamp("price_updated_at").notNullable().defaultTo(knex.fn.now())

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())

    // Unique constraint - one cart item per user/listing/variant combination
    table.unique(["user_id", "listing_id", "variant_id"], {
      indexName: "uq_cart_items_v2_user_listing_variant",
    })

    // Indexes for performance
    table.index("user_id", "idx_cart_items_v2_user")
    table.index("listing_id", "idx_cart_items_v2_listing")
    table.index("variant_id", "idx_cart_items_v2_variant")

    // Table comment
    table.comment("V2 shopping cart with variant-specific selections")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("cart_items_v2")
}
