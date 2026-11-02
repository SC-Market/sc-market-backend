import type { Knex } from "knex"

/**
 * Make the shop's `stock_subtraction_timing` order setting the one that
 * counts (services/allocation/stock-timing.service.ts), as
 * 20261026010000_shop_allocation_mode did for allocation_mode.
 *
 * V2 orders now follow the selling shop's setting. So that a seller who
 * chose a timing on their org or account settings page keeps it, copy each
 * enabled non-default org/user setting ('on_received' or 'dont_subtract';
 * 'on_accepted' is the default) onto every shop that org/user owns, unless
 * the shop already has its own row, which wins. The org/user rows stay.
 *
 * Copies keep the source row's created_at/updated_at, so down can tell them
 * from rows saved on the shop and remove only those.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    INSERT INTO order_settings (entity_type, entity_id, setting_type, message_content, enabled, created_at, updated_at)
    SELECT DISTINCT ON (s.shop_id) 'shop', s.shop_id, 'stock_subtraction_timing', os.message_content, true, os.created_at, os.updated_at
    FROM order_settings os
    JOIN shops s
      ON (os.entity_type = 'contractor' AND s.owner_contractor_id = os.entity_id)
      OR (os.entity_type = 'user' AND s.owner_user_id = os.entity_id)
    WHERE os.setting_type = 'stock_subtraction_timing'
      AND os.enabled = true
      AND os.message_content IN ('on_received', 'dont_subtract')
      AND NOT EXISTS (
        SELECT 1 FROM order_settings existing
        WHERE existing.entity_type = 'shop'
          AND existing.entity_id = s.shop_id
          AND existing.setting_type = 'stock_subtraction_timing'
      )
    ORDER BY s.shop_id, os.updated_at DESC
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE FROM order_settings copy
    USING shops s, order_settings os
    WHERE copy.entity_type = 'shop'
      AND copy.setting_type = 'stock_subtraction_timing'
      AND copy.entity_id = s.shop_id
      AND os.setting_type = 'stock_subtraction_timing'
      AND ((os.entity_type = 'contractor' AND s.owner_contractor_id = os.entity_id)
        OR (os.entity_type = 'user' AND s.owner_user_id = os.entity_id))
      AND copy.message_content = os.message_content
      AND copy.created_at = os.created_at
      AND copy.updated_at = os.updated_at
  `)
}
