import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("notification_webhooks", (table) => {
    table
      .uuid("shop_id")
      .nullable()
      .references("shop_id")
      .inTable("shops")
      .onDelete("CASCADE")
  })

  await knex.raw(`
    CREATE INDEX idx_notification_webhooks_shop
    ON notification_webhooks(shop_id)
    WHERE shop_id IS NOT NULL
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_notification_webhooks_shop`)

  await knex.schema.alterTable("notification_webhooks", (table) => {
    table.dropColumn("shop_id")
  })
}
