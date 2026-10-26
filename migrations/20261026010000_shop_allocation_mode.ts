import { Knex } from "knex"

/**
 * Make the shop's `allocation_mode` order setting the only one that counts.
 *
 * Shop Settings › Orders saves allocation_mode on the shop, but order creation
 * read it from the owning org or user, so a mode chosen on the shop was
 * ignored. The read now uses the shop setting only (see
 * src/services/allocation/allocation-mode.service.ts). So that no seller's
 * behavior changes with that switch, copy each enabled non-default org/user
 * setting ('manual' or 'none'; 'auto' is the default anyway) onto every shop
 * that org/user owns, unless the shop already has its own allocation_mode
 * row, which wins.
 *
 * The org/user rows are left in place, unread.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO order_settings (entity_type, entity_id, setting_type, message_content, enabled, created_at, updated_at)
    SELECT 'shop', s.shop_id, 'allocation_mode', os.message_content, true, now(), now()
    FROM order_settings os
    JOIN shops s
      ON (os.entity_type = 'contractor' AND s.owner_contractor_id = os.entity_id)
      OR (os.entity_type = 'user' AND s.owner_user_id = os.entity_id)
    WHERE os.setting_type = 'allocation_mode'
      AND os.enabled = true
      AND os.message_content IN ('manual', 'none')
      AND NOT EXISTS (
        SELECT 1 FROM order_settings existing
        WHERE existing.entity_type = 'shop'
          AND existing.entity_id = s.shop_id
          AND existing.setting_type = 'allocation_mode'
      )
  `)
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: copied rows can't be told apart from ones saved on the shop.
}
