import { Knex } from "knex"

/**
 * The Shops refactor made order_settings entity-scopable to shops
 * (ShopsV2Controller inserts rows with entity_type = 'shop'), but the original
 * order_settings_entity_type_check constraint only permitted 'user' and
 * 'contractor'. Those inserts fail with:
 *   new row for relation "order_settings" violates check constraint
 *   "order_settings_entity_type_check"
 *
 * Widen the constraint to include 'shop'. Recreated under the same
 * auto-generated name so it stays consistent with the original definition.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE order_settings DROP CONSTRAINT IF EXISTS order_settings_entity_type_check`,
  )
  await knex.raw(
    `ALTER TABLE order_settings ADD CONSTRAINT order_settings_entity_type_check CHECK (entity_type IN ('user', 'contractor', 'shop'))`,
  )
}

export async function down(knex: Knex): Promise<void> {
  // Remove shop-scoped rows before narrowing the constraint back, otherwise the
  // ADD CONSTRAINT would fail validation against existing data.
  await knex.raw(`DELETE FROM order_settings WHERE entity_type = 'shop'`)
  await knex.raw(
    `ALTER TABLE order_settings DROP CONSTRAINT IF EXISTS order_settings_entity_type_check`,
  )
  await knex.raw(
    `ALTER TABLE order_settings ADD CONSTRAINT order_settings_entity_type_check CHECK (entity_type IN ('user', 'contractor'))`,
  )
}
