import type { Knex } from "knex"

/**
 * admin_alerts.channels: the delivery channels the admin chose for an alert
 * (in-app always; push, email, Discord DM optional). Existing alerts keep
 * today's behaviour (in-app, push, email). Adding a column with a constant
 * default is a catalog-only change; admin_alerts is a small table.
 * Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw(`
    ALTER TABLE admin_alerts
      ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT '{in_app,push,email}'
  `)
  await knex.raw(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_alerts_channels_check') THEN
        ALTER TABLE admin_alerts ADD CONSTRAINT admin_alerts_channels_check
          CHECK (channels <@ ARRAY['in_app','push','email','discord_dm']::text[] AND 'in_app' = ANY (channels));
      END IF;
    END $$;
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("SET LOCAL lock_timeout = '5s'")
  await knex.raw("ALTER TABLE admin_alerts DROP CONSTRAINT IF EXISTS admin_alerts_channels_check")
  await knex.raw("ALTER TABLE admin_alerts DROP COLUMN IF EXISTS channels")
}
