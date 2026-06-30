import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("shop_blocklist", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
    table.uuid("shop_id").notNullable().references("shop_id").inTable("shops").onDelete("CASCADE")
    table.uuid("blocked_user_id").notNullable().references("user_id").inTable("accounts").onDelete("CASCADE")
    table.text("reason").notNullable().defaultTo("")
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.unique(["shop_id", "blocked_user_id"])
  })

  await knex.raw(`CREATE INDEX idx_shop_blocklist_shop ON shop_blocklist(shop_id)`)
  await knex.raw(`CREATE INDEX idx_shop_blocklist_blocked ON shop_blocklist(blocked_user_id)`)

  // Backfill: for contractor blocklists, copy to all shops owned by that contractor
  await knex.raw(`
    INSERT INTO shop_blocklist (shop_id, blocked_user_id, reason, created_at)
    SELECT s.shop_id, b.blocked_id, b.reason, b.created_at
    FROM blocklist b
    JOIN shops s ON s.owner_contractor_id = b.blocker_contractor_id
    WHERE b.blocker_type = 'contractor'
      AND b.blocker_contractor_id IS NOT NULL
      AND s.status = 'active'
    ON CONFLICT (shop_id, blocked_user_id) DO NOTHING
  `)

  // Backfill: for user blocklists, copy to all shops owned by that user
  await knex.raw(`
    INSERT INTO shop_blocklist (shop_id, blocked_user_id, reason, created_at)
    SELECT s.shop_id, b.blocked_id, b.reason, b.created_at
    FROM blocklist b
    JOIN shops s ON s.owner_user_id = b.blocker_user_id
    WHERE b.blocker_type = 'user'
      AND b.blocker_user_id IS NOT NULL
      AND s.status = 'active'
    ON CONFLICT (shop_id, blocked_user_id) DO NOTHING
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_shop_blocklist_shop`)
  await knex.raw(`DROP INDEX IF EXISTS idx_shop_blocklist_blocked`)
  await knex.schema.dropTableIfExists("shop_blocklist")
}
