import type { Knex } from "knex"

/**
 * dm_campaign_feedback: the optional answer on the "Still selling?" landing
 * page (services/dm-campaigns/still-selling-feedback.ts), one row per link:
 * after "Pause them", why (reasons, picked from a fixed list, plus optional
 * free text); after "Keep them live", what would make selling easier.
 *
 * - token_id: sha256 of the link's token, UNIQUE: one answer per link.
 * - is_test: sent from a test link (the admin's "Send test DM to me"); kept
 *   apart from the real counts.
 * - Free text is stored with HTML stripped, at most 500 characters.
 *
 * Additive: one new, empty table. Idempotent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS dm_campaign_feedback (
      feedback_id BIGSERIAL PRIMARY KEY,
      campaign TEXT NOT NULL CHECK (campaign ~ '^[a-z0-9_]{1,64}$'),
      user_id UUID NOT NULL REFERENCES accounts(user_id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('keep', 'pause')),
      token_id TEXT NOT NULL UNIQUE CHECK (token_id ~ '^[0-9a-f]{64}$'),
      is_test BOOLEAN NOT NULL DEFAULT false,
      reasons TEXT[] NOT NULL DEFAULT '{}',
      about_sc_market TEXT NULL CHECK (length(about_sc_market) <= 500),
      other_text TEXT NULL CHECK (length(other_text) <= 500),
      easier_text TEXT NULL CHECK (length(easier_text) <= 500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS dm_campaign_feedback_campaign_idx
      ON dm_campaign_feedback (campaign, created_at DESC)
  `)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS dm_campaign_feedback_user_idx
      ON dm_campaign_feedback (user_id)
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS dm_campaign_feedback")
}
