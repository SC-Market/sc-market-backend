import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("listing_views_v2", (table) => {
    table.uuid("view_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("listing_id").notNullable().references("listing_id").inTable("listings").onDelete("CASCADE")
    table.uuid("viewer_id").nullable().references("user_id").inTable("accounts").onDelete("SET NULL")
    table.timestamp("viewed_at").notNullable().defaultTo(knex.fn.now())
    table.index(["listing_id"], "idx_listing_views_v2_listing")
    table.index(["viewer_id"], "idx_listing_views_v2_viewer")
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("listing_views_v2")
}
