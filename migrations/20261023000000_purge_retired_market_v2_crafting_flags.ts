import type { Knex } from "knex"

/**
 * Re-purges the retired `market_v2` and `crafting` flags.
 *
 * 20260722040000_retire_market_v2_crafting_flags already deleted their rows,
 * but until this commit the backend could re-create `user_feature_overrides`
 * rows for them: POST /api/v2/debug/feature-flag accepted
 * `{ market_version }` (written as a `market_v2` override) and any
 * `{ flag_name }`, and the admin override endpoint accepted any flag name.
 * Those write paths are gone / now require a feature_flag_config row, so this
 * clears anything written in between.
 *
 * Data-only and idempotent: deleting rows that are already gone is a no-op.
 * `user_preferences` (the pre-multi-flag market_version table) is left alone;
 * nothing reads it any more and dropping it is a separate schema change.
 *
 * Down is a no-op: nothing reads these flags, so there is nothing to restore.
 */
const RETIRED_FLAGS = ["market_v2", "crafting"]

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("user_feature_overrides")) {
    await knex("user_feature_overrides").whereIn("flag_name", RETIRED_FLAGS).del()
  }
  if (await knex.schema.hasTable("feature_flag_config")) {
    await knex("feature_flag_config").whereIn("flag_name", RETIRED_FLAGS).del()
  }
}

export async function down(): Promise<void> {
  // Intentionally empty — see header.
}
