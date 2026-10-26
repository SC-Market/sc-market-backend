import type { Knex } from "knex"

/**
 * "New public contract" notifications:
 * - notification action `public_contract_create` (entity public_contracts),
 *   used by webhook subscriptions (webhook_actions) and the in-app/push
 *   alert's preference rows;
 * - contract_alert_subscriptions: users who opted in to an in-app + push
 *   alert for new public contracts, personally or for an org they belong to,
 *   optionally only for some contract kinds (NULL = every kind);
 * - discord_channel_setups.contracts: channels that get the public contract
 *   feed (/setup contracts in the bot).
 *
 * Idempotent; every statement is guarded. discord_channel_setups is small and
 * cold; lock_timeout keeps this from queueing behind traffic.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")

  await knex.raw(`
    INSERT INTO notification_actions (action_type_id, action, entity)
    SELECT (SELECT COALESCE(MAX(action_type_id), 0) + 1 FROM notification_actions),
           'public_contract_create', 'public_contracts'
    WHERE NOT EXISTS (SELECT 1 FROM notification_actions WHERE action = 'public_contract_create')
  `)

  if (!(await knex.schema.hasTable("contract_alert_subscriptions"))) {
    await knex.schema.createTable("contract_alert_subscriptions", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"))
      table.uuid("user_id").notNullable().references("user_id").inTable("accounts").onDelete("CASCADE")
      table
        .uuid("contractor_id")
        .nullable()
        .references("contractor_id")
        .inTable("contractors")
        .onDelete("CASCADE")
      table.specificType("kinds", "text[]").nullable()
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now())
    })
    // One subscription per user and scope (personal = NULL contractor).
    await knex.raw(`
      CREATE UNIQUE INDEX contract_alert_subscriptions_scope
        ON contract_alert_subscriptions (user_id, COALESCE(contractor_id, '00000000-0000-0000-0000-000000000000'::uuid))
    `)
  }

  await knex.raw(`
    ALTER TABLE discord_channel_setups ADD COLUMN IF NOT EXISTS contracts BOOLEAN NOT NULL DEFAULT false
  `)
  await knex.raw(`
    ALTER TABLE discord_channel_setups DROP CONSTRAINT IF EXISTS discord_channel_setups_has_a_kind
  `)
  await knex.raw(`
    ALTER TABLE discord_channel_setups
      ADD CONSTRAINT discord_channel_setups_has_a_kind CHECK (threads OR alerts OR contracts)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DELETE FROM discord_channel_setups WHERE NOT (threads OR alerts)`)
  await knex.raw(`ALTER TABLE discord_channel_setups DROP CONSTRAINT IF EXISTS discord_channel_setups_has_a_kind`)
  await knex.raw(`ALTER TABLE discord_channel_setups ADD CONSTRAINT discord_channel_setups_has_a_kind CHECK (threads OR alerts)`)
  await knex.raw(`ALTER TABLE discord_channel_setups DROP COLUMN IF EXISTS contracts`)
  await knex.schema.dropTableIfExists("contract_alert_subscriptions")
  await knex("notification_actions").where({ action: "public_contract_create" }).delete()
}
