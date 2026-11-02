import type { Knex } from "knex"

/**
 * dm_campaign_recipients: one row per (campaign, user) for one-off Discord DM
 * campaigns sent by staff (services/dm-campaigns), first used for the
 * "Still selling?" DM to inactive sellers with stale listings.
 *
 * The primary key (campaign, user_id) is the "one DM per person per campaign,
 * ever" rule: the sender claims the row before it sends and never retries.
 *
 * - listing_ids: the stale listings the DM was about (what its buttons act on;
 *   each action re-checks that the user may still manage each one).
 * - status: sending (claimed, DM in flight or the process stopped mid-send:
 *   never retried) | delivered | failed; error_code / http_status from
 *   Discord when it failed (50007: DMs closed or no shared server).
 * - kept_* / paused_*: when the recipient first used "Keep them live" /
 *   "Pause them", and how many listings the last use changed.
 *
 * Additive: one new, empty table. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS dm_campaign_recipients (
      campaign TEXT NOT NULL CHECK (campaign ~ '^[a-z0-9_]{1,64}$'),
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      listing_ids UUID[] NOT NULL DEFAULT '{}',
      locale TEXT NULL,
      status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'delivered', 'failed')),
      error_code INTEGER NULL,
      http_status INTEGER NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at TIMESTAMPTZ NULL,
      kept_at TIMESTAMPTZ NULL,
      kept_count INTEGER NULL,
      paused_at TIMESTAMPTZ NULL,
      paused_count INTEGER NULL,
      PRIMARY KEY (campaign, user_id)
    )
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS dm_campaign_recipients_user_idx
      ON dm_campaign_recipients (user_id)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS dm_campaign_recipients")
}
