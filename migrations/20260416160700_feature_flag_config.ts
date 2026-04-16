import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("feature_flag_config", (table) => {
    table.string("key", 50).primary()
    table.string("default_version", 10).notNullable().defaultTo("V1")
    table.integer("rollout_percentage").notNullable().defaultTo(0)
    table.boolean("enabled").notNullable().defaultTo(true)
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now())
  })

  // Seed the initial config row
  await knex("feature_flag_config").insert({
    key: "market_version",
    default_version: "V1",
    rollout_percentage: 0,
    enabled: true,
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("feature_flag_config")
}
