import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Re-backfill orders that still have null shop_id
  await knex.raw(`
    UPDATE orders o
    SET shop_id = s.shop_id
    FROM shops s
    WHERE o.contractor_id IS NOT NULL
      AND s.owner_contractor_id = o.contractor_id
      AND s.status = 'active'
      AND o.shop_id IS NULL
  `)

  await knex.raw(`
    UPDATE orders o
    SET shop_id = s.shop_id
    FROM shops s
    WHERE o.contractor_id IS NULL
      AND o.assigned_id IS NOT NULL
      AND s.owner_user_id = o.assigned_id
      AND s.status = 'active'
      AND o.shop_id IS NULL
  `)
}

export async function down(_knex: Knex): Promise<void> {
  // No-op
}
