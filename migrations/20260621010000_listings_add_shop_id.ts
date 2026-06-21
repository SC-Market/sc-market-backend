import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("listings", (table) => {
    table
      .uuid("shop_id")
      .nullable()
      .references("shop_id")
      .inTable("shops")
      .onDelete("SET NULL")
  })

  await knex.raw(`CREATE INDEX idx_listings_shop_id ON listings(shop_id) WHERE shop_id IS NOT NULL`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_listings_shop_id`)
  await knex.schema.alterTable("listings", (table) => {
    table.dropColumn("shop_id")
  })
}
