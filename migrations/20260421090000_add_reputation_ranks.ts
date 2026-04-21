import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("reputation_ranks", (table) => {
    table.uuid("rank_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.string("scope_code", 200).notNullable()
    table.string("scope_display_name", 200).notNullable()
    table.integer("ceiling").notNullable()
    table.string("standing_code", 200).notNullable()
    table.string("standing_display_name", 200).notNullable()
    table.integer("threshold").notNullable()
    table.integer("rank_index").notNullable()
    table.unique(["scope_code", "standing_code"])
    table.index("scope_code")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("reputation_ranks")
}
