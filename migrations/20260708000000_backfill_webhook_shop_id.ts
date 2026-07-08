import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Backfill shop_id on existing contractor-level webhooks
  await knex.raw(`
    UPDATE notification_webhooks nw
    SET shop_id = s.shop_id
    FROM shops s
    WHERE nw.contractor_id IS NOT NULL
      AND s.owner_contractor_id = nw.contractor_id
      AND s.status = 'active'
      AND nw.shop_id IS NULL
  `)

  // Also backfill user-level webhooks to their personal shop
  await knex.raw(`
    UPDATE notification_webhooks nw
    SET shop_id = s.shop_id
    FROM shops s
    WHERE nw.user_id IS NOT NULL
      AND nw.contractor_id IS NULL
      AND s.owner_user_id = nw.user_id
      AND s.status = 'active'
      AND nw.shop_id IS NULL
  `)
}

export async function down(_knex: Knex): Promise<void> {
  // No-op
}
