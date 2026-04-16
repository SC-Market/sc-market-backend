import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create buy_orders_v2 table for V2 buy orders with quality tier requirements
  await knex.schema.createTable("buy_orders_v2", (table) => {
    table.uuid("buy_order_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    
    // Foreign keys
    table
      .uuid("buyer_id")
      .notNullable()
      .references("user_id")
      .inTable("accounts")
      .onDelete("CASCADE")
    table
      .uuid("game_item_id")
      .notNullable()
      // Note: game_item_id references the V1 `game_items` table, but the primary key
      // column name differs across deployments (commonly `id`). We intentionally avoid
      // a FK here, matching other V2 core tables.
      .comment("References V1 game_items primary key (no FK constraint)")

    // Quality requirements
    table
      .integer("quality_tier_min")
      .notNullable()
      .checkBetween([1, 5])
      .comment("Minimum quality tier (1-5)")
    table
      .integer("quality_tier_max")
      .notNullable()
      .checkBetween([1, 5])
      .comment("Maximum quality tier (1-5)")

    // CHECK constraint: quality_tier_min <= quality_tier_max
    table.check("quality_tier_min <= quality_tier_max", [], "chk_buy_orders_v2_quality_tier_range")

    // Optional attribute requirements
    table.jsonb("desired_attributes").comment('Optional JSONB: {"crafted_source": "crafted", "blueprint_tier": 3}')

    // Price range
    table.bigInteger("price_min")
    table.bigInteger("price_max")

    // CHECK constraint: price_min <= price_max (when both are not null)
    table.check(
      "price_min IS NULL OR price_max IS NULL OR price_min <= price_max",
      [],
      "chk_buy_orders_v2_price_range"
    )

    // Quantity
    table.integer("quantity_desired").notNullable().checkPositive()

    // Status
    table
      .enum("status", ["active", "fulfilled", "cancelled", "expired"], {
        useNative: true,
        enumName: "buy_order_status_enum",
      })
      .notNullable()
      .defaultTo("active")
      .comment("active, fulfilled, cancelled, expired")

    // Timestamps
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())
    table
      .timestamp("expires_at")
      .notNullable()
      .defaultTo(knex.raw("NOW() + INTERVAL '30 days'"))

    // Indexes for performance
    table.index("buyer_id", "idx_buy_orders_v2_buyer")
    table.index("game_item_id", "idx_buy_orders_v2_game_item")
    table.index(["quality_tier_min", "quality_tier_max"], "idx_buy_orders_v2_quality")
    table.index("status", "idx_buy_orders_v2_status", {
      predicate: knex.whereRaw("status = 'active'"),
    })

    // Table comment
    table.comment("V2 buy orders with quality tier requirements")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("buy_orders_v2")
  await knex.raw("DROP TYPE IF EXISTS buy_order_status_enum CASCADE")
}
