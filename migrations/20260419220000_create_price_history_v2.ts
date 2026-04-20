import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("price_history_v2"))) {
    await knex.schema.createTable("price_history_v2", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.uuid("game_item_id").notNullable();
      table.uuid("variant_id").notNullable();
      table.bigInteger("price").notNullable();
      table.integer("quality_tier");
      table.uuid("listing_id");
      table.string("event_type", 50).notNullable(); // listing_created, price_updated, sale_completed
      table.timestamp("recorded_at").notNullable().defaultTo(knex.fn.now());

      table.index("game_item_id", "idx_price_history_v2_game_item");
      table.index("variant_id", "idx_price_history_v2_variant");
      table.index("recorded_at", "idx_price_history_v2_recorded_at");
      table.index(["game_item_id", "quality_tier", "recorded_at"], "idx_price_history_v2_item_tier_time");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("price_history_v2");
}
