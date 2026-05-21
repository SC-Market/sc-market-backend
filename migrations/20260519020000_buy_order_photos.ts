import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("buy_order_photos", (table) => {
    table.uuid("photo_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table
      .uuid("buy_order_id")
      .notNullable()
      .references("buy_order_id")
      .inTable("buy_orders_v2")
      .onDelete("CASCADE")
    table
      .uuid("resource_id")
      .notNullable()
      .references("resource_id")
      .inTable("image_resources")
      .onDelete("CASCADE")
    table.integer("display_order").notNullable().defaultTo(0)
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
  })

  await knex.raw(
    "CREATE INDEX idx_buy_order_photos_order ON buy_order_photos(buy_order_id, display_order)",
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("buy_order_photos")
}
