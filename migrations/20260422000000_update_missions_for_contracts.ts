import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("missions", (table) => {
    // Contract-specific fields
    table.string("template_name", 200).nullable()
    table.string("title_loc_key", 300).nullable()
    table.string("min_standing", 200).nullable()
    table.string("max_standing", 200).nullable()
    table.boolean("available_in_prison").defaultTo(false)
    table.boolean("has_blueprint_rewards").defaultTo(false)
    table.integer("variant_count").nullable()

    // Drop unique constraint on mission_code (contracts can have same code across versions)
    // and add composite unique on (version_id, mission_code)
    table.dropUnique(["mission_code"])
    table.unique(["version_id", "mission_code"])
  })

  // Add index for blueprint reward filtering
  await knex.raw(
    "CREATE INDEX idx_missions_blueprint_rewards ON missions (has_blueprint_rewards) WHERE has_blueprint_rewards = true",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_missions_blueprint_rewards")
  await knex.schema.alterTable("missions", (table) => {
    table.dropUnique(["version_id", "mission_code"])
    table.unique(["mission_code"])
    table.dropColumn("template_name")
    table.dropColumn("title_loc_key")
    table.dropColumn("min_standing")
    table.dropColumn("max_standing")
    table.dropColumn("available_in_prison")
    table.dropColumn("has_blueprint_rewards")
    table.dropColumn("variant_count")
  })
}
