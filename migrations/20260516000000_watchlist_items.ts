import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("watchlist_items", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("user_id").notNullable().references("user_id").inTable("accounts").onDelete("CASCADE")
    table.string("query", 500).notNullable()
    table.integer("max_price").notNullable()
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now())
    table.timestamp("last_notified_at").nullable()
    table.index(["user_id"])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("watchlist_items")
}
