import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("game_events", (table) => {
    table.uuid("event_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("version_id").notNullable().references("version_id").inTable("game_versions").onDelete("CASCADE")
    table.string("event_code", 200).notNullable()
    table.string("event_name", 200) // friendly name if available
    table.unique(["version_id", "event_code"])
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
  })

  await knex.schema.createTable("mission_events", (table) => {
    table.uuid("mission_id").notNullable().references("mission_id").inTable("missions").onDelete("CASCADE")
    table.uuid("event_id").notNullable().references("event_id").inTable("game_events").onDelete("CASCADE")
    table.primary(["mission_id", "event_id"])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("mission_events")
  await knex.schema.dropTableIfExists("game_events")
}
