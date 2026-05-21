import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn("buy_orders_v2", "quantity_fulfilled")
  if (!hasCol) {
    await knex.schema.alterTable("buy_orders_v2", (table) => {
      table.integer("quantity_fulfilled").notNullable().defaultTo(0)
    })
  }

  if (!(await knex.schema.hasTable("buy_order_fulfillments"))) {
    await knex.schema.createTable("buy_order_fulfillments", (table) => {
      table.uuid("fulfillment_id").primary().defaultTo(knex.raw("gen_random_uuid()"))
      table
        .uuid("buy_order_id")
        .notNullable()
        .references("buy_order_id")
        .inTable("buy_orders_v2")
        .onDelete("CASCADE")
      table.uuid("seller_id").notNullable()
      table.uuid("order_id").notNullable()
      table.uuid("listing_id").notNullable()
      table.uuid("variant_id").notNullable()
      table.integer("quantity").notNullable()
      table.bigInteger("price_per_unit").notNullable()
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })

    await knex.raw(
      "CREATE INDEX IF NOT EXISTS idx_bo_fulfillments_order ON buy_order_fulfillments(buy_order_id)",
    )
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("buy_order_fulfillments")
  const hasCol = await knex.schema.hasColumn("buy_orders_v2", "quantity_fulfilled")
  if (hasCol) {
    await knex.schema.alterTable("buy_orders_v2", (table) => {
      table.dropColumn("quantity_fulfilled")
    })
  }
}
