import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("scmdb_sync_tokens", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("user_id").notNullable().references("user_id").inTable("accounts").onDelete("CASCADE")
    table.string("token", 64).notNullable().unique()
    table.boolean("is_active").notNullable().defaultTo(true)
    table.timestamp("last_event_at", { useTz: true }).nullable()
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  await knex.raw(`CREATE UNIQUE INDEX idx_scmdb_tokens_active_user ON scmdb_sync_tokens(user_id) WHERE is_active = true`)

  await knex.schema.createTable("scmdb_events", (table) => {
    table.string("event_id", 255).primary()
    table.uuid("user_id").notNullable().references("user_id").inTable("accounts").onDelete("CASCADE")
    table.string("event_type", 50).notNullable()
    table.timestamp("received_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  await knex.raw(`CREATE INDEX idx_scmdb_events_user_time ON scmdb_events(user_id, received_at DESC)`)

  await knex.schema.createTable("scmdb_unmatched_tags", (table) => {
    table.string("tag", 500).primary()
    table.timestamp("first_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.integer("occurrence_count").notNullable().defaultTo(1)
    table.timestamp("resolved_at", { useTz: true }).nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_scmdb_tokens_active_user`)
  await knex.raw(`DROP INDEX IF EXISTS idx_scmdb_events_user_time`)
  await knex.schema.dropTableIfExists("scmdb_unmatched_tags")
  await knex.schema.dropTableIfExists("scmdb_events")
  await knex.schema.dropTableIfExists("scmdb_sync_tokens")
}
