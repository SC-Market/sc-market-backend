import type { Knex } from "knex"

/**
 * Seeds the `customizable_dashboard` feature flag into feature_flag_config so it
 * becomes a first-class flag: it appears in the `flags` map returned by
 * GET /api/v2/debug/feature-flag, shows up in the admin feature-flags panel, and
 * supports a global default / percentage rollout. Per-user overrides work without
 * this row, but the flag only surfaces (and becomes manageable via the admin
 * panel) once a config row exists — getAllFlags iterates feature_flag_config rows
 * only, and there is no API to create the row.
 *
 * Seeded off by default; roll out via the admin panel (per-user override first,
 * then percentage). Mirrors the nav_v2 seed.
 */
export async function up(knex: Knex): Promise<void> {
  const existing = await knex("feature_flag_config")
    .where("flag_name", "customizable_dashboard")
    .first()

  if (!existing) {
    await knex("feature_flag_config").insert({
      flag_name: "customizable_dashboard",
      enabled: false, // off by default; enable per-user override or roll out gradually
      default_version: "V1",
      rollout_percentage: 0,
    })
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex("feature_flag_config")
    .where("flag_name", "customizable_dashboard")
    .del()
}
