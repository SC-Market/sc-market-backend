import type { Knex } from "knex"

/**
 * Missions keep their identity across game-data imports.
 *
 * The import used to delete every mission of the version and insert them
 * again, so each import gave every mission a new mission_id and
 * ON DELETE CASCADE wiped mission_completions and mission_ratings. The import
 * now upserts by mission_code and deactivates the missions a patch drops:
 *
 * - missions.is_active (default true): false once an import no longer has
 *   the mission; listings, hubs and the sitemap leave those out, its detail
 *   page and its completions/ratings stay.
 * - missions.removed_in_version: the game version that dropped it.
 *
 * Idempotent (IF NOT EXISTS). missions is a game-data table, not hot.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE missions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`,
  )
  await knex.raw(
    `ALTER TABLE missions ADD COLUMN IF NOT EXISTS removed_in_version varchar(200)`,
  )
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_missions_version_active ON missions (version_id) WHERE is_active`,
  )
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS idx_missions_version_active`)
  await knex.raw(
    `ALTER TABLE missions DROP COLUMN IF EXISTS removed_in_version`,
  )
  await knex.raw(`ALTER TABLE missions DROP COLUMN IF EXISTS is_active`)
}
