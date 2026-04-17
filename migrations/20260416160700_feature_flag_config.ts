import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("feature_flag_config"))) {
    await knex.schema.createTable("feature_flag_config", (table) => {
      table.string("flag_name", 100).primary();
      table.boolean("enabled").notNullable().defaultTo(false);
      table.string("default_version", 10).notNullable().defaultTo("V1");
      table.integer("rollout_percentage").notNullable().defaultTo(0);
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    });

    await knex("feature_flag_config").insert({
      flag_name: "market_version",
      enabled: false,
      default_version: "V1",
      rollout_percentage: 0,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feature_flag_config");
}
