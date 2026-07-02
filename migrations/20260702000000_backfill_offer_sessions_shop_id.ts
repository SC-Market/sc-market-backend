import { Knex } from "knex"

export async function up(knex: Knex): Promise<void> {
  // Backfill offer_sessions that still have null shop_id from contractor_id
  await knex.raw(`
    UPDATE offer_sessions os
    SET shop_id = s.shop_id
    FROM shops s
    WHERE os.contractor_id IS NOT NULL
      AND s.owner_contractor_id = os.contractor_id
      AND s.status = 'active'
      AND os.shop_id IS NULL
  `)

  // Backfill from assigned_id (personal shops)
  await knex.raw(`
    UPDATE offer_sessions os
    SET shop_id = s.shop_id
    FROM shops s
    WHERE os.contractor_id IS NULL
      AND os.assigned_id IS NOT NULL
      AND s.owner_user_id = os.assigned_id
      AND s.status = 'active'
      AND os.shop_id IS NULL
  `)
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: we don't want to null out shop_id
}
