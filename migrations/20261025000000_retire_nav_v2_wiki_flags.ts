import type { Knex } from "knex"

/**
 * Retires the `nav_v2` and `wiki` feature flags. Both are fully rolled out and
 * the frontend no longer gates on either: SidebarV2 and the wiki navigation are
 * always on. Deleting their feature_flag_config rows removes them from the
 * admin feature-flags panel and from the GET /api/v2/debug/feature-flag map;
 * their per-user overrides are cleared too, so no user is left pinned to the
 * legacy treatment.
 *
 * A frontend bundle that still reads these flags fills any flag the server did
 * not send from its DEFAULT_FLAGS, where both are `true` (wiki since
 * 2026-07-20, nav_v2 since 2026-08-25), so it keeps the always-on behaviour.
 *
 * Data-only and idempotent: deleting rows that are already gone is a no-op.
 *
 * Down re-seeds them enabled/100% (their effective always-on state), as
 * 20260722040000_retire_market_v2_crafting_flags does. Overrides are not
 * restored.
 */
const RETIRED_FLAGS = ["nav_v2", "wiki"]

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("user_feature_overrides")) {
    await knex("user_feature_overrides").whereIn("flag_name", RETIRED_FLAGS).del()
  }
  if (await knex.schema.hasTable("feature_flag_config")) {
    await knex("feature_flag_config").whereIn("flag_name", RETIRED_FLAGS).del()
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const flag_name of RETIRED_FLAGS) {
    const existing = await knex("feature_flag_config")
      .where("flag_name", flag_name)
      .first()
    if (!existing) {
      await knex("feature_flag_config").insert({
        flag_name,
        enabled: true,
        default_version: "V2",
        rollout_percentage: 100,
      })
    }
  }
}
