import type { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Add shop_id to orders
  await knex.schema.alterTable("orders", (table) => {
    table
      .uuid("shop_id")
      .nullable()
      .references("shop_id")
      .inTable("shops")
      .onDelete("SET NULL")
  })

  // Add shop_id to offer_sessions
  await knex.schema.alterTable("offer_sessions", (table) => {
    table
      .uuid("shop_id")
      .nullable()
      .references("shop_id")
      .inTable("shops")
      .onDelete("SET NULL")
  })

  // Add shop_id to services
  await knex.schema.alterTable("services", (table) => {
    table
      .uuid("shop_id")
      .nullable()
      .references("shop_id")
      .inTable("shops")
      .onDelete("SET NULL")
  })

  // Backfill orders from contractor_id -> shop
  await knex.raw(`
    UPDATE orders o
    SET shop_id = s.shop_id
    FROM shops s
    WHERE o.contractor_id IS NOT NULL
      AND s.owner_contractor_id = o.contractor_id
      AND o.shop_id IS NULL
  `)

  // Backfill orders from assigned_id (user) -> shop (for user-to-user orders)
  await knex.raw(`
    UPDATE orders o
    SET shop_id = s.shop_id
    FROM shops s
    WHERE o.contractor_id IS NULL
      AND o.assigned_id IS NOT NULL
      AND s.owner_user_id = o.assigned_id
      AND o.shop_id IS NULL
  `)

  // Backfill offer_sessions from contractor_id -> shop
  await knex.raw(`
    UPDATE offer_sessions os
    SET shop_id = s.shop_id
    FROM shops s
    WHERE os.contractor_id IS NOT NULL
      AND s.owner_contractor_id = os.contractor_id
      AND os.shop_id IS NULL
  `)

  // Backfill offer_sessions from assigned_id -> shop
  await knex.raw(`
    UPDATE offer_sessions os
    SET shop_id = s.shop_id
    FROM shops s
    WHERE os.contractor_id IS NULL
      AND os.assigned_id IS NOT NULL
      AND s.owner_user_id = os.assigned_id
      AND os.shop_id IS NULL
  `)

  // Backfill services from contractor_id -> shop
  await knex.raw(`
    UPDATE services sv
    SET shop_id = s.shop_id
    FROM shops s
    WHERE sv.contractor_id IS NOT NULL
      AND s.owner_contractor_id = sv.contractor_id
      AND sv.shop_id IS NULL
  `)

  // Backfill services from user_id -> shop
  await knex.raw(`
    UPDATE services sv
    SET shop_id = s.shop_id
    FROM shops s
    WHERE sv.user_id IS NOT NULL
      AND s.owner_user_id = sv.user_id
      AND sv.shop_id IS NULL
  `)

  // Add indexes
  await knex.raw(`CREATE INDEX idx_orders_shop_id ON orders(shop_id) WHERE shop_id IS NOT NULL`)
  await knex.raw(`CREATE INDEX idx_offer_sessions_shop_id ON offer_sessions(shop_id) WHERE shop_id IS NOT NULL`)
  await knex.raw(`CREATE INDEX idx_services_shop_id ON services(shop_id) WHERE shop_id IS NOT NULL`)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_orders_shop_id`)
  await knex.raw(`DROP INDEX IF EXISTS idx_offer_sessions_shop_id`)
  await knex.raw(`DROP INDEX IF EXISTS idx_services_shop_id`)

  await knex.schema.alterTable("services", (table) => {
    table.dropColumn("shop_id")
  })
  await knex.schema.alterTable("offer_sessions", (table) => {
    table.dropColumn("shop_id")
  })
  await knex.schema.alterTable("orders", (table) => {
    table.dropColumn("shop_id")
  })
}
