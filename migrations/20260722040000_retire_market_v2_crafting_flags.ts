import type { Knex } from "knex"

/**
 * Retires the `market_v2` and `crafting` feature flags. Both are fully rolled
 * out and their gating logic has been removed from the frontend — they are
 * always-on. Deleting their feature_flag_config rows removes them from the
 * admin feature-flags panel and the getAllFlags map so they no longer surface
 * as toggleable. Per-user overrides for these flags are also cleared.
 *
 * Down re-seeds them enabled (their effective always-on state), NOT disabled —
 * disabling them would have no effect since nothing reads them anymore, but
 * enabled is the honest representation of current behavior.
 */
export async function up(knex: Knex): Promise<void> {
  // Clear any per-user overrides first.
  const hasOverrides = await knex.schema.hasTable("user_feature_overrides")
  if (hasOverrides) {
    await knex("user_feature_overrides")
      .whereIn("flag_name", ["market_v2", "crafting"])
      .del()
  }

  await knex("feature_flag_config")
    .whereIn("flag_name", ["market_v2", "crafting"])
    .del()
}

export async function down(knex: Knex): Promise<void> {
  for (const flag_name of ["market_v2", "crafting"]) {
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
