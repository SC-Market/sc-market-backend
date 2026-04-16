import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Create price_history_v2 table for time-series price tracking by quality tier
  await knex.schema.createTable("price_history_v2", (table) => {
    table.uuid("price_history_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    
    // Foreign keys
    table
      .uuid("game_item_id")
      .notNullable()
      // Note: game_item_id references the V1 `game_items` table, but the primary key
      // column name differs across deployments (commonly `id`). We intentionally avoid
      // a FK here, matching other V2 core tables.
      .comment("References V1 game_items primary key (no FK constraint)")
    table
      .uuid("variant_id")
      .references("variant_id")
      .inTable("item_variants")
      .onDelete("SET NULL")

    // Price data
    table.bigInteger("price").notNullable()
    table.integer("quality_tier").notNullable().checkBetween([1, 5])

    // Source tracking
    table
      .enum("source", ["listing_created", "listing_updated", "order_completed"], {
        useNative: true,
        enumName: "price_history_source_enum",
      })
      .notNullable()
      .comment("Event that triggered price recording")
    table.uuid("source_id").comment("listing_id or order_id")

    table.timestamp("recorded_at").notNullable().defaultTo(knex.fn.now())

    // Indexes for analytics queries
    table.index(
      ["game_item_id", "quality_tier", "recorded_at"],
      "idx_price_history_v2_game_item_tier_time"
    )
    table.index(["variant_id", "recorded_at"], "idx_price_history_v2_variant_time")
    table.index("recorded_at", "idx_price_history_v2_recorded")

    // Table comment
    table.comment("Time-series price data by quality tier for analytics")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("price_history_v2")
  await knex.raw("DROP TYPE IF EXISTS price_history_source_enum CASCADE")
}
